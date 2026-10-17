"""Mock device generator — test the full pipeline without hardware.

Streams realistic, smoothly-fluctuating readings to the backend WebSocket
every 1-2 seconds. Run the backend first:

    cd backend && uvicorn app.main:app --reload --port 8000
    python mock_device.py            # from project root
"""
import errno
import json
import math
import socket
import os
import random
import signal
import sys
import time
from datetime import datetime, timezone

import websocket  # websocket-client

WS_URL = os.getenv("WS_URL", "ws://localhost:8000/ws/device")
DEVICE_ID = os.getenv("DEVICE_ID", "energy-monitor-01")
INTERVAL = float(os.getenv("MOCK_INTERVAL", "1.5"))

_running = True


def _handle_sigint(sig, frame):
    global _running
    _running = False


signal.signal(signal.SIGINT, _handle_sigint)


class SmoothSim:
    """Random-walk through a band so values never jump unrealistically."""

    def __init__(self, center, spread, freq, noise):
        self.center, self.spread = center, spread
        self.freq, self.noise = freq, noise
        self.t = random.uniform(0, 1000)

    def next(self):
        self.t += 1
        base = self.center + self.spread * math.sin(self.t * self.freq) + self.spread * 0.3 * math.sin(self.t * self.freq * 0.37)
        return round(max(0.0, base + random.uniform(-self.noise, self.noise)), 2)


em2m_v = SmoothSim(229, 4, 0.31, 1.0)
em2m_i = SmoothSim(3.2, 1.8, 0.23, 0.4)
em4m_v = SmoothSim(231, 3.5, 0.27, 0.9)
em4m_i = SmoothSim(6.0, 3.0, 0.19, 0.6)


def correlated_power(v, i, pf=0.88):
    return round(v * i * pf / (1 + random.uniform(-0.02, 0.02)) + 0.02 * i, 1)


def build_payload():
    em2m_vi, em2m_ii = em2m_v.next(), em2m_i.next()
    em4m_vi, em4m_ii = em4m_v.next(), em4m_i.next()
    return {
        "device_id": DEVICE_ID,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "em2m": {"voltage": em2m_vi, "current": em2m_ii, "power": correlated_power(em2m_vi, em2m_ii)},
        "em4m": {"voltage": em4m_vi, "current": em4m_ii, "power": correlated_power(em4m_vi, em4m_ii)},
    }


def drain(ws):
    """Non-blocking read of acks/errors the backend sends back."""
    ws.settimeout(0.05)
    while True:
        try:
            raw = ws.recv()
            msg = json.loads(raw)
            msg_type = msg.get("type")
            if msg_type == "reading_ack":
                print(f"[API] OK (reading #{msg['data'].get('reading_id')}, alerts: {msg['data'].get('alerts_generated', 0)})")
            elif msg_type == "error":
                print(f"[API] Backend error: {msg.get('detail', '')[:120]}")
        except (websocket.WebSocketTimeoutException, socket.timeout):
            break
        except OSError as e:
            # Windows non-blocking recv raises WSAEWOULDBLOCK (10035) — harmless.
            if getattr(e, "winerror", 0) == 10035 or e.errno in (11, 35, 10035, errno.EWOULDBLOCK):
                break
            ws.settimeout(5)
            raise


def connect():
    ws = websocket.create_connection(WS_URL, timeout=5)
    print(f"[WS] Connected to {WS_URL}")
    return ws


def main():
    print(f"[MOCK] Streaming readings to {WS_URL} every {INTERVAL}s (Ctrl+C to stop)")
    ws = None
    next_try = 0.0
    while _running:
        payload = build_payload()
        try:
            if ws is None:
                if time.time() < next_try:
                    time.sleep(0.5)
                    continue
                ws = connect()
            ws.send(json.dumps({"type": "reading", "data": payload}))
            print(
                f"[READ] EM2M V={payload['em2m']['voltage']:<7} I={payload['em2m']['current']:<6} "
                f"P={payload['em2m']['power']:<7} | EM4M V={payload['em4m']['voltage']:<7} "
                f"I={payload['em4m']['current']:<6} P={payload['em4m']['power']:<7}"
            )
            drain(ws)
            time.sleep(INTERVAL + random.uniform(-0.3, 0.5))
        except Exception as e:
            print(f"[WS] Backend unavailable ({e}). Retrying...")
            try:
                if ws is not None:
                    ws.close()
            except Exception:
                pass
            ws = None
            next_try = time.time() + 3
    print("[MOCK] Stopped")


if __name__ == "__main__":
    sys.exit(main())
