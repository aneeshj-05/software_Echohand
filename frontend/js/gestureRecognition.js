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
  // The actual populated range in the dataset is 0-899; we use 1000 as a
  // round ceiling so normalised values stay stable and easy to reason about.
  const ADC_CEIL = 1000;

  // Readings at or above this raw value are treated as noise.
  // 4095 = ADC saturation (12-bit all-ones).
  const SPIKE_RAW  = 4000;
  const SPIKE_HIGH = ADC_CEIL * 1.5;   // 1500 — catches mid-range bursts

  // Dataset-derived centroids [thumb_norm, index_norm, middle_norm, ring_norm]
  // Source: gesture_dataset.csv
  // Method: per-gesture mean of spike-filtered samples, divided by ADC_CEIL.
  // Rows labelled UNKNOWN are excluded.  Little-finger column not used.
  const CENTROIDS = {
    'HELLO':     [0.162, 0.207, 0.178, 0.166],
    'HELP':      [0.207, 0.201, 0.216, 0.145],
    'NO':        [0.174, 0.209, 0.193, 0.169],
    'SORRY':     [0.274, 0.191, 0.159, 0.161],
    'THANK YOU': [0.351, 0.278, 0.283, 0.161],
    'YES':       [0.249, 0.213, 0.203, 0.136],
  };

  // Maximum Euclidean distance for a confident match.
  // 0.20 = ~200 ADC counts average deviation per finger.
  // Increase to accept weaker matches; decrease for stricter classification.
  const MAX_DIST = 0.20;

  function dist4(a, b) {
    let s = 0;
    for (let i = 0; i < 4; i++) {
      const d = a[i] - b[i];
      s += d * d;
    }
    return Math.sqrt(s);
  }

  // classify accepts:
  //   { thumb, index, middle, ring }  -- raw ADC object (preferred)
  //   { flex: [t, i, m, r, l] }      -- existing glove.js wire format (0-1)
  //   [t, i, m, r]                   -- raw ADC array
  // Returns a label string or null.
  function classify(rawObj) {
    let t, idx, m, r;

    if (!rawObj) return null;

    if (Array.isArray(rawObj)) {
      [t, idx, m, r] = rawObj;
    } else if (rawObj.flex != null) {
      // flex is already 0-1 normalised -- scale back to ADC-equivalent
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

    // Spike / invalid guard
    if ([t, idx, m, r].some(v => v >= SPIKE_RAW || v >= SPIKE_HIGH || isNaN(v))) {
      return null;
    }

    // Normalise
    const norm = [t / ADC_CEIL, idx / ADC_CEIL, m / ADC_CEIL, r / ADC_CEIL];

    // Nearest centroid
    let bestLabel = null;
    let bestDist  = Infinity;

    for (const [label, centroid] of Object.entries(CENTROIDS)) {
      const d = dist4(norm, centroid);
      if (d < bestDist) {
        bestDist  = d;
        bestLabel = label;
      }
    }

    return bestDist <= MAX_DIST ? bestLabel : null;
  }

  window.EchoHandRecognizer = {
    classify,
    get maxDist()   { return MAX_DIST;   },
    get centroids() { return CENTROIDS;  },
    get adcCeil()   { return ADC_CEIL;   },
  };

})();
