(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  // ── Rule-based classifier using your actual sensor readings ──────────────
  // flex[0..4] = Thumb, Index, Middle, Ring, Little (0.0–1.0)
  // Each rule: array of [min, max] per finger, null = don't care
  // Matched in order — first match wins

  const GESTURES = [
    {
      label: 'THANK YOU',
      // thumb ~0.65, index ~0.43, middle ~0.30, ring ~0.25, little ~0.0
      flex: [[0.55, 0.75], [0.35, 0.55], [0.20, 0.40], [0.15, 0.35], [0.0, 0.08]],
    },
    {
      label: 'HELLO',
      // thumb ~0.49, index ~0.40, middle ~0.40, ring ~0.32, little ~0.0
      flex: [[0.38, 0.60], [0.30, 0.52], [0.30, 0.52], [0.22, 0.42], [0.0, 0.08]],
    },
    {
      label: 'YES',
      // thumb ~0.39, index ~0.27, middle ~0.21, ring ~0.16, little ~0.0
      flex: [[0.28, 0.50], [0.18, 0.35], [0.12, 0.28], [0.08, 0.22], [0.0, 0.08]],
    },
    {
      label: 'NO',
      // thumb ~0.72, index ~0.26, middle ~0.34, ring ~0.25, little ~0.0
      flex: [[0.60, 0.82], [0.16, 0.34], [0.24, 0.44], [0.16, 0.34], [0.0, 0.08]],
    },
    {
      label: 'HELP',
      // thumb ~0.67, index ~0.19, middle ~0.19, ring ~0.13, little ~0.0
      flex: [[0.56, 0.78], [0.10, 0.27], [0.10, 0.27], [0.06, 0.20], [0.0, 0.08]],
    },
    {
      label: 'I LOVE YOU',
      // thumb ~0.61, index ~0.35, middle ~0.40, ring ~0.13, little ~0.0
      flex: [[0.50, 0.72], [0.25, 0.45], [0.30, 0.52], [0.06, 0.20], [0.0, 0.08]],
    },
    {
      label: 'PAIN',
      // thumb ~0.38, index ~0.18, middle ~0.35, ring ~0.13, little ~0.0
      flex: [[0.27, 0.49], [0.10, 0.26], [0.25, 0.45], [0.06, 0.20], [0.0, 0.08]],
    },
    {
      label: 'EAT',
      // thumb ~0.68, index ~0.22, middle ~0.22, ring ~0.14, little ~0.0
      flex: [[0.57, 0.79], [0.13, 0.31], [0.13, 0.31], [0.07, 0.21], [0.0, 0.08]],
    },
    {
      label: 'DRINK',
      // thumb ~0.63, index ~0.28, middle ~0.28, ring ~0.17, little ~0.0
      flex: [[0.52, 0.74], [0.18, 0.36], [0.18, 0.36], [0.09, 0.25], [0.0, 0.08]],
    },
    {
      label: 'WHERE',
      // thumb ~0.12, index ~0.20, middle ~0.34, ring ~0.11, little ~0.0
      flex: [[0.04, 0.22], [0.12, 0.28], [0.24, 0.44], [0.04, 0.18], [0.0, 0.08]],
    },
  ];

  function classify(flex) {
    for (const g of GESTURES) {
      const match = g.flex.every(([mn, mx], i) => flex[i] >= mn && flex[i] <= mx);
      if (match) return g.label;
    }
    return null;
  }

  // ── Debounce: same gesture must appear N times in a row ──────────────────
  const DEBOUNCE = 4;
  let _lastLabel = null, _count = 0, _spoken = null;

  function debounce(label) {
    if (label === _lastLabel) {
      _count++;
    } else {
      _lastLabel = label;
      _count = 1;
    }
    if (_count >= DEBOUNCE && label !== _spoken) {
      _spoken = label;
      return label;
    }
    if (label === null) _spoken = null; // re-arm on neutral
    return null;
  }

  // ── UI helpers ───────────────────────────────────────────────────────────
  function setStatus(text, active) {
    const ind  = $('gloveStatusIndicator');
    const txt  = $('gloveStatusText');
    if (ind) ind.className = 'status-indicator' + (active ? ' is-active' : '');
    if (txt) txt.textContent = text;
  }

  function updateBars(flex) {
    const ids = ['Thumb','Index','Middle','Ring','Little'];
    ids.forEach((f, i) => {
      const bar = $('sensor' + f);
      const val = $('sensor' + f + 'Val');
      const pct = Math.round((flex[i] ?? 0) * 100);
      if (bar) bar.style.width = pct + '%';
      if (val) val.textContent = pct + '%';
    });
  }

  function showGesture(label) {
    const display = $('gloveGestureDisplay');
    const speakBtn = $('gloveSpeakBtn');
    if (display) {
      display.textContent = label || '—';
      display.style.animation = 'none';
      void display.offsetWidth;
      display.style.animation = '';
    }
    if (speakBtn) speakBtn.hidden = !label;
    if (label) window.EchoHandSpeech?.speak(label);
    // Trigger emergency on HELP gesture
    if (label === 'HELP') window.EchoHandEmergency?.onHelpGesture();
  }

  function showSensors(show) {
    const sensors = $('gloveSensors');
    const waiting = $('gloveWaitingState');
    if (sensors) sensors.hidden = !show;
    if (waiting) waiting.hidden = show;
  }

  // ── Process one incoming reading ─────────────────────────────────────────
  function processReading(data) {
    if (!data?.flex) return;
    updateBars(data.flex);
    const raw       = classify(data.flex);
    const committed = debounce(raw);
    if (committed) showGesture(committed);
  }

  // ── WebSocket connection to ESP32 ────────────────────────────────────────
  let ws = null;

  function connectWS(url) {
    if (ws) { ws.close(); ws = null; }
    setStatus('Connecting…', false);
    ws = new WebSocket(url);

    ws.onopen = () => {
      setStatus('Glove connected', true);
      showSensors(true);
    };

    ws.onmessage = e => {
      try { processReading(JSON.parse(e.data)); } catch (_) {}
    };

    ws.onerror = () => setStatus('Connection error', false);

    ws.onclose = () => {
      setStatus('Glove disconnected', false);
      ws = null;
    };
  }

  // ── Demo mode — cycles through real readings ─────────────────────────────
  const DEMO_READINGS = [
    { label: 'THANK YOU', flex: [0.653, 0.427, 0.297, 0.248, 0.000] },
    { label: 'HELLO',     flex: [0.492, 0.397, 0.398, 0.315, 0.000] },
    { label: 'YES',       flex: [0.392, 0.270, 0.208, 0.161, 0.000] },
    { label: 'NO',        flex: [0.722, 0.259, 0.341, 0.246, 0.000] },
    { label: 'HELP',      flex: [0.670, 0.187, 0.185, 0.129, 0.000] },
    { label: 'I LOVE YOU',flex: [0.610, 0.352, 0.400, 0.125, 0.000] },
    { label: 'DRINK',     flex: [0.625, 0.278, 0.278, 0.167, 0.000] },
    { label: 'EAT',       flex: [0.680, 0.222, 0.223, 0.143, 0.000] },
    { label: 'WHERE',     flex: [0.123, 0.204, 0.340, 0.112, 0.000] },
  ];
  let _demoIdx = 0;
  let _demoTimer = null;

  function runDemo() {
    stopDemo();
    showSensors(true);
    setStatus('Demo mode active', true);
    _demoIdx = 0;

    function step() {
      const reading = DEMO_READINGS[_demoIdx % DEMO_READINGS.length];
      updateBars(reading.flex);
      // Feed same reading DEBOUNCE times so it commits
      for (let i = 0; i < DEBOUNCE; i++) debounce(classify(reading.flex));
      showGesture(reading.label);
      _demoIdx++;
      _demoTimer = setTimeout(step, 2200);
    }
    step();
  }

  function stopDemo() {
    if (_demoTimer) { clearTimeout(_demoTimer); _demoTimer = null; }
  }

  // ── Connect button — prompt for ESP32 IP or run demo ────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    $('connectGloveBtn')?.addEventListener('click', () => {
      const ip = prompt('Enter ESP32 IP address (leave blank for Demo mode):', '');
      if (ip && ip.trim()) {
        connectWS(`ws://${ip.trim()}/ws`);
      } else {
        runDemo();
      }
    });

    $('gloveSpeakBtn')?.addEventListener('click', () => {
      const txt = $('gloveGestureDisplay')?.textContent;
      if (txt && txt !== '—') window.EchoHandSpeech?.speak(txt);
    });
  });

  // ── Stop everything when modal closes ───────────────────────────────────
  window.EchoHandGlove = {
    initialize() {
      stopDemo();
      if (ws) { ws.close(); ws = null; }
      showSensors(false);
      setStatus('Glove not connected', false);
      showGesture(null);
      _lastLabel = null; _count = 0; _spoken = null;
    }
  };

})();
