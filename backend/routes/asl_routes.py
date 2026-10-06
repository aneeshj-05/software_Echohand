"""ASL inference endpoint — receives a base64 JPEG frame, returns predicted word."""
from __future__ import annotations
import base64
import sys
import os
import time
import logging
from collections import deque

from flask import Blueprint, request, jsonify

logger = logging.getLogger("echohand.asl")

asl_bp = Blueprint("asl", __name__, url_prefix="/api/asl")

# ── Ensure project root is on sys.path so src/ is importable ────────────────
_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _root not in sys.path:
    sys.path.insert(0, _root)

# ── Load model + labels once at import time (heavy, ~2s) ────────────────────
_model = None
_labels = None
_C = None

def _load_model_once():
    global _model, _labels, _C
    if _model is not None:
        return
    from src.recognition.model import load_model
    from src import config as C
    _model, _labels = load_model(device="cpu")
    _C = C
    logger.info("ASL model loaded — %d signs: %s", len(_labels), _labels)


# ── Per-session state (recreated on every /start call) ──────────────────────
_session: dict = {}


def _new_session():
    """Tear down any existing session and create a fresh one."""
    global _session

    # Close old extractor cleanly (MediaPipe VIDEO mode requires this)
    old_extractor = _session.get("extractor")
    if old_extractor is not None:
        try:
            old_extractor.close()
        except Exception:
            pass

    _load_model_once()

    from src.recognition.landmarks import HolisticExtractor
    from src.recognition.stabilizer import Stabilizer

    extractor = HolisticExtractor(running_mode="VIDEO")
    stabilizer = Stabilizer()
    buffer: deque = deque(maxlen=_C.SEQ_LEN)

    _session = {
        "extractor":  extractor,
        "stabilizer": stabilizer,
        "buffer":     buffer,
        "start_ts":   time.time(),
        "active":     True,
    }
    logger.info("New ASL session started")


def _close_session():
    global _session
    extractor = _session.get("extractor")
    if extractor is not None:
        try:
            extractor.close()
        except Exception:
            pass
    _session = {}
    logger.info("ASL session closed")


# ── Routes ───────────────────────────────────────────────────────────────────

@asl_bp.route("/start", methods=["POST"])
def start_session():
    """Start (or restart) a fresh inference session."""
    try:
        _new_session()
        return jsonify({"ok": True, "labels": _labels})
    except Exception as exc:
        logger.error("Failed to start ASL session: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 500


@asl_bp.route("/stop", methods=["POST"])
def stop_session():
    _close_session()
    return jsonify({"ok": True})


@asl_bp.route("/frame", methods=["POST"])
def process_frame():
    """
    Body: { "frame": "<base64-jpeg>" }
    Returns: { "word": "yes" | null, "top3": [[label, conf], ...], "buffer_fill": int }
    """
    if not _session.get("active"):
        return jsonify({"word": None, "top3": [], "buffer_fill": 0}), 200

    data = request.get_json(silent=True) or {}
    b64 = data.get("frame", "")
    if not b64:
        return jsonify({"word": None, "top3": [], "buffer_fill": 0}), 200

    try:
        import cv2, numpy as np
        img_bytes = base64.b64decode(b64.split(",")[-1])
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return jsonify({"word": None, "top3": [], "buffer_fill": 0}), 200

        s = _session
        ts_ms = int((time.time() - s["start_ts"]) * 1000)

        vec, _result, pose_present = s["extractor"](frame, timestamp_ms=ts_ms)
        if pose_present:
            s["buffer"].append(vec)

        word = None
        top3 = []
        buffer_fill = len(s["buffer"])

        if buffer_fill == _C.SEQ_LEN and pose_present:
            import torch, numpy as np
            x = torch.tensor(np.stack(s["buffer"])[None], dtype=torch.float32)
            with torch.no_grad():
                probs = torch.softmax(_model(x), dim=1)[0]
            vals, idxs = probs.topk(min(3, probs.shape[0]))
            top3 = [[_labels[int(i)], round(float(v), 3)]
                    for i, v in zip(idxs.tolist(), vals.tolist())]

            idx0, conf0 = int(idxs[0]), float(vals[0])
            committed = s["stabilizer"].update(idx0, conf0, _labels)
            if committed:
                word = committed
        elif not pose_present and buffer_fill > 0:
            # No pose detected — still run stabilizer with low confidence to advance neutral count
            s["stabilizer"].update(0, 0.0, _labels)

        return jsonify({"word": word, "top3": top3, "buffer_fill": buffer_fill})

    except Exception as exc:
        logger.warning("Frame processing error: %s", exc)
        return jsonify({"word": None, "top3": [], "buffer_fill": 0, "error": str(exc)}), 200
