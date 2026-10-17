# ML module (future)

This directory is reserved for the machine-learning stage of the project.
Nothing is implemented here yet by design.

Planned modules:

- `load_predictor.py` — predict future load at 15 / 30 / 60 minute horizons
- `voltage_predictor.py` — forecast voltage trends
- `anomaly_detector.py` — detect abnormal load and voltage anomalies
- `predictive_alerts.py` — raise alerts before a predicted violation

Requirements for training data (already satisfied by the readings pipeline):

- every reading is stored in `energy_readings` with an accurate UTC timestamp
- the `history` / `aggregate` WebSocket queries return raw, ordered time series
- the `ml_status` WebSocket query (`{"type": "ml_status", "request_id": N}` on
  `/ws/dashboard`) exposes module availability so the dashboard "Predictive
  Intelligence" section can switch from placeholder to real predictions
