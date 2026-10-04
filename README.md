# EchoHand — Real-Time ASL Sign-to-Speech

Webcam → MediaPipe skeleton → pretrained LSTM → stabilized word → offline TTS.

Built on the pretrained model from [signspeak](https://github.com/UnmannedArchive/signspeak).
No training required.

---

## Model verification

The pretrained `sign_lstm.pt` ships directly from the signspeak repo (3.2 MB).
It was trained on 225 WLASL clips across **18 signs** using a bidirectional LSTM
over MediaPipe Holistic skeleton features. Reported held-out accuracy: **44.1%**
(~8× the 5.6% random baseline).

### Verified vocabulary (18 words — the model's actual labels)

| Label | Notes |
|-------|-------|
| `before` | |
| `candy` | |
| `computer` | |
| `deaf` | reliable per confusion matrix |
| `drink` | reliable |
| `fine` | |
| `finish` | confuses with `computer` |
| `hearing` | reliable |
| `hot` | |
| `kiss` | confuses with `deaf` |
| `like` | |
| `no` | reliable |
| `now` | reliable |
| `orange` | |
| `white` | |
| `who` | |
| `wrong` | |
| `yes` | reliable |

**Why not HELLO, PLEASE, THANK YOU, etc.?**
Those words are not in the pretrained model's label set. Mapping an unrelated
sign to a requested word would produce fabricated results. The 18 labels above
are the only ones the model was trained on.

---

## Ubuntu system packages

```bash
sudo apt-get install -y python3-espeak espeak libespeak1
# pyttsx3 uses espeak as its Linux TTS backend
```

---

## Installation

```bash
git clone <this-repo>
cd echohand_ASL

python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

# Download pretrained weights + MediaPipe model (~17 MB total)
python setup_assets.py
```

---

## Run

```bash
source .venv/bin/activate
python main.py
```

| Key | Action |
|-----|--------|
| `q` / `Esc` | Quit |
| `r` | Reset stabilizer (clear held sign) |

---

## How it works

```
webcam frame
  → MediaPipe HolisticLandmarker  (holistic_landmarker.task)
  → normalize_landmarks()          (shoulder-anchored, scale-invariant)
  → rolling 32-frame buffer
  → bidirectional LSTM             (sign_lstm.pt)
  → softmax top-1 + confidence
  → Stabilizer                     (8 consistent frames → commit)
  → Speaker (pyttsx3, daemon thread, async)
```

**Stabilizer logic:**
- A word is committed only after 8 consecutive frames agree with confidence ≥ 0.60.
- The same word is not re-spoken while the sign is held.
- After 12 frames with no confident prediction (neutral position), the stabilizer
  re-arms and the same sign can fire again.

---

## Project structure

```
echohand_ASL/
├── main.py                      # entry point
├── setup_assets.py              # downloads model files
├── requirements.txt
├── models/
│   ├── sign_lstm.pt             # pretrained weights (from signspeak)
│   ├── labels.json              # 18 class labels
│   └── holistic_landmarker.task # MediaPipe model
├── src/
│   ├── config.py                # constants (must match training)
│   ├── recognition/
│   │   ├── landmarks.py         # feature extraction (copied from signspeak)
│   │   ├── model.py             # LSTM definition + loader
│   │   └── stabilizer.py       # debounce + re-arm logic
│   ├── speech/
│   │   └── tts.py               # async pyttsx3 speaker
│   └── desktop/
│       └── hud.py               # OpenCV HUD overlay
└── tests/
    ├── test_stabilizer.py       # 10 automated tests
    ├── test_tts.py              # 5 automated tests (pyttsx3 mocked)
    └── test_labels_and_landmarks.py  # 8 automated tests
```

---

## Automated tests

```bash
source .venv/bin/activate
python -m pytest tests/ -v
```

**23 tests, all automated (no webcam needed):**

| File | What is tested |
|------|---------------|
| `test_stabilizer.py` | debounce fires after N frames, not before; inconsistent frames reset window; duplicate suppression while held; re-arm after neutral; no re-arm before enough neutral frames; correct label returned; different signs independent; reset clears state |
| `test_tts.py` | same word not re-queued; different words both queued; speak() returns immediately (non-blocking); pyttsx3 say() called; rate/volume set |
| `test_labels_and_landmarks.py` | labels.json exists; 18 strings; expected words present; no duplicates; output shape; zero vector when pose absent; missing hand zero-filled; translation invariance |

---

## Manual hardware checklist

These require a webcam and speakers — run after `python main.py`:

- [ ] Window opens showing live mirrored webcam feed
- [ ] Skeleton overlay (yellow pose, green/blue hands) appears when you stand in frame
- [ ] Buffer fill bar (top-right) fills as you hold a pose
- [ ] Top-3 live guesses appear in bottom-left with confidence %
- [ ] Signing `YES` (nodding fist) commits the word and displays it top-left
- [ ] `YES` is spoken aloud via speakers
- [ ] Holding `YES` does NOT repeat the speech
- [ ] Returning to neutral and signing `YES` again speaks it a second time
- [ ] Signing `NO` (two-finger shake) commits and speaks "no"
- [ ] Signing `DRINK` (thumb-to-mouth) commits and speaks "drink"
- [ ] `r` key resets the stabilizer mid-sign
- [ ] `q` / `Esc` closes the window cleanly

---

## Known limitations

- 44.1% held-out accuracy on 18 classes. Expect misclassifications, especially
  `finish`↔`computer` and `kiss`↔`deaf`.
- Model was trained on WLASL dataset signers; your webcam appearance may differ
  (domain gap). The skeleton normalization reduces but does not eliminate this.
- Requires good lighting and a clear upper-body view.
- Only isolated word recognition — no grammar, no sentence structure.
