"""End-to-end test of the WebSocket-only backend.

Run: python test_ws_e2e.py   (backend must be running on port 8000)
"""
import json
import sys
import time

import websocket

BASE = "ws://127.0.0.1:8000"
DEV = f"energy-monitor-e2e-{int(time.time())}"  # fresh device per run: alert cooldowns restart

for _ in range(20):
    try:
        probe = websocket.create_connection(BASE + "/ws/dashboard", timeout=2)
        probe.close()
        break
    except Exception:
        time.sleep(0.5)
else:
    sys.exit("backend never came up")

failures = []


def expect(cond, name):
    print(("PASS  " if cond else "FAIL  ") + name)
    if not cond:
        failures.append(name)


def sj(ws, msg):
    ws.send(json.dumps(msg))


dev = websocket.create_connection(BASE + "/ws/device", timeout=5)
payload = {
    "device_id": DEV,
    "timestamp": "2026-10-16T10:30:00+05:30",
    "em2m": {"voltage": 229.3, "current": 3.42, "power": 712.4},
    "em4m": {"voltage": 231.1, "current": 5.11, "power": 1084.0},
}
for i in range(3):
    sj(dev, {"type": "reading", "data": payload})
sj(dev, {"type": "bogus"})


def dev_recv():
    """Drain replies on the device socket, skipping reading_ack envelopes."""
    dev.settimeout(10)
    while True:
        msg = json.loads(dev.recv())
        if msg.get("type") != "reading_ack":
            return msg
        expect(msg["data"].get("reading_id", 0) > 0, "ingestion ack")


err = dev_recv()
expect(err.get("type") == "error" and "unknown type" in err["data"]["detail"], "ingestion acks + unknown type -> error")

# 2) Dashboard queries over /ws/dashboard
dash = websocket.create_connection(BASE + "/ws/dashboard", timeout=8)


def q(t, params=None, rid=[0]):
    rid[0] += 1
    sj(dash, {"type": t, "request_id": rid[0], "params": params or {}})
    while True:
        m = json.loads(dash.recv())
        if m.get("request_id") == rid[0]:
            return m


r = q("latest", {"device_id": DEV})
expect(r["type"] == "latest_result" and r["data"]["em2m_power"] == 712.4, "query latest")
r = q("history", {"device_id": DEV, "limit": 10})
expect(r["type"] == "history_result" and len(r["data"]) >= 3, "query history")
r = q("aggregate", {"interval": "1min", "minutes": 20160, "device_id": DEV})
expect(r["type"] == "aggregate_result" and len(r["data"]) >= 1, "query aggregate")
r = q("devices")
expect(r["type"] == "devices_result" and any(d["device_id"] == DEV for d in r["data"]), "query devices")
r = q("alerts", {"device_id": DEV, "limit": 10})
expect(r["type"] == "alerts_result" and isinstance(r["data"], list), "query alerts")
r = q("health")
expect(r["type"] == "health_result" and r["data"]["status"] == "ok", "query health")
r = q("ml_status")
expect(r["type"] == "ml_status_result" and "modules" in r["data"], "query ml_status")
r = q("acknowledge", {"alert_id": 999999})
expect(r["type"] == "error" and "not found" in r["detail"].lower(), "ack unknown alert -> error")

# 3) Live broadcast reaches dashboard
sj(dev, {"type": "reading", "data": payload})
m = json.loads(dash.recv())
expect(m.get("type") == "reading" and m["data"]["device_id"] == DEV, "live broadcast to dashboard")

# 4) High power reading -> alert generated, broadcast, acknowledged over WS
high = dict(payload)
high["em4m"] = {"voltage": 231.0, "current": 15.0, "power": 5500.0}  # above default EM4M_MAX_POWER (5000)
sj(dev, {"type": "reading", "data": high})
seen_alert = None
dash.settimeout(5)
try:
    while True:
        m2 = json.loads(dash.recv())
        if m2.get("type") == "alert":
            seen_alert = m2["data"]
            break
except Exception:
    pass
expect(seen_alert is not None, "alert generated + broadcast")
if seen_alert:
    got = q("alerts", {"device_id": DEV, "limit": 10})
    match = [a for a in got["data"] if a["id"] == seen_alert["id"] and a["alert_type"] == "over_power"]
    if match:
        acked = q("acknowledge", {"alert_id": seen_alert["id"]})
        expect(acked["type"] == "acknowledge_result" and acked["data"]["acknowledged"] is True, "acknowledge alert over WS")
    else:
        expect(False, "alert persisted over_power")

dev.close()
dash.close()
print("RESULT:", "ALL OK" if not failures else f"{len(failures)} FAILURES: {failures}")
