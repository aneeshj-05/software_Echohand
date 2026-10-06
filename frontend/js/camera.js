/* =========================================================
   ECHOHAND CAMERA MODULE — ML-backed ASL inference
========================================================= */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const API = '/api/asl';
  const FRAME_INTERVAL_MS = 120; // ~8 fps

  let stream       = null;
  let frameTimer   = null;
  let canvas       = null;
  let ctx          = null;
  let subtitleHistory = [];
  let running      = false;   // true only while camera+session are active
  let abortCtrl    = null;    // AbortController for in-flight fetch calls

  // ── Status helpers ────────────────────────────────────────
  function setStatusLabel(msg) {
    const el = $('cameraStatusLabel');
    if (el) el.textContent = msg;
  }

  function setIndicator(state) {
    const el = $('cameraStatusIndicator');
    if (!el) return;
    el.className = 'status-indicator' + (state ? ' ' + state : '');
  }

  function setPlaceholder(show, title, text) {
    const ph  = $('cameraPlaceholder');
    const vid = $('cameraFeed');
    if (!ph || !vid) return;
    ph.style.display  = show ? 'flex' : 'none';
    vid.style.display = show ? 'none' : 'block';
    if (title) { const el = $('cameraStateTitle'); if (el) el.textContent = title; }
    if (text)  { const el = $('cameraStateText');  if (el) el.textContent = text;  }
  }

  // ── Subtitle / word output ────────────────────────────────
  function pushWord(word) {
    if (!word) return;
    const upper = word.toUpperCase();
    subtitleHistory.push(upper);
    if (subtitleHistory.length > 6) subtitleHistory.shift();
    renderSubtitle();
    const speakBtn = $('cameraSpeakBtn');
    if (speakBtn) speakBtn.hidden = false;
    window.EchoHandSpeech?.speak(word);
  }

  function renderSubtitle() {
    const sub = $('cameraSubtitle');
    if (!sub) return;
    if (subtitleHistory.length === 0) {
      sub.innerHTML = '<span class="subtitle-placeholder">Detected words will appear here…</span>';
    } else {
      sub.innerHTML = `<span class="subtitle-text">${subtitleHistory.join(' ')}</span>`;
    }
  }

  // ── Top-3 live display ────────────────────────────────────
  function updateTop3(top3, bufferFill) {
    const SEQ_LEN = 32;
    if (!top3 || top3.length === 0) {
      if (bufferFill < SEQ_LEN) {
        setStatusLabel(`Buffering… ${bufferFill}/${SEQ_LEN} frames`);
      } else {
        setStatusLabel('No pose detected — move into frame');
      }
      return;
    }
    // Show top-3 as: "YES 72% | NO 15% | DRINK 8%"
    const parts = top3.map(([lbl, conf]) => `${lbl.toUpperCase()} ${Math.round(conf * 100)}%`);
    setStatusLabel(parts.join('  |  '));
  }

  // ── Frame capture + inference loop ───────────────────────
  function captureAndSend() {
    const video = $('cameraFeed');
    if (!running || !video || !stream || video.readyState < 2) return;

    if (!canvas) {
      canvas = document.createElement('canvas');
      ctx    = canvas.getContext('2d');
    }
    canvas.width  = 320;
    canvas.height = 240;
    ctx.drawImage(video, 0, 0, 320, 240);
    const b64 = canvas.toDataURL('image/jpeg', 0.75);

    fetch(`${API}/frame`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ frame: b64 }),
      signal:  abortCtrl?.signal,
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !running) return;  // discard if session already stopped
        updateTop3(data.top3, data.buffer_fill ?? 0);
        if (data.word) pushWord(data.word);
      })
      .catch(() => {});  // AbortError lands here — silently ignored
  }

  function startInferenceLoop() {
    stopInferenceLoop();
    abortCtrl = new AbortController();
    running   = true;
    frameTimer = setInterval(captureAndSend, FRAME_INTERVAL_MS);
  }

  function stopInferenceLoop() {
    running = false;
    if (frameTimer) { clearInterval(frameTimer); frameTimer = null; }
    if (abortCtrl)  { abortCtrl.abort(); abortCtrl = null; }
  }

  // ── Camera start ──────────────────────────────────────────
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatusLabel('Camera not available in this browser.');
      setIndicator('is-error');
      return;
    }

    // If already running, stop first cleanly
    if (stream) stopCamera();

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const video = $('cameraFeed');
      video.srcObject = stream;
      setPlaceholder(false);
      setStatusLabel('Starting ML pipeline…');
      setIndicator('is-active');

      $('startCameraBtn').hidden = true;
      $('stopCameraBtn').hidden  = false;

      // Reset subtitle history for fresh session
      subtitleHistory = [];
      renderSubtitle();
      const speakBtn = $('cameraSpeakBtn');
      if (speakBtn) speakBtn.hidden = true;

      // Tell backend to create a fresh session (new extractor + stabilizer)
      const res = await fetch(`${API}/start`, { method: 'POST' }).catch(() => null);
      if (!res || !res.ok) {
        setStatusLabel('Backend not reachable — is the server running?');
        setIndicator('is-error');
        return;
      }

      startInferenceLoop();
      setStatusLabel('Buffering frames…');
    } catch (err) {
      setPlaceholder(true, 'Camera unavailable', 'Could not access camera. Check permissions.');
      setStatusLabel('Camera error');
      setIndicator('is-error');
    }
  }

  // ── Camera stop ───────────────────────────────────────────
  function stopCamera() {
    stopInferenceLoop();

    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }

    const video = $('cameraFeed');
    if (video) { video.srcObject = null; }

    setPlaceholder(true, 'Camera stopped', 'Press Start Camera to begin again.');
    setStatusLabel('Camera inactive');
    setIndicator('');

    const startBtn = $('startCameraBtn');
    const stopBtn  = $('stopCameraBtn');
    if (startBtn) startBtn.hidden = false;
    if (stopBtn)  stopBtn.hidden  = true;

    fetch(`${API}/stop`, { method: 'POST' }).catch(() => {});
  }

  // ── Demo gesture ──────────────────────────────────────────
  const DEMO_WORDS = ['yes', 'no', 'drink', 'hearing', 'deaf', 'now', 'fine', 'hot', 'like'];

  function demoGesture() {
    pushWord(DEMO_WORDS[Math.floor(Math.random() * DEMO_WORDS.length)]);
  }

  // ── Clear output ──────────────────────────────────────────
  function clearOutput() {
    subtitleHistory = [];
    renderSubtitle();
    const speakBtn = $('cameraSpeakBtn');
    if (speakBtn) speakBtn.hidden = true;
  }

  // ── Initialize (called every time modal opens) ────────────
  function initialize() {
    // Always re-initialize — do NOT guard with a flag
    // so reopening the modal after close works correctly
    setPlaceholder(true, 'Camera not started', "The translation panel is ready. Start the camera when you're ready.");
    setStatusLabel('Camera inactive');
    setIndicator('');
    // Reset button states in case modal was closed mid-session
    const startBtn = $('startCameraBtn');
    const stopBtn  = $('stopCameraBtn');
    if (startBtn) startBtn.hidden = false;
    if (stopBtn)  stopBtn.hidden  = true;
  }

  // ── Button wiring ─────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    $('startCameraBtn')?.addEventListener('click', startCamera);
    $('stopCameraBtn')?.addEventListener('click',  stopCamera);
    $('cameraDemoBtn')?.addEventListener('click',  demoGesture);
    $('clearCameraBtn')?.addEventListener('click', clearOutput);
    $('cameraSpeakBtn')?.addEventListener('click', () => {
      if (subtitleHistory.length) window.EchoHandSpeech?.speak(subtitleHistory.join(' '));
    });
  });

  // ── Public API ────────────────────────────────────────────
  window.EchoHandCamera = { initialize, startCamera, stopCamera, demoGesture };
})();
