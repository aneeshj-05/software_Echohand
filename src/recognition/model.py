"""LSTM classifier — identical architecture to signspeak so weights load cleanly."""
from __future__ import annotations
import json
from pathlib import Path
import torch
import torch.nn as nn
from src import config as C


class SignLSTM(nn.Module):
    def __init__(self, num_classes, input_dim=C.FEATURE_DIM,
                 hidden=C.LSTM_HIDDEN, layers=C.LSTM_LAYERS,
                 dropout=C.LSTM_DROPOUT, bidirectional=True):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_dim, hidden_size=hidden, num_layers=layers,
            batch_first=True, dropout=dropout if layers > 1 else 0.0,
            bidirectional=bidirectional,
        )
        feat = hidden * (2 if bidirectional else 1)
        self.head = nn.Sequential(
            nn.LayerNorm(feat), nn.Dropout(dropout), nn.Linear(feat, num_classes),
        )

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.head(out.mean(dim=1))


def load_model(weights_path=C.MODEL_WEIGHTS, labels_path=C.LABELS_JSON, device="cpu"):
    labels = json.loads(Path(labels_path).read_text())
    ckpt   = torch.load(weights_path, map_location=device, weights_only=True)
    model  = SignLSTM(num_classes=ckpt["num_classes"])
    model.load_state_dict(ckpt["state_dict"])
    model.to(device).eval()
    return model, labels
