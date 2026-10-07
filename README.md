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

---

## Firebase Cloud Messaging (FCM) Integration

EchoHand replaces external manual messaging with automated, real-time push alerts via **Firebase Cloud Messaging**. When an emergency is triggered (via camera/glove HELP gesture or the emergency button), registered emergency contacts immediately receive an interactive push notification containing the user's live GPS coordinates and Google Maps link.

### 1. Architecture Overview

```
[HELP Gesture / Panic Button]
           ↓
window.EchoHandEmergency.triggerEmergency()
           ↓
Browser Geolocation API (lat, lng)
           ↓
POST /api/emergency/alert (JWT Authenticated)
           ↓
Flask Backend & Firebase Admin SDK
           ↓
Firebase Cloud Messaging (Multicast Web Push)
           ↓
Service Worker (frontend/firebase-messaging-sw.js)
           ↓
High-Priority Emergency Notification on Contact Devices
```

### 2. Firebase Setup Requirements

1. **Create a Firebase Project**:
   - Go to the [Firebase Console](https://console.firebase.google.com/) and create a project (e.g. `echohand-emergency`).
2. **Register Web App**:
   - In Project Settings, under **General**, add a Web application (e.g. `EchoHand Web`).
   - Copy the configuration object (`apiKey`, `projectId`, `messagingSenderId`, `appId`).
3. **Generate Web Push (VAPID) Key**:
   - In Project Settings, navigate to the **Cloud Messaging** tab.
   - Under **Web configuration** > **Web Push certificates**, click **Generate key pair**.
   - Copy the generated Public key (this is your `FIREBASE_VAPID_KEY`).
4. **Generate Firebase Admin Service Account Key**:
   - Navigate to **Project Settings** > **Service accounts**.
   - Select **Python** and click **Generate new private key**.
   - Save the downloaded JSON file **OUTSIDE** the project repository (e.g. `C:\Users\<user>\credentials\firebase-service-account.json` or `/etc/secrets/`).
   - **SECURITY NOTE**: Never commit or expose this private key file.

### 3. Environment Variable Configuration

Add the following to `backend/.env` (or set in your environment):

```bash
# Path to Firebase Admin service-account credentials JSON (outside repository)
FIREBASE_CREDENTIALS_PATH=C:\path\to\your\credentials\firebase-service-account.json
# Alternatively, standard Google ADC:
# GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\your\credentials\firebase-service-account.json

# Client-side Web Push configuration (safe for frontend exposure)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
FIREBASE_API_KEY=AIzaSy...
FIREBASE_APP_ID=1:...:web:...
FIREBASE_VAPID_KEY=BEl...
```

You can also update default fallback values in `frontend/js/firebase-config.js`.

### 4. How Emergency Contacts Register Their Devices

Emergency contacts can register their phone or computer browser to receive alerts without needing an EchoHand account password:

1. **Self-Registration (Logged-in User on Contact Device)**:
   - On `dashboard.html`, click the emergency panic button or open the emergency modal.
   - Click **📱 Enable on This Device** next to the contact's name, or **🔔 Enable Emergency Notifications** in the modal footer.
   - The browser prompts for notification permissions → click **Allow**.
   - The device FCM token is securely registered with MongoDB Atlas for that contact.
2. **One-Click Invite Link (Remote Family / Friends)**:
   - On `dashboard.html` in the emergency modal, click **🔗 Share Invite Link** next to any contact.
   - A cryptographically signed 7-day registration link is generated (e.g. `http://localhost:5000/dashboard.html?invite=<token>`).
   - Send this link to your contact via WhatsApp, SMS, or email.
   - When the contact opens the link, EchoHand shows an **Emergency Alert Device Registration** prompt.
   - The contact clicks **Enable Emergency Notifications on This Device** and selects **Allow**.
   - Their device is instantly linked to your account.

### 5. Running the Backend Server

Start the Flask server:

```bash
# Windows
python backend/app.py

# Or with batch script
run_server.bat
```

Access the dashboard at `http://localhost:5000/dashboard.html`.

### 6. How to Test Emergency Alerts

1. **Manual Emergency Button**:
   - Click the large red **EMERGENCY HELP** button on `dashboard.html`.
   - The modal opens and status displays: `"Getting your location…"`, followed by `"Sending emergency alert via Firebase Cloud Messaging…"`.
   - Your registered device immediately receives an audible notification with the title `🚨 EchoHand Emergency Alert`.
2. **HELP Gesture Detection**:
   - In camera or glove mode, sign **HELP** (or input simulated HELP signal).
   - `window.EchoHandEmergency.onHelpGesture()` automatically triggers the alert workflow with 30-second cooldown protection against repeated bursts.
   - Synthesized speech will announce: *"Help gesture detected. Sending emergency alert."*
3. **GPS Coordinates & Google Maps**:
   - Geolocation coordinates are captured and formatted as `https://www.google.com/maps?q=LAT,LNG`.
   - Clicking the push notification directly opens the location in Google Maps.

### 7. Automated Test Suite

Run the FCM and authentication tests:

```bash
python -m unittest discover tests -v
```

All 29 tests run in isolated mock mode and do not consume real Firebase or SMS credits.

### 8. Browser Push Notification Notes & Limitations

- **HTTPS vs. Localhost**: Browsers only permit Push Notifications and Service Workers on `localhost` (`http://127.0.0.1`) and secure `https://` domains.
- **Background Notifications**: The Service Worker (`frontend/firebase-messaging-sw.js`) receives messages even when EchoHand tabs are closed, as long as the browser is running.
- **Mobile Browsers**:
  - Android Chrome / Firefox support Web Push natively.
  - iOS Safari (16.4+) requires the user to choose **"Add to Home Screen"** before allowing Web Push notifications.

