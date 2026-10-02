# EchoHand

**EchoHand** is a smart assistive system designed for individuals with speech and hearing disabilities. It detects hand gestures and converts them into spoken audio and text, while also providing an emergency response alert mechanism.

---

## 📌 Problem Statement

Individuals with speech and hearing impairments face significant barriers when communicating in daily life, especially with those who do not understand sign language. In addition, during emergencies, expressing urgent needs and location details quickly is challenging, which can delay vital assistance.

---

## 💡 Proposed Solution

**EchoHand** provides an assistive communication and emergency bridge:
- **Gesture-to-Speech Translation**: Accurately recognizes gestures from multiple input sources and converts them to text and natural speech.
- **Emergency Alert System**: Automatically captures the user's real-time location and dispatches an SOS alert via WhatsApp to designated emergency contacts upon trigger.
- **Accessible Web Platform**: Offers an intuitive portal featuring real-time detection, history, contact management, and user profiles.

---

## 🌟 Main Features

- **Multi-Modal Gesture Recognition**:
  - Image upload detection
  - Live webcam stream detection
  - Hardware smart glove integration
- **Text-to-Speech (TTS) Conversion**:
  - Instant voice synthesis of recognized gestures
- **Emergency SOS System**:
  - One-click SOS button & emergency gesture recognition
  - Real-time GPS location retrieval
  - Instant WhatsApp alert dispatch to emergency contacts
- **User Portal**:
  - Landing page, Authentication (Sign In / Sign Up), Dashboard, Gesture Detection interfaces, Emergency Contact settings, and Profile.

---

## 🖐️ Gesture Detection Approaches

EchoHand supports three distinct detection channels:

1. **Image Upload**:
   - Upload static images of hand gestures for instant recognition and audio playback.
2. **Real-Time Camera**:
   - Continuous gesture tracking via computer vision using webcam/mobile camera stream.
3. **Hardware Glove**:
   - Wearable glove equipped with flex sensors and IMU (accelerometer/gyroscope) to capture finger bending and hand orientation.

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla CSS, JavaScript / React
- **Backend**: Python, Flask, Flask-CORS
- **Machine Learning**: MediaPipe, OpenCV, TensorFlow / PyTorch, scikit-learn
- **Hardware / IoT**: ESP32 / Arduino, Flex Sensors, MPU6050
- **Emergency Alerting**: WhatsApp API (Twilio / Meta), Geolocation API

---

## 📁 Basic Project Structure

```text
EchoHand/
│
├── frontend/                   # Client-side web application
│   ├── public/                 # Static assets
│   └── src/                    # Source code
│       ├── assets/             # Images, icons, audio assets
│       ├── components/         # Reusable UI components
│       ├── pages/              # Landing, Auth, Dashboard, Detection, Emergency, Profile
│       ├── services/           # Backend API and external service connectors
│       ├── context/            # React context providers
│       ├── routes/             # Application route configurations
│       ├── hooks/              # Custom reusable hooks
│       ├── utils/              # Client utility functions
│       ├── App.jsx             # Main application component
│       ├── main.jsx            # Application entry point
│       └── index.css           # Global stylesheet and design tokens
│
├── backend/                    # Flask REST API backend
│   ├── routes/                 # API route blueprints
│   ├── services/               # Business logic (TTS, WhatsApp alerts, geocoding)
│   ├── ml/                     # ML inference wrappers
│   ├── models/                 # Data schemas and models
│   ├── utils/                  # Helper functions
│   ├── app.py                  # Flask server entry point
│   └── config.py               # Configuration settings
│
├── ml/                         # Machine learning workspace
│   ├── datasets/               # Training datasets and annotations
│   ├── notebooks/              # Jupyter experimentation notebooks
│   ├── training/               # Model training scripts
│   └── models/                 # Saved model weights
│
├── hardware/                   # Smart glove firmware and circuitry
│   ├── firmware/               # Microcontroller code (ESP32/Arduino)
│   └── circuit/                # Schematics and wiring diagrams
│
├── tests/                      # Automated test suites
│   ├── frontend/               # Frontend tests
│   ├── backend/                # Backend API tests
│   └── ml/                     # Model and inference tests
│
├── docs/                       # Project documentation
│   ├── architecture/           # System design & architecture
│   ├── api/                    # API specifications
│   └── hardware/               # Hardware setup guides
│
├── .env.example                # Sample environment variables
├── .gitignore                  # Git ignore rules
└── README.md                   # Project documentation
```
