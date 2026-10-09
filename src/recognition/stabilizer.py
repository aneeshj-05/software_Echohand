"""Prediction stabilization: debouncer + re-arm logic."""
from __future__ import annotations
from collections import deque
from src import config as C


class Stabilizer:
    """Commits a word only after DEBOUNCE_FRAMES consecutive confident frames.

    Re-arms (allows the same word again) after NEUTRAL_FRAMES frames with no
    confident prediction — so returning to a neutral position resets the lock.
    """

    def __init__(self, debounce=C.DEBOUNCE_FRAMES, conf_thresh=C.CONF_THRESHOLD,
                 neutral_frames=C.NEUTRAL_FRAMES):
        self.debounce      = debounce
        self.conf_thresh   = conf_thresh
        self.neutral_frames = neutral_frames

        self._recent: deque[int] = deque(maxlen=debounce)
        self._spoken: str | None = None   # last word sent to TTS
        self._neutral_count = 0

    # ------------------------------------------------------------------
    def update(self, label_idx: int, confidence: float, labels: list[str]) -> str | None:
        """Return a word to speak, or None.

        Returns a word exactly once per sign-hold. Returns None while the same
        sign is still held, and again after neutral re-arms the stabilizer.
        """
        if confidence < self.conf_thresh:
            self._recent.clear()
            self._neutral_count += 1
            if self._neutral_count >= self.neutral_frames:
                self._spoken = None          # re-arm: same word allowed again
            return None

        self._neutral_count = 0
        self._recent.append(label_idx)

        if len(self._recent) == self.debounce and len(set(self._recent)) == 1:
            word = labels[label_idx]
            if word != self._spoken:
                self._spoken = word
                return word          # fire once

        return None

    @property
    def current_label_idx(self) -> int | None:
        if self._recent:
            return self._recent[-1]
        return None

    def reset(self):
        self._recent.clear()
        self._spoken = None
        self._neutral_count = 0
