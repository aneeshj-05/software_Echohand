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
    // Convert normalised 0-1 flex values back to ADC-equivalent counts so
    // EchoHandRecognizer can apply its spike guard and centroid distances
    // consistently regardless of whether readings came from the WebSocket
    // or from the demo array.
    const ADC_CEIL = window.EchoHandRecognizer?.adcCeil ?? 1000;
    return window.EchoHandRecognizer?.classify({
      thumb:  flex[0] * ADC_CEIL,
      index:  flex[1] * ADC_CEIL,
      middle: flex[2] * ADC_CEIL,
      ring:   flex[3] * ADC_CEIL,
      // little (flex[4]) deliberately excluded
    }) ?? null;
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
      let data;
      try { data = JSON.parse(e.data); } catch (_) { return; }

      // Support two ESP32 message formats:
      // 1. { flex: [t,i,m,r,l] }  — pre-normalised 0-1 (existing format)
      // 2. { thumb, index, middle, ring }  — raw ADC integers
      if (data && !data.flex && data.thumb != null) {
        const ADC_CEIL = window.EchoHandRecognizer?.adcCeil ?? 1000;
        data = {
          flex: [
            data.thumb  / ADC_CEIL,
            data.index  / ADC_CEIL,
            data.middle / ADC_CEIL,
            data.ring   / ADC_CEIL,
            0,   // little finger absent — always 0
          ],
        };
      }
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
    { label: 'THANK YOU', flex: [0.351, 0.278, 0.283, 0.161, 0.000] },
    { label: 'HELLO',     flex: [0.162, 0.207, 0.178, 0.166, 0.000] },
    { label: 'YES',       flex: [0.249, 0.213, 0.203, 0.136, 0.000] },
    { label: 'NO',        flex: [0.174, 0.209, 0.193, 0.169, 0.000] },
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
        'Enter ESP32 IP address or IP:port (e.g. 192.168.1.42 or 192.168.1.42:81).\nLeave blank for Demo mode.',
        ''
      );
      if (raw && raw.trim()) {
        const addr = raw.trim();
        // If the user supplied a port already (host:port) use as-is;
        // otherwise default to port 81 which is the EchoHand ESP32 default.
        const url = addr.includes(':') && !addr.startsWith('[') // IPv6 check
          ? `ws://${addr}/ws`
          : `ws://${addr}:81/ws`;
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
