"""Tests for Stabilizer: debounce, duplicate suppression, re-arm."""
import pytest
from src.recognition.stabilizer import Stabilizer

LABELS = ["no", "yes", "drink", "fine", "hot"]
DEBOUNCE = 4
NEUTRAL  = 6


def make() -> Stabilizer:
    return Stabilizer(debounce=DEBOUNCE, conf_thresh=0.6, neutral_frames=NEUTRAL)


# --- debounce fires only after N consistent frames -------------------------

def test_fires_after_debounce():
    s = make()
    results = [s.update(0, 0.9, LABELS) for _ in range(DEBOUNCE)]
    assert results[-1] == "no"
    assert all(r is None for r in results[:-1])


def test_no_fire_before_debounce():
    s = make()
    for _ in range(DEBOUNCE - 1):
        assert s.update(0, 0.9, LABELS) is None


def test_inconsistent_frames_reset_debounce():
    s = make()
    for _ in range(DEBOUNCE - 1):
        s.update(0, 0.9, LABELS)
    s.update(1, 0.9, LABELS)   # different label — resets window
    assert s.update(0, 0.9, LABELS) is None


# --- duplicate suppression -------------------------------------------------

def test_no_repeat_while_held():
    s = make()
    for _ in range(DEBOUNCE):
        s.update(0, 0.9, LABELS)
    # keep holding
    for _ in range(20):
        assert s.update(0, 0.9, LABELS) is None


def test_low_confidence_does_not_fire():
    s = make()
    for _ in range(DEBOUNCE * 2):
        assert s.update(0, 0.3, LABELS) is None


# --- re-arm after neutral position -----------------------------------------

def test_rearm_after_neutral():
    s = make()
    # fire once
    for _ in range(DEBOUNCE):
        s.update(0, 0.9, LABELS)
    # go neutral
    for _ in range(NEUTRAL):
        s.update(0, 0.0, LABELS)
    # sign again — should fire again
    results = [s.update(0, 0.9, LABELS) for _ in range(DEBOUNCE)]
    assert results[-1] == "no"


def test_no_rearm_before_enough_neutral_frames():
    s = make()
    for _ in range(DEBOUNCE):
        s.update(0, 0.9, LABELS)
    # only NEUTRAL-1 neutral frames — not enough
    for _ in range(NEUTRAL - 1):
        s.update(0, 0.0, LABELS)
    results = [s.update(0, 0.9, LABELS) for _ in range(DEBOUNCE)]
    assert all(r is None for r in results)


# --- label mapping ---------------------------------------------------------

def test_correct_label_returned():
    s = make()
    for _ in range(DEBOUNCE):
        s.update(2, 0.9, LABELS)   # index 2 = "drink"
    s2 = make()
    results = [s2.update(2, 0.9, LABELS) for _ in range(DEBOUNCE)]
    assert results[-1] == "drink"


def test_different_signs_fire_independently():
    s = make()
    for _ in range(DEBOUNCE):
        s.update(0, 0.9, LABELS)
    # neutral
    for _ in range(NEUTRAL):
        s.update(0, 0.0, LABELS)
    # different sign
    results = [s.update(1, 0.9, LABELS) for _ in range(DEBOUNCE)]
    assert results[-1] == "yes"


# --- reset -----------------------------------------------------------------

def test_reset_clears_state():
    s = make()
    for _ in range(DEBOUNCE):
        s.update(0, 0.9, LABELS)
    s.reset()
    results = [s.update(0, 0.9, LABELS) for _ in range(DEBOUNCE)]
    assert results[-1] == "no"   # fires again after reset
