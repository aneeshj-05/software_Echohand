/* =============================================================
   EchoHand — Dataset-Derived Gesture Recognizer
   gestureRecognition.js

   Approach: nearest-centroid (Euclidean) over 4 working sensors.
   Centroids are computed from gesture_dataset.csv by averaging
   spike-filtered samples per gesture, then normalised to 0–1
   using a practical ADC ceiling of 1000 counts (the observed
   populated maximum across all recorded sessions).

   Only Thumb / Index / Middle / Ring are used; the broken
   Little-finger sensor is intentionally excluded everywhere.

   How it plugs in:
     - window.EchoHandRecognizer.classify(rawObj)
         rawObj = { thumb, index, middle, ring }  (raw ADC ints)
         returns label string or null

   glove.js calls this inside processReading() in place of its
   own classify().  No other file is modified.
   ============================================================= */

(function () {
  'use strict';

  // ADC normalisation ceiling.
  // The actual populated range in the dataset tops out around 656.
  // We use 1000 as a round ceiling for stable normalised values.
  const ADC_CEIL = 1000;

  // Any single sensor reading strictly over 4095 (disconnections/float) is discarded.
  const SPIKE_THRESHOLD = 4096;

  // 1) RAW ADC Centroids (when input is raw ADC / 1000)
  const RAW_CENTROIDS = {
    'HELLO':     [0.162, 0.207, 0.178, 0.166],
    'HELP':      [0.207, 0.201, 0.216, 0.145],
    'NO':        [0.148, 0.210, 0.194, 0.168],
    'SORRY':     [0.274, 0.191, 0.159, 0.161],
    'THANK YOU': [0.338, 0.228, 0.230, 0.163],
    'YES':       [0.249, 0.213, 0.203, 0.136],
  };

  // 2) ESP32 Calibrated Flex Centroids (for 0.0..1.0 flex array from ESP32 normalizeSensor)
  const CALIBRATED_CENTROIDS = {
    'HELLO':     [0.772, 0.653, 0.585, 0.797],
    'HELP':      [0.707, 0.704, 0.513, 0.815],
    'NO':        [0.796, 0.658, 0.571, 0.467],
    'SORRY':     [0.607, 0.869, 0.808, 0.844],
    'THANK YOU': [0.510, 0.511, 0.313, 0.642],
    'YES':       [0.644, 0.626, 0.390, 0.904],
  };

  // Maximum Euclidean distance for a confident match.
  const MAX_DIST_RAW = 0.35;
  const MAX_DIST_CAL = 0.45;

  function dist4(a, b) {
    let s = 0;
    for (let i = 0; i < 4; i++) {
      const d = a[i] - b[i];
      s += d * d;
    }
    return Math.sqrt(s);
  }

  // classify accepts:
  //   { flex: [t, i, m, r, l] }      -- ESP32 calibrated 0.0..1.0 array or raw
  //   { thumb, index, middle, ring }  -- raw ADC object
  //   [t, i, m, r]                   -- raw ADC array
  // Returns a label string or null.
  function classify(rawObj) {
    if (!rawObj) return null;

    // Check if input is ESP32 0.0..1.0 calibrated flex array
    if (rawObj.flex != null && Array.isArray(rawObj.flex)) {
      const f = rawObj.flex;
      const maxVal = Math.max(...f.slice(0, 4));
      
      // If values are within 0.0 .. 1.0 (calibrated ESP32 output), use CALIBRATED_CENTROIDS
      if (maxVal <= 1.0) {
        const norm = [f[0] ?? 0, f[1] ?? 0, f[2] ?? 0, f[3] ?? 0];
        let bestLabel = null;
        let bestDist  = Infinity;

        for (const [label, centroid] of Object.entries(CALIBRATED_CENTROIDS)) {
          const d = dist4(norm, centroid);
          if (d < bestDist) {
            bestDist  = d;
            bestLabel = label;
          }
        }
        return bestDist <= MAX_DIST_CAL ? bestLabel : null;
      }
    }

    // Otherwise process as RAW ADC inputs
    let t, idx, m, r;
    if (Array.isArray(rawObj)) {
      [t, idx, m, r] = rawObj;
    } else if (rawObj.flex != null) {
      const f = rawObj.flex;
      t   = (f[0] ?? 0) * ADC_CEIL;
      idx = (f[1] ?? 0) * ADC_CEIL;
      m   = (f[2] ?? 0) * ADC_CEIL;
      r   = (f[3] ?? 0) * ADC_CEIL;
    } else {
      t   = rawObj.thumb  ?? 0;
      idx = rawObj.index  ?? 0;
      m   = rawObj.middle ?? 0;
      r   = rawObj.ring   ?? 0;
    }

    // Auto-detect 12-bit ESP32 ADC range (0..4095) vs 10-bit / dataset scale (0..1000)
    const maxVal = Math.max(t, idx, m, r);
    let scaleFactor = 1.0;
    if (maxVal > ADC_CEIL) {
      scaleFactor = ADC_CEIL / 4095.0;
    }

    t   *= scaleFactor;
    idx *= scaleFactor;
    m   *= scaleFactor;
    r   *= scaleFactor;

    if ([t, idx, m, r].some(v => isNaN(v) || v < 0 || v > SPIKE_THRESHOLD)) {
      return null;
    }

    const norm = [t / ADC_CEIL, idx / ADC_CEIL, m / ADC_CEIL, r / ADC_CEIL];
    let bestLabel = null;
    let bestDist  = Infinity;

    for (const [label, centroid] of Object.entries(RAW_CENTROIDS)) {
      const d = dist4(norm, centroid);
      if (d < bestDist) {
        bestDist  = d;
        bestLabel = label;
      }
    }

    return bestDist <= MAX_DIST_RAW ? bestLabel : null;
  }

  window.EchoHandRecognizer = {
    classify,
    get maxDist()   { return MAX_DIST;   },
    get centroids() { return CENTROIDS;  },
    get adcCeil()   { return ADC_CEIL;   },
  };

})();
