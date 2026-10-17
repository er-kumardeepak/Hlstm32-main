# Energy Monitoring Dashboard — STM32H755 + Raspberry Pi + FastAPI + React

Production-style dashboard for an energy monitoring system. **Communication is
pure WebSocket — there is no REST API.** Device ingestion and every dashboard
query both travel over WebSocket.

```
EM2M (single-phase)  ──Modbus RTU──┐
                                  ├── STM32H755 ──UART 115200──▶ Raspberry Pi ──WS /ws/device──▶ FastAPI Backend ──▶ PostgreSQL
EM4M (three-phase)  ──Modbus RTU──┘                                                                              │
                                                                                                    WS /ws/dashboard
                                                                                                              ▼
                                                                                                      React Dashboard
```

The STM32 CM7 firmware lives at the repository root (one level above this folder:
`CM7/`, `CM4/`, `HIstm32.ioc`). It polls both
meters over Modbus RTU and streams a combined line over USART6 (115200, 8-N-1):

```text
EM2M: V=229.3, I=3.42, P=712.4 | EM4M: V=231.1, I=5.11, P=1084.0
```

The Raspberry Pi parses that line and streams it to `ws://<backend>:8000/ws/device`.

## Folder structure

| Path | Purpose |
| --- | --- |
| `backend/` | FastAPI + SQLAlchemy **WebSocket-only** backend |
| `frontend/` | React + Vite + TypeScript + Tailwind (neobrutalism) dashboard — WS queries |
| `raspberry_pi/` | UART → WebSocket bridge (pyserial + websocket-client) |
| `mock_device.py` | Simulated device so the full pipeline works with no hardware |
| `test_ws_e2e.py` | End-to-end test of the whole WS pipeline (run with backend up) |
| `docker-compose.yml` | Optional Docker stack (Postgres + backend + frontend) |

## Quick start (no hardware needed)

```bash
# 1 — Backend
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt websocket-client
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000    # or: python run.py

# 2 — Frontend (new terminal)
cd frontend
npm install
npm run dev                    # http://localhost:5173

# 3 — Mock data (new terminal, from the project root)
pip install websocket-client
python mock_device.py
```

Open http://localhost:5173 — the top bar shows **Live** once the dashboard
socket connects. Stop the mock device and within ~30 s the device flips to OFFLINE.

There is no `/docs` Swagger page and no REST routes at all — the protocol is documented below.

## 1. Architecture

- **STM32H755 (CM7)** — reads EM2M/EM4M over Modbus RTU (USART1/USART2 at 9600 8-N-1) and
  emits the combined line over USART6 at 115200. Wiring + troubleshooting: `raspberry_pi/README.md`.
- **Raspberry Pi** — `raspberry_pi/main_runner.py` opens `/dev/ttyUSB0` (configurable), parses
  the line and streams JSON frames to `/ws/device`. Auto-reconnects the socket and queues up
  to 500 readings while the backend is offline, flushing them on reconnect.
- **Backend** — FastAPI validates, stores, runs rule-based alert checks with cooldown
  deduplication, and pushes readings/alerts to all dashboard clients over WebSocket.
- **Database** — PostgreSQL in production; SQLite fallback for local dev (env-driven).
- **Frontend** — one shared WebSocket (`/ws/dashboard`) carries the live stream *and* all
  request/response queries. Auto-reconnecting with visible Live/Reconnecting/Offline status.

## 2. PostgreSQL setup

```sql
CREATE DATABASE energy_monitor;
```

Then set in `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/energy_monitor
```

Omit it (or keep the default `sqlite:///./energy_monitor.db`) to use SQLite. Tables are
created automatically at startup (`Base.metadata.create_all`).

## 3. WebSocket protocol

### `ws://host:8000/ws/device` — ingestion (Raspberry Pi, mock device)

```jsonc
// If the backend has DEVICE_API_KEY set, the FIRST frame must be:
{"type": "auth", "data": {"api_key": "..."}}          // -> {"type": "auth_ok"} or {"type": "auth_failed"}

// Then, per reading (timestamp optional — server assigns current time):
-> {"type": "reading", "data": {
      "device_id": "energy-monitor-01",
      "em2m": {"voltage": 229.3, "current": 3.42, "power": 712.4},
      "em4m": {"voltage": 231.1, "current": 5.11, "power": 1084.0}
   }}
<- {"type": "reading_ack", "data": {"reading_id": 42, "alerts_generated": 0}}
<- {"type": "error", "data": {"detail": "..."}}        // validation / storage failures
```

### `ws://host:8000/ws/dashboard` — stream + queries (React)

Live push (no request needed):

```json
{"type": "reading", "data": { ...ReadingOut... }}
{"type": "alert",   "data": { ...AlertOut... }}
```

Request/response queries — send a frame, get a reply tagged with your `request_id`:

```jsonc
-> {"type": "latest",  "request_id": 1, "params": {"device_id": "energy-monitor-01"}}
<- {"type": "latest_result", "request_id": 1, "data": { ... }}

-> {"type": "history", "request_id": 2, "params": {"device_id": "...", "from": "...", "to": "...", "limit": 500}}
-> {"type": "aggregate", "request_id": 3, "params": {"interval": "5min", "minutes": 60}}   // 1min|5min|15min|1hour|1day
-> {"type": "devices", "request_id": 4, "params": {"status": "online"}}                     // optional filter
-> {"type": "device",  "request_id": 5, "params": {"device_id": "..."}}
-> {"type": "alerts",  "request_id": 6, "params": {"severity": "critical", "acknowledged": false, "limit": 200}}
-> {"type": "acknowledge", "request_id": 7, "params": {"alert_id": 3, "acknowledged": true}}
-> {"type": "health",  "request_id": 8}
-> {"type": "ml_status", "request_id": 9}
<- {"type": "<query>_result", "request_id": N, "data": ...}
<- {"type": "error", "request_id": N, "detail": "..."}
```

## 4. Thresholds & alerts

Controlled via `backend/.env`: `LOW_VOLTAGE_THRESHOLD`, `HIGH_VOLTAGE_THRESHOLD`,
`EM2M_MAX_CURRENT`, `EM2M_MAX_POWER`, `EM4M_MAX_CURRENT`, `EM4M_MAX_POWER`,
`DEVICE_OFFLINE_SECONDS`, `ALERT_COOLDOWN_SECONDS`. A continuous violation fires one alert,
then suppresses duplicates for the cooldown window.

## 5. Dashboard pages

- **Overview** — metric cards per meter + total power + system summary + live trend.
- **Live Monitor** — real-time voltage/current/power charts with meter and window selectors.
- **Analytics** — historical ranges (15 m → 7 days + custom) with avg/min/max.
- **Alerts** — severity filters and acknowledge action.
- **Devices** — auto-registered devices, connectivity and latest readings.
- **Settings** — active threshold reference (read from env).

## 6. Verify the pipeline

With the backend running (from the project root, `websocket-client` installed):

```bash
# 15 checks: ingestion, acks, all WS queries, live push, alert generation + ack over WS
python test_ws_e2e.py

# continuous mock stream (leave it running while you watch the dashboard)
python mock_device.py
```

Expected result: `RESULT: ALL OK`. Point a browser at http://localhost:5173 — the top bar
shows **Live** once the dashboard socket connects.

## Production notes

- Serve the backend behind a reverse proxy with `wss://` for WebSockets.
- Build the frontend (`npm run build`) and serve `dist/` from nginx/CDN.
- Set a strong `DEVICE_API_KEY` on the backend and the Pi (auth handshake is built in).
- Point `DATABASE_URL` at managed PostgreSQL.
- Docker alternative: `docker compose up --build`.

## ML roadmap (not implemented by design)

`backend/app/ml/` is reserved for `load_predictor.py`, `voltage_predictor.py`,
`anomaly_detector.py` and predictive alerts. All readings are already stored with accurate
UTC timestamps and the `ml_status` WS query exposes readiness. The dashboard's
"Predictive Intelligence" section shows placeholders until real predictions exist.
