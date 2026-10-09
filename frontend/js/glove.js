(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  // ── Dataset-derived classifier ────────────────────────────────────────────
  // Delegates to window.EchoHandRecognizer (gestureRecognition.js).
  // That module uses nearest-centroid on 4 sensors (Thumb/Index/Middle/Ring)
  // with centroids derived from gesture_dataset.csv.
  // flex[0..4] = Thumb, Index, Middle, Ring, Little — normalised 0–1.
  // Little (index 4) is IGNORED because the sensor is broken.

  function classify(flex) {
    if (!flex) return null;
    return window.EchoHandRecognizer?.classify({ flex }) ?? null;
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
      let v = flex[i] ?? 0;
      // Auto-scale 12-bit ADC (0..4095) down to 0..1 range if > 1.0
      if (v > 1.0) v = v / 4095.0;
      const pct = Math.min(100, Math.max(0, Math.round(v * 100)));
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
    if (sensors) {
      sensors.hidden = !show;
      sensors.style.display = show ? 'block' : 'none';
    }
    if (waiting) {
      waiting.hidden = show;
      waiting.style.display = show ? 'none' : 'flex';
    }
  }

  // ── Process one incoming reading ─────────────────────────────────────────
  function processReading(data) {
    if (!data?.flex) return;
    showSensors(true);
    updateBars(data.flex);
    const raw       = classify(data.flex);
    const committed = debounce(raw);
    if (committed) showGesture(committed);
    // External hook — lets other modules observe every committed gesture
    if (committed && typeof window.EchoHandGlove?.onFlex === 'function') {
      window.EchoHandGlove.onFlex(committed, data.flex);
    }
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
      const raw = e.data;
      console.log('[EchoHand WS raw frame]:', raw);
      let data = null;
      const ADC_CEIL = window.EchoHandRecognizer?.adcCeil ?? 1000;

      // ── Format 1: JSON  { thumb, index, middle, ring }  (raw ADC ints) ──
      // ── Format 2: JSON  { flex: [t,i,m,r,l] }           (0-1 normalised) ──
      // ── Format 3: plain text  "t,i,m,r"  (same as ESP32 Serial output) ──
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.flex) {
          // Already normalised array
          data = parsed;
        } else if (parsed && parsed.thumb != null) {
          // Raw ADC JSON object
          data = {
            flex: [
              (parsed.thumb  ?? 0) / ADC_CEIL,
              (parsed.index  ?? 0) / ADC_CEIL,
              (parsed.middle ?? 0) / ADC_CEIL,
              (parsed.ring   ?? 0) / ADC_CEIL,
              0, // little finger absent
            ],
          };
        }
      } catch (_) {
        // Not JSON — try comma-separated plain text: "250,180,200,150"
        // This is exactly what the ESP32 sends over Serial (and often WebSocket).
        const parts = raw.trim().split(',').map(Number);
        if (parts.length >= 4 && parts.every(v => !isNaN(v))) {
          data = {
            flex: [
              parts[0] / ADC_CEIL,
              parts[1] / ADC_CEIL,
              parts[2] / ADC_CEIL,
              parts[3] / ADC_CEIL,
              0, // little finger absent
            ],
          };
        } else {
          // Truly unrecognised — log once so you can diagnose in DevTools
          console.warn('[EchoHand] Unrecognised WS frame (first 80 chars):', raw.slice(0, 80));
          return;
        }
      }

      if (!data) return;

      // Debug: uncomment the next line to log every frame in the browser console
      // console.debug('[EchoHand] flex:', data.flex.map(v => (v * ADC_CEIL).toFixed(0)).join(','));

      processReading(data);
    };

    ws.onerror = () => setStatus('Connection error', false);

    ws.onclose = () => {
      setStatus('Glove disconnected', false);
      ws = null;
    };
  }

  // ── Demo mode — cycles through dataset-representative readings ─────────────
  // flex values are the centroid means from gesture_dataset.csv, scaled to
  // 0-1 by dividing by ADC_CEIL (1000).  Little finger is always 0.
  const DEMO_READINGS = [
    { label: 'THANK YOU', flex: [0.338, 0.228, 0.230, 0.163, 0.000] },
    { label: 'HELLO',     flex: [0.162, 0.207, 0.178, 0.166, 0.000] },
    { label: 'YES',       flex: [0.249, 0.213, 0.203, 0.136, 0.000] },
    { label: 'NO',        flex: [0.148, 0.210, 0.194, 0.168, 0.000] },
    { label: 'HELP',      flex: [0.207, 0.201, 0.216, 0.145, 0.000] },
    { label: 'SORRY',     flex: [0.274, 0.191, 0.159, 0.161, 0.000] },
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
      const raw = prompt(
        'Enter ESP32 IP address (e.g. 192.168.1.42)\n' +
        'Optional port: 192.168.1.42:81\n' +
        'Leave blank for Demo mode.',
        ''
      );
      if (raw && raw.trim()) {
        const addr = raw.trim();
        // Build WebSocket URL.
        // Most ESP32 arduinoWebSockets setups serve at ws://ip:port (root),
        // NOT at ws://ip:port/ws.  We therefore connect to root by default.
        // If your firmware uses a specific path, enter it in the prompt
        // (e.g. 192.168.1.42:81/ws).
        let url;
        if (addr.startsWith('ws://') || addr.startsWith('wss://')) {
          url = addr; // user gave full URL
        } else if (addr.includes('/')) {
          // user gave   ip:port/path   — just prepend scheme
          url = `ws://${addr}`;
        } else if (addr.includes(':')) {
          // user gave   ip:port   — no path, connect to root
          url = `ws://${addr}`;
        } else {
          // bare IP — default to port 81, root path
          url = `ws://${addr}:81`;
        }
        console.info('[EchoHand] Connecting to', url);
        connectWS(url);
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
    },
    // Optional callback — set this to receive every committed gesture label.
    // Signature: onFlex(label: string, flex: number[5])
    // Example: window.EchoHandGlove.onFlex = (label, flex) => console.log(label);
    onFlex: null,
  };

})();
