"""Tests for label mapping and landmark normalization math."""
import json
import numpy as np
import pytest
from pathlib import Path
from src.recognition.landmarks import normalize_landmarks
from src import config as C

LABELS_PATH = C.LABELS_JSON


# --- label file ------------------------------------------------------------

def test_labels_file_exists():
    assert LABELS_PATH.exists(), f"labels.json not found at {LABELS_PATH}"


def test_labels_are_18_strings():
    labels = json.loads(LABELS_PATH.read_text())
    assert len(labels) == 18
    assert all(isinstance(l, str) for l in labels)


def test_expected_labels_present():
    labels = json.loads(LABELS_PATH.read_text())
    for word in ("no", "yes", "drink", "fine", "hot", "like", "now", "who", "wrong"):
        assert word in labels, f"'{word}' missing from labels"


def test_no_duplicate_labels():
    labels = json.loads(LABELS_PATH.read_text())
    assert len(labels) == len(set(labels))


# --- normalize_landmarks math ----------------------------------------------

def _dummy_pose(l_shoulder=(0.3, 0.5, 0), r_shoulder=(0.7, 0.5, 0)):
    pose = np.zeros((C.NUM_POSE, 4), dtype=np.float32)
    pose[C.L_SHOULDER, :3] = l_shoulder
    pose[C.R_SHOULDER, :3] = r_shoulder
    return pose


def test_output_shape():
    pose = _dummy_pose()
    lh   = np.random.rand(C.NUM_HAND, 3).astype(np.float32)
    rh   = np.random.rand(C.NUM_HAND, 3).astype(np.float32)
    vec  = normalize_landmarks(pose, lh, rh)
    assert vec.shape == (C.FEATURE_DIM,)


def test_zero_vector_when_pose_absent():
    pose = _dummy_pose()
    lh   = np.zeros((C.NUM_HAND, 3), dtype=np.float32)
    rh   = np.zeros((C.NUM_HAND, 3), dtype=np.float32)
    vec  = normalize_landmarks(pose, lh, rh, pose_present=False)
    assert np.all(vec == 0)


def test_missing_hand_zero_filled():
    pose = _dummy_pose()
    lh   = np.random.rand(C.NUM_HAND, 3).astype(np.float32)
    rh   = np.random.rand(C.NUM_HAND, 3).astype(np.float32)
    vec_no_lh = normalize_landmarks(pose, lh, rh, lh_present=False)
    assert np.all(vec_no_lh[C.LH_SLICE] == 0)
    assert not np.all(vec_no_lh[C.RH_SLICE] == 0)


def test_translation_invariance():
    """Shifting the entire signer in frame should not change the feature vector."""
    offset = np.array([-0.2, -0.3, 0], dtype=np.float32)

    # Build a realistic pose with random landmark positions
    pose1 = np.random.rand(C.NUM_POSE, 4).astype(np.float32)
    pose1[C.L_SHOULDER, :3] = [0.3, 0.5, 0]
    pose1[C.R_SHOULDER, :3] = [0.7, 0.5, 0]

    # Shift every pose landmark by the same offset
    pose2 = pose1.copy()
    pose2[:, :3] += offset

    lh = np.random.rand(C.NUM_HAND, 3).astype(np.float32)
    rh = np.random.rand(C.NUM_HAND, 3).astype(np.float32)

    v1 = normalize_landmarks(pose1, lh, rh)
    v2 = normalize_landmarks(pose2, lh + offset, rh + offset)
    np.testing.assert_allclose(v1, v2, atol=1e-5)
