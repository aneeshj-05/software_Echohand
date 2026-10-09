"""Tests for TTS Speaker: async dispatch, duplicate suppression."""
import queue
import threading
import time
from unittest.mock import MagicMock, patch, call
import pytest
from src.speech.tts import Speaker


def _drain_queue(spk: Speaker, timeout=1.0):
    """Wait until the speaker's queue is empty."""
    deadline = time.time() + timeout
    while not spk._q.empty() and time.time() < deadline:
        time.sleep(0.05)


# --- duplicate suppression -------------------------------------------------

def test_same_word_not_requeued():
    spoken = []

    def fake_worker(self):
        try:
            import pyttsx3
        except ImportError:
            pass
        while True:
            word = self._q.get()
            if word is None:
                break
            spoken.append(word)
            self._last = None   # simulate playback finished

    with patch.object(Speaker, "_worker", fake_worker):
        spk = Speaker()
        spk.speak("yes")
        spk.speak("yes")   # duplicate — should be ignored
        spk.stop()
        spk._thread.join(timeout=2)

    assert spoken.count("yes") == 1


def test_different_words_both_queued():
    spoken = []

    def fake_worker(self):
        while True:
            word = self._q.get()
            if word is None:
                break
            spoken.append(word)
            self._last = None

    with patch.object(Speaker, "_worker", fake_worker):
        spk = Speaker()
        spk.speak("yes")
        spk._last = None   # simulate first word finished
        spk.speak("no")
        spk.stop()
        spk._thread.join(timeout=2)

    assert "yes" in spoken
    assert "no" in spoken


# --- async: main thread not blocked ----------------------------------------

def test_speak_returns_immediately():
    """speak() must return before TTS finishes (non-blocking)."""
    events = []

    def fake_worker(self):
        while True:
            word = self._q.get()
            if word is None:
                break
            time.sleep(0.3)   # simulate slow TTS
            events.append("done")
            self._last = None

    with patch.object(Speaker, "_worker", fake_worker):
        spk = Speaker()
        t0 = time.time()
        spk.speak("drink")
        elapsed = time.time() - t0
        spk.stop()
        spk._thread.join(timeout=2)

    assert elapsed < 0.1, f"speak() blocked for {elapsed:.3f}s"


# --- pyttsx3 engine calls (mocked) -----------------------------------------

def test_pyttsx3_say_called():
    """Verify the worker calls engine.say() and engine.runAndWait()."""
    mock_engine = MagicMock()

    with patch("pyttsx3.init", return_value=mock_engine):
        spk = Speaker()
        spk.speak("hot")
        spk.stop()
        spk._thread.join(timeout=2)

    mock_engine.say.assert_called_once_with("hot")
    mock_engine.runAndWait.assert_called_once()


def test_pyttsx3_rate_and_volume_set():
    mock_engine = MagicMock()

    with patch("pyttsx3.init", return_value=mock_engine):
        spk = Speaker(rate=160, volume=0.8)
        spk.stop()
        spk._thread.join(timeout=2)

    calls = mock_engine.setProperty.call_args_list
    assert call("rate", 160)   in calls
    assert call("volume", 0.8) in calls
