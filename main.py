"""EchoHand — Real-Time ASL Sign-to-Speech

Run:  python main.py
Keys: q / Esc = quit   r = reset stabilizer
"""
from __future__ import annotations
import sys
import time
from collections import deque
from pathlib import Path

import cv2
import numpy as np
import torch

from src import config as C
from src.recognition.landmarks import HolisticExtractor, draw_overlay
from src.recognition.model import load_model
from src.recognition.stabilizer import Stabilizer
from src.speech.tts import Speaker
from src.desktop.hud import draw_hud


def _check_assets():
    missing = [p for p in (C.MODEL_WEIGHTS, C.LABELS_JSON, C.HOLISTIC_TASK) if not p.exists()]
    if missing:
        print("Missing required files:")
        for p in missing:
            print(f"  {p}")
        print("\nRun setup:")
        print("  python setup_assets.py")
        sys.exit(1)


def _topk(model, buffer, device, k=3):
    x = torch.tensor(np.stack(buffer)[None], dtype=torch.float32, device=device)
    with torch.no_grad():
        probs = torch.softmax(model(x), dim=1)[0]
    conf, idx = probs.topk(min(k, probs.shape[0]))
    return [(int(i), float(c)) for i, c in zip(idx.tolist(), conf.tolist())]


def main():
    _check_assets()

    device = "cpu"
    model, labels = load_model(device=device)
    print(f"Loaded model — {len(labels)} signs: {labels}")

    stabilizer = Stabilizer()
    speaker    = Speaker()

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        sys.exit("Could not open webcam (index 0).")

    buffer: deque[np.ndarray] = deque(maxlen=C.SEQ_LEN)
    committed: str | None = None
    topk: list[tuple[int, float]] = []
    fps = 0.0
    start = time.time()
    prev_t = start

    with HolisticExtractor(running_mode="VIDEO") as extractor:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame = cv2.flip(frame, 1)

            now   = time.time()
            ts_ms = int((now - start) * 1000)

            vec, result, pose_present = extractor(frame, timestamp_ms=ts_ms)
            if pose_present:
                buffer.append(vec)

            topk = []
            if len(buffer) == C.SEQ_LEN and pose_present:
                topk = _topk(model, buffer, device)
                idx, conf = topk[0]
                word = stabilizer.update(idx, conf, labels)
                if word:
                    committed = word
                    speaker.speak(word)

            draw_overlay(frame, result)
            draw_hud(frame, committed, topk, labels, len(buffer), fps)

            dt = now - prev_t
            prev_t = now
            if dt > 0:
                fps = 0.9 * fps + 0.1 / dt

            cv2.imshow("EchoHand — ASL Sign-to-Speech  (q=quit  r=reset)", frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            elif key == ord("r"):
                stabilizer.reset()
                committed = None

    cap.release()
    cv2.destroyAllWindows()
    speaker.stop()


if __name__ == "__main__":
    main()
