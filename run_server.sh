#!/usr/bin/env bash
# Run EchoHand Flask backend from the project root.
# PYTHONPATH includes the project root so both src/ (ML) and backend/ are importable.
set -e
cd "$(dirname "$0")"
export PYTHONPATH="$(pwd):${PYTHONPATH}"
exec .venv/bin/python3 -m flask --app backend/app.py run --host=0.0.0.0 --port=5000 --debug
