"""OpenCV HUD drawing helpers."""
from __future__ import annotations
import cv2
import numpy as np
from src import config as C


def draw_hud(frame: np.ndarray, committed: str | None, topk: list[tuple[int, float]],
             labels: list[str], buf_len: int, fps: float) -> None:
    h, w = frame.shape[:2]

    # Top banner
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 80), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    word = committed or "—"
    cv2.putText(frame, word, (20, 58), cv2.FONT_HERSHEY_SIMPLEX, 1.6,
                (255, 255, 255), 3, cv2.LINE_AA)

    # Live top-3 guesses
    y0 = h - 90
    for rank, (idx, conf) in enumerate(topk[:3]):
        shade = 235 if rank == 0 else max(100, 180 - rank * 40)
        cv2.putText(frame, f"{labels[idx]:<12s} {conf:4.0%}",
                    (20, y0 + rank * 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    (shade, shade, shade), 1, cv2.LINE_AA)

    # Buffer fill bar
    bar_w = int((buf_len / C.SEQ_LEN) * 160)
    cv2.rectangle(frame, (w - 180, 18), (w - 20, 30), (80, 80, 80), 1)
    cv2.rectangle(frame, (w - 180, 18), (w - 180 + bar_w, 30), (80, 220, 80), -1)
    cv2.putText(frame, f"{fps:4.0f} fps", (w - 100, 52),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1, cv2.LINE_AA)

    # Controls hint
    cv2.putText(frame, "q=quit  r=reset", (w - 160, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (140, 140, 140), 1, cv2.LINE_AA)
