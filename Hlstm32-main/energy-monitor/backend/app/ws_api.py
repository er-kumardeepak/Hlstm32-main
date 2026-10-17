"""Pure WebSocket backend — no REST endpoints.

Two sockets:

  /ws/device     Raspberry Pi (or mock device) pushes readings:
                   -> {"type": "reading", "data": {ReadingCreate fields}}
                   <- {"type": "reading_ack", "data": {reading_id, alerts_generated}}
                 When DEVICE_API_KEY is set the FIRST message must be
                   -> {"type": "auth", "data": {"api_key": "..."}}
                   <- {"type": "auth_ok"}

  /ws/dashboard  React dashboard: live push of "reading" / "alert" events,
                 plus request/response queries:
                   -> {"type": "history", "request_id": 1, "params": {...}}
                   <- {"type": "history_result", "request_id": 1, "data": [...]}
                 Supported query types: latest, history, aggregate, devices,
                 device, alerts, acknowledge, health, ml_status.

Device status is recomputed on every devices/device query, mirroring the old
REST behaviour.
"""
import datetime
import logging
from typing import Any, Optional

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal
from app.models import Alert, Device, EnergyReading, utcnow
from app.schemas import (
    AlertAcknowledge,
    AlertOut,
    HealthResponse,
    ReadingCreate,
    ReadingOut,
    WsEnvelope,
)
from app.services.alert_service import check_reading
from app.services.websocket_manager import broadcast_to_dashboards, send_json, send_msg

logger = logging.getLogger("energy.wsapi")

VALID_INTERVALS = {"1min": 60, "5min": 300, "15min": 900, "1hour": 3600, "1day": 86400}
QUERY_TYPES = {
    "latest", "history", "aggregate", "devices", "device",
    "alerts", "acknowledge", "health", "ml_status",
}


def _now_utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _compute_status(last_seen, now=None) -> str:
    now = now or _now_utc()
    if last_seen is None:
        return "offline"
    seen = last_seen.replace(tzinfo=datetime.timezone.utc) if last_seen.tzinfo is None else last_seen
    aware_now = now if now.tzinfo else now.replace(tzinfo=datetime.timezone.utc)
    elapsed = (aware_now - seen).total_seconds()
    return "online" if elapsed <= settings.DEVICE_OFFLINE_SECONDS else "offline"


# --------------------------------------------------------------------------
# Query handlers — each returns (result, error_detail)
# --------------------------------------------------------------------------

def _q_latest(db, params):
    q = db.query(EnergyReading).order_by(EnergyReading.timestamp.desc(), EnergyReading.id.desc())
    if params.get("device_id"):
        q = q.filter(EnergyReading.device_id == params["device_id"])
    reading = q.first()
    if reading is None:
        return None, "No readings available"
    return ReadingOut.model_validate(reading).model_dump(mode="json"), None


def _q_history(db, params):
    q = db.query(EnergyReading)
    if params.get("device_id"):
        q = q.filter(EnergyReading.device_id == params["device_id"])
    if params.get("from"):
        q = q.filter(EnergyReading.timestamp >= _parse_dt(params["from"]))
    if params.get("to"):
        q = q.filter(EnergyReading.timestamp <= _parse_dt(params["to"]))
    limit = max(1, min(int(params.get("limit", 500)), 10000))
    rows = q.order_by(EnergyReading.timestamp.desc(), EnergyReading.id.desc()).limit(limit).all()
    return [ReadingOut.model_validate(r).model_dump(mode="json") for r in rows], None


def _q_aggregate(db, params):
    interval = params.get("interval", "5min")
    if interval not in VALID_INTERVALS:
        return None, f"interval must be one of {', '.join(VALID_INTERVALS)}"
    minutes = max(1, min(int(params.get("minutes", 60)), 20160))

    cutoff = utcnow() - datetime.timedelta(minutes=minutes)
    q = db.query(EnergyReading).filter(EnergyReading.timestamp >= cutoff)
    if params.get("device_id"):
        q = q.filter(EnergyReading.device_id == params["device_id"])
    rows = q.order_by(EnergyReading.timestamp.asc()).all()

    bucket_seconds = VALID_INTERVALS[interval]
    buckets: dict[int, list[EnergyReading]] = {}
    for row in rows:
        ts = row.timestamp.replace(tzinfo=datetime.timezone.utc) if row.timestamp.tzinfo is None else row.timestamp
        key = int(ts.timestamp() // bucket_seconds)
        buckets.setdefault(key, []).append(row)

    result = []
    for key in sorted(buckets):
        rows_b = buckets[key]
        bucket_start = datetime.datetime.fromtimestamp(key * bucket_seconds, tz=datetime.timezone.utc)

        def stats(attr: str):
            values = [getattr(r, attr) for r in rows_b if getattr(r, attr) is not None]
            if not values:
                return None
            return {
                "avg": round(sum(values) / len(values), 3),
                "min": round(min(values), 3),
                "max": round(max(values), 3),
            }

        result.append({
            "bucket_start": bucket_start.isoformat(),
            "interval": interval,
            "count": len(rows_b),
            "em2m": {"voltage": stats("em2m_voltage"), "current": stats("em2m_current"), "power": stats("em2m_power")},
            "em4m": {"voltage": stats("em4m_voltage"), "current": stats("em4m_current"), "power": stats("em4m_power")},
        })
    return result, None


def _q_devices(db, params):
    now = _now_utc()
    devices = db.query(Device).order_by(Device.created_at).all()
    for d in devices:
        d.status = _compute_status(d.last_seen, now)
    if params.get("status"):
        devices = [d for d in devices if d.status == params["status"]]
    from app.schemas import DeviceOut
    return [DeviceOut.model_validate(d).model_dump(mode="json") for d in devices], None


def _q_device(db, params):
    device = db.query(Device).filter(Device.device_id == params.get("device_id", "")).first()
    if device is None:
        return None, "Device not found"
    device.status = _compute_status(device.last_seen)
    from app.schemas import DeviceOut
    return DeviceOut.model_validate(device).model_dump(mode="json"), None


def _q_alerts(db, params):
    q = db.query(Alert).order_by(Alert.timestamp.desc())
    if params.get("device_id"):
        q = q.filter(Alert.device_id == params["device_id"])
    if params.get("severity"):
        q = q.filter(Alert.severity == params["severity"])
    if params.get("acknowledged") is not None:
        q = q.filter(Alert.acknowledged == bool(params["acknowledged"]))
    if params.get("date"):
        day = datetime.datetime.fromisoformat(str(params["date"]))
        end = day + datetime.timedelta(days=1)
        if day.tzinfo is None:
            day = day.replace(tzinfo=datetime.timezone.utc)
            end = end.replace(tzinfo=datetime.timezone.utc)
        q = q.filter(Alert.timestamp >= day, Alert.timestamp < end)
    limit = max(1, min(int(params.get("limit", 200)), 1000))
    return [AlertOut.model_validate(a).model_dump(mode="json") for a in q.limit(limit).all()], None


def _q_acknowledge(db, params):
    body = AlertAcknowledge(acknowledged=bool(params.get("acknowledged", True)))
    alert = db.query(Alert).filter(Alert.id == int(params.get("alert_id", 0))).first()
    if alert is None:
        return None, "Alert not found"
    alert.acknowledged = body.acknowledged
    alert.acknowledged_at = _now_utc() if body.acknowledged else None
    db.commit()
    db.refresh(alert)
    return AlertOut.model_validate(alert).model_dump(mode="json"), None


def _q_health(db, _params):
    status_ = "ok"
    database_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        database_status = "unavailable"
        status_ = "degraded"
    return HealthResponse(status=status_, database=database_status, version=settings.APP_VERSION).model_dump(mode="json"), None


def _q_ml_status(db, _params):
    return {
        "enabled": settings.ML_ENABLED,
        "modules": ["load_predictor", "voltage_predictor", "anomaly_detector"],
        "message": "ML prediction will become available after sufficient historical data has been collected.",
    }, None


def _parse_dt(value: Any) -> datetime.datetime:
    if isinstance(value, datetime.datetime):
        return value
    return datetime.datetime.fromisoformat(str(value))


QUERY_HANDLERS = {
    "latest": _q_latest,
    "history": _q_history,
    "aggregate": _q_aggregate,
    "devices": _q_devices,
    "device": _q_device,
    "alerts": _q_alerts,
    "acknowledge": _q_acknowledge,
    "health": _q_health,
    "ml_status": _q_ml_status,
}


def _store_reading(db, payload: ReadingCreate):
    """Validate -> auto-register device -> store -> mark device online."""
    device = db.query(Device).filter(Device.device_id == payload.device_id).first()
    if device is None:
        device = Device(
            device_id=payload.device_id,
            name=payload.device_id.replace("-", " ").title(),
            location="",
            last_seen=None,
            status="offline",
        )
        db.add(device)
        db.flush()

    timestamp = payload.timestamp or utcnow()
    reading = EnergyReading(
        device_id=payload.device_id,
        timestamp=timestamp,
        em2m_voltage=payload.em2m.voltage if payload.em2m else None,
        em2m_current=payload.em2m.current if payload.em2m else None,
        em2m_power=payload.em2m.power if payload.em2m else None,
        em4m_voltage=payload.em4m.voltage if payload.em4m else None,
        em4m_current=payload.em4m.current if payload.em4m else None,
        em4m_power=payload.em4m.power if payload.em4m else None,
    )
    db.add(reading)
    db.flush()

    device.last_seen = timestamp
    device.status = "online"
    db.commit()
    db.refresh(reading)
    return reading


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

async def device_ws(ws: WebSocket):
    """Ingestion socket for the Raspberry Pi / mock device."""
    await ws.accept()
    db = SessionLocal()
    try:
        # Optional API-key handshake BEFORE anything else.
        if settings.DEVICE_API_KEY:
            first = await ws.receive_json()
            if first.get("type") != "auth" or first.get("data", {}).get("api_key") != settings.DEVICE_API_KEY:
                await send_json(ws, "auth_failed", {"detail": "Invalid or missing api_key"})
                await ws.close(code=4401)
                return
            await send_json(ws, "auth_ok", {})

        while True:
            msg = await ws.receive_json()
            msg_type = msg.get("type")

            if msg_type != "reading":
                await send_json(ws, "error", {"detail": f"unknown type {msg_type!r}"})
                continue

            try:
                payload = ReadingCreate.model_validate(msg.get("data", {}))
            except ValidationError as exc:
                await send_json(ws, "error", {"detail": f"invalid reading: {exc.errors()[:1]}"})
                continue
            except Exception:
                logger.exception("malformed ingestion message")
                await send_json(ws, "error", {"detail": "malformed message"})
                continue

            try:
                reading = _store_reading(db, payload)
                new_alerts = check_reading(db, reading, payload)
            except Exception as exc:
                logger.warning("failed to store reading: %s", exc)
                await send_json(ws, "error", {"detail": f"failed to store reading: {exc}"})
                continue

            ack = WsEnvelope(
                type="reading_ack",
                data={"reading_id": reading.id, "alerts_generated": len(new_alerts)},
            )
            try:
                await send_json(ws, ack.type, ack.data)
            except Exception:
                pass  # device socket gone; still broadcast below

            # Push the live stream to dashboards.
            await broadcast_to_dashboards(
                "reading", ReadingOut.model_validate(reading).model_dump(mode="json")
            )
            for alert in new_alerts:
                await broadcast_to_dashboards(
                    "alert", AlertOut.model_validate(alert).model_dump(mode="json")
                )
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception("device socket error: %s", exc)
    finally:
        db.close()


async def dashboard_ws(ws: WebSocket):
    """Live stream + request/response queries for dashboard clients."""
    from app.services.websocket_manager import register_dashboard, unregister_dashboard

    await ws.accept()
    register_dashboard(ws)
    db = SessionLocal()
    try:
        while True:
            msg = await ws.receive_json()
            msg_type = msg.get("type")
            req_id = msg.get("request_id")

            if msg_type not in QUERY_HANDLERS:
                await send_msg(ws, {"type": "error", "request_id": req_id, "detail": f"unknown query type {msg_type!r}"})
                continue

            handler = QUERY_HANDLERS[msg_type]
            try:
                result, error = handler(db, msg.get("params") or {})
            except Exception as exc:
                logger.exception("query %s failed", msg_type)
                await send_msg(ws, {"type": "error", "request_id": req_id, "detail": str(exc)})
                continue

            if error is not None:
                await send_msg(ws, {"type": "error", "request_id": req_id, "detail": error})
            else:
                await send_msg(ws, {"type": f"{msg_type}_result", "request_id": req_id, "data": result})
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception("dashboard socket error: %s", exc)
    finally:
        unregister_dashboard(ws)
        db.close()
