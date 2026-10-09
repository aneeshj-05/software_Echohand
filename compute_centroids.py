#!/usr/bin/env python3
"""
EchoHand — Compute gesture centroids from gesture_dataset.csv
=============================================================
Run from the project root:
    python3 compute_centroids.py

Outputs the CENTROIDS constant ready to paste into
frontend/js/gestureRecognition.js, plus inter-centroid
distances so you can judge how separable the gestures are.

Only the four working sensors (Thumb, Index, Middle, Ring)
are used.  The Little-finger column is never read.
"""
import csv
import math
import statistics
from pathlib import Path

# ── Configuration ────────────────────────────────────────────────────────────
CSV_PATH       = Path("gesture_dataset.csv")
ADC_CEIL       = 1000     # normalisation denominator
SPIKE_THRESHOLD = 700     # raw ADC readings >= this are rejected as noise

# ── Load and filter ──────────────────────────────────────────────────────────
gestures: dict[str, dict[str, list[int]]] = {}

if not CSV_PATH.exists():
    raise SystemExit(f"ERROR: {CSV_PATH} not found. Run from the project root.")

with open(CSV_PATH, newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        g = row.get("gesture", "").strip()
        if g in ("UNKNOWN", ""):
            continue
        try:
            t = int(row["thumb"])
            i = int(row["index"])
            m = int(row["middle"])
            r = int(row["ring"])
        except (ValueError, KeyError):
            continue

        # Reject any frame where a sensor is out of range (spike or missing)
        if any(v >= SPIKE_THRESHOLD or v < 0 for v in (t, i, m, r)):
            continue

        if g not in gestures:
            gestures[g] = {"t": [], "i": [], "m": [], "r": []}
        gestures[g]["t"].append(t)
        gestures[g]["i"].append(i)
        gestures[g]["m"].append(m)
        gestures[g]["r"].append(r)

# ── ESP32 Calibration bounds (from ESP32 sketch) ───────────────────────────
OPEN   = [675, 275, 240, 186]
CLOSED = [ 14, 176, 142, 164]

def norm_esp(raw: float, open_val: int, closed_val: int) -> float:
    if closed_val == open_val:
        return 0.0
    val = (raw - open_val) / (closed_val - open_val)
    return max(0.0, min(1.0, val))

# ── Compute centroids ────────────────────────────────────────────────────────
raw_centroids: dict[str, list[float]] = {}
esp_centroids: dict[str, list[float]] = {}

print("=" * 60)
print(" Per-gesture stats")
print(f" SPIKE_THRESHOLD = {SPIKE_THRESHOLD}   ADC_CEIL = {ADC_CEIL}")
print("=" * 60)

for g in sorted(gestures):
    d = gestures[g]
    n = len(d["t"])
    if n == 0:
        continue

    tn = statistics.mean(d["t"]) / ADC_CEIL
    im = statistics.mean(d["i"]) / ADC_CEIL
    mn = statistics.mean(d["m"]) / ADC_CEIL
    rn = statistics.mean(d["r"]) / ADC_CEIL
    raw_centroids[g] = [round(tn, 3), round(im, 3), round(mn, 3), round(rn, 3)]

    esp_t = statistics.mean([norm_esp(v, OPEN[0], CLOSED[0]) for v in d["t"]])
    esp_i = statistics.mean([norm_esp(v, OPEN[1], CLOSED[1]) for v in d["i"]])
    esp_m = statistics.mean([norm_esp(v, OPEN[2], CLOSED[2]) for v in d["m"]])
    esp_r = statistics.mean([norm_esp(v, OPEN[3], CLOSED[3]) for v in d["r"]])
    esp_centroids[g] = [round(esp_t, 3), round(esp_i, 3), round(esp_m, 3), round(esp_r, 3)]

    print(f"\n  {g}  ({n} clean samples)")
    print(f"    Raw Centroid (ADC/1000)  : {raw_centroids[g]}")
    print(f"    ESP32 Calibrated (0..1)  : {esp_centroids[g]}")

# ── JavaScript output ────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print(" Copy-paste into gestureRecognition.js")
print("=" * 60)
print("  const RAW_CENTROIDS = {")
for g in sorted(raw_centroids):
    print(f"    '{g}':{' ' * (12 - len(g))} {raw_centroids[g]},")
print("  };\n")

print("  const CALIBRATED_CENTROIDS = {")
for g in sorted(esp_centroids):
    print(f"    '{g}':{' ' * (12 - len(g))} {esp_centroids[g]},")
print("  };")
print()
