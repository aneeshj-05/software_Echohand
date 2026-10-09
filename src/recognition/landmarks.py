"""Landmark extraction — pure numpy core + MediaPipe wrapper.

Copied faithfully from signspeak/asl/landmarks.py so the feature vectors
are identical to what the pretrained model was trained on.
"""
from __future__ import annotations
import numpy as np
from src import config as C

HAND_CONNECTIONS = [
    (0,1),(1,2),(2,3),(3,4),
    (0,5),(5,6),(6,7),(7,8),
    (5,9),(9,10),(10,11),(11,12),
    (9,13),(13,14),(14,15),(15,16),
    (13,17),(17,18),(18,19),(19,20),
    (0,17),
]
POSE_CONNECTIONS = [
    (11,12),(11,13),(13,15),(12,14),(14,16),(11,23),(12,24),(23,24),
]


def normalize_landmarks(pose, lh, rh,
                        pose_present=True, lh_present=True, rh_present=True):
    if not pose_present:
        return np.zeros(C.FEATURE_DIM, dtype=np.float32)

    pose = np.asarray(pose, dtype=np.float32)
    lh   = np.asarray(lh,   dtype=np.float32)
    rh   = np.asarray(rh,   dtype=np.float32)

    ref   = (pose[C.L_SHOULDER, :3] + pose[C.R_SHOULDER, :3]) / 2.0
    width = float(np.linalg.norm(pose[C.L_SHOULDER, :2] - pose[C.R_SHOULDER, :2]))
    if width < 1e-6:
        width = 1.0

    pose_xyz  = (pose[:, :3] - ref) / width
    pose_feat = np.concatenate([pose_xyz, pose[:, 3:4]], axis=1).reshape(-1)
    lh_feat   = ((lh - ref) / width).reshape(-1) if lh_present else np.zeros(C.LH_DIM, dtype=np.float32)
    rh_feat   = ((rh - ref) / width).reshape(-1) if rh_present else np.zeros(C.RH_DIM, dtype=np.float32)

    return np.concatenate([pose_feat, lh_feat, rh_feat]).astype(np.float32)


def arrays_from_result(result):
    pose = np.zeros((C.NUM_POSE, 4), dtype=np.float32)
    lh   = np.zeros((C.NUM_HAND, 3), dtype=np.float32)
    rh   = np.zeros((C.NUM_HAND, 3), dtype=np.float32)
    pose_present = lh_present = rh_present = False

    if getattr(result, "pose_landmarks", None):
        pts = result.pose_landmarks
        if len(pts) == C.NUM_POSE:
            pose = np.array([[p.x, p.y, p.z, getattr(p, "visibility", 0.0) or 0.0] for p in pts], dtype=np.float32)
            pose_present = True

    if getattr(result, "left_hand_landmarks", None):
        pts = result.left_hand_landmarks
        if len(pts) == C.NUM_HAND:
            lh = np.array([[p.x, p.y, p.z] for p in pts], dtype=np.float32)
            lh_present = True

    if getattr(result, "right_hand_landmarks", None):
        pts = result.right_hand_landmarks
        if len(pts) == C.NUM_HAND:
            rh = np.array([[p.x, p.y, p.z] for p in pts], dtype=np.float32)
            rh_present = True

    return pose, lh, rh, pose_present, lh_present, rh_present


class HolisticExtractor:
    def __init__(self, model_path=None, running_mode="VIDEO", min_conf=0.5):
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python.vision import (
            HolisticLandmarker, HolisticLandmarkerOptions, RunningMode,
        )
        self._mp = mp
        model_path = str(model_path or C.HOLISTIC_TASK)
        mode = {"IMAGE": RunningMode.IMAGE, "VIDEO": RunningMode.VIDEO}[running_mode]
        opts = HolisticLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            running_mode=mode,
            min_pose_detection_confidence=min_conf,
            min_pose_landmarks_confidence=min_conf,
            min_hand_landmarks_confidence=min_conf,
        )
        self.landmarker = HolisticLandmarker.create_from_options(opts)
        self.running_mode = running_mode

    def __call__(self, frame_bgr, timestamp_ms=None):
        import cv2
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        if self.running_mode == "VIDEO":
            if timestamp_ms is None:
                raise ValueError("VIDEO mode requires timestamp_ms")
            result = self.landmarker.detect_for_video(mp_image, int(timestamp_ms))
        else:
            result = self.landmarker.detect(mp_image)
        pose, lh, rh, pp, lhp, rhp = arrays_from_result(result)
        vec = normalize_landmarks(pose, lh, rh, pp, lhp, rhp)
        return vec, result, pp

    def close(self):
        self.landmarker.close()

    def __enter__(self):  return self
    def __exit__(self, *_): self.close()


def draw_overlay(frame, result):
    import cv2
    h, w = frame.shape[:2]
    def px(lm): return int(lm.x * w), int(lm.y * h)

    pose = getattr(result, "pose_landmarks", None)
    if pose and len(pose) == C.NUM_POSE:
        for a, b in POSE_CONNECTIONS:
            cv2.line(frame, px(pose[a]), px(pose[b]), (255, 200, 0), 2)
        for lm in pose:
            cv2.circle(frame, px(lm), 3, (255, 200, 0), -1)

    for hand, color in (
        (getattr(result, "left_hand_landmarks",  None), (80, 255, 80)),
        (getattr(result, "right_hand_landmarks", None), (80, 180, 255)),
    ):
        if hand and len(hand) == C.NUM_HAND:
            for a, b in HAND_CONNECTIONS:
                cv2.line(frame, px(hand[a]), px(hand[b]), color, 2)
            for lm in hand:
                cv2.circle(frame, px(lm), 4, color, -1)
