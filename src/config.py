"""Shared constants — must match the pretrained model exactly."""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"

HOLISTIC_TASK = MODELS_DIR / "holistic_landmarker.task"
MODEL_WEIGHTS = MODELS_DIR / "sign_lstm.pt"
LABELS_JSON   = MODELS_DIR / "labels.json"

# Feature layout (must match signspeak training)
NUM_POSE   = 33
NUM_HAND   = 21
POSE_DIM   = NUM_POSE * 4   # 132
LH_DIM     = NUM_HAND * 3   # 63
RH_DIM     = NUM_HAND * 3   # 63
FEATURE_DIM = POSE_DIM + LH_DIM + RH_DIM  # 258

POSE_SLICE = slice(0, POSE_DIM)
LH_SLICE   = slice(POSE_DIM, POSE_DIM + LH_DIM)
RH_SLICE   = slice(POSE_DIM + LH_DIM, FEATURE_DIM)

L_SHOULDER = 11
R_SHOULDER = 12

# Sequence / model
SEQ_LEN      = 32
LSTM_HIDDEN  = 128
LSTM_LAYERS  = 2
LSTM_DROPOUT = 0.3

# Inference thresholds
CONF_THRESHOLD  = 0.60   # min softmax prob to accept a prediction
DEBOUNCE_FRAMES = 8      # consecutive consistent frames before committing
NEUTRAL_FRAMES  = 12     # frames with no confident prediction to re-arm
