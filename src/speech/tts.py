"""Asynchronous offline TTS using pyttsx3.

Speech runs in a dedicated daemon thread so the webcam loop is never blocked.
Duplicate suppression: the same word is not re-queued while it is already
playing or queued.
"""
from __future__ import annotations
import queue
import threading


class Speaker:
    def __init__(self, rate: int = 150, volume: float = 1.0):
        self._q: queue.Queue[str | None] = queue.Queue()
        self._last: str | None = None
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._rate   = rate
        self._volume = volume
        self._thread.start()

    # ------------------------------------------------------------------
    def speak(self, word: str) -> None:
        """Queue a word for speech. No-op if the same word is already queued."""
        if word and word != self._last:
            self._last = word
            self._q.put(word)

    def stop(self) -> None:
        self._q.put(None)   # sentinel

    # ------------------------------------------------------------------
    def _worker(self) -> None:
        import pyttsx3
        engine = pyttsx3.init()
        engine.setProperty("rate",   self._rate)
        engine.setProperty("volume", self._volume)
        while True:
            word = self._q.get()
            if word is None:
                break
            engine.say(word)
            engine.runAndWait()
            # Allow the same word again once it has finished playing
            if self._last == word:
                self._last = None
