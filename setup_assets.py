"""Download pretrained model weights and MediaPipe task file."""
import urllib.request
from pathlib import Path

MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

ASSETS = {
    "sign_lstm.pt": (
        "https://raw.githubusercontent.com/UnmannedArchive/signspeak/main/models/sign_lstm.pt",
        3_197_787,
    ),
    "labels.json": (
        "https://raw.githubusercontent.com/UnmannedArchive/signspeak/main/models/labels.json",
        193,
    ),
    "holistic_landmarker.task": (
        "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/"
        "holistic_landmarker/float16/latest/holistic_landmarker.task",
        None,   # size varies
    ),
}


def download(name, url, expected_size):
    dest = MODELS_DIR / name
    if dest.exists():
        size = dest.stat().st_size
        if expected_size is None or size >= expected_size * 0.95:
            print(f"  {name} already present ({size:,} bytes) — skipping")
            return
        print(f"  {name} looks incomplete ({size:,} bytes), re-downloading…")

    print(f"  Downloading {name} …")
    urllib.request.urlretrieve(url, dest)
    print(f"  Done: {dest.stat().st_size:,} bytes")


if __name__ == "__main__":
    print("Fetching model assets into models/")
    for name, (url, size) in ASSETS.items():
        download(name, url, size)
    print("\nAll assets ready.")
