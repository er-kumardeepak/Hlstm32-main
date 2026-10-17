"""Rule-based alert engine with per-device cooldown deduplication.

Thresholds come from environment settings (see backend/.env.example).
Cooldown prevents a continuous violation from firing an alert on every reading.
"""
import time
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Alert, EnergyReading
from app.schemas import ReadingCreate

RULES = {
    "low_voltage": {
        "severity": "warning",
        "title": "Low Voltage Detected",
        "message": "{meter} voltage is below the configured minimum.",
        "comparison": "lt",
    },
    "high_voltage": {
        "severity": "warning",
        "title": "High Voltage Detected",
        "message": "{meter} voltage is above the configured maximum.",
        "comparison": "gt",
    },
    "over_current": {
        "severity": "critical",
        "title": "Over-Current Detected",
        "message": "{meter} current exceeded the configured maximum.",
        "comparison": "gt",
    },
    "over_power": {
        "severity": "critical",
        "title": "High Load Detected",
        "message": "{meter} active power exceeded the configured maximum.",
        "comparison": "gt",
    },
}

# ((device_id, alert_type)) -> last fired unix time
_last_fired: dict[tuple[str, str], float] = {}
_last_violation: dict[tuple[str, str], float] = {}


def _thresholds() -> dict:
    return {
        ("em2m", "low_voltage"): settings.LOW_VOLTAGE_THRESHOLD,
        ("em2m", "high_voltage"): settings.HIGH_VOLTAGE_THRESHOLD,
        ("em2m", "over_current"): settings.EM2M_MAX_CURRENT,
        ("em2m", "over_power"): settings.EM2M_MAX_POWER,
        ("em4m", "low_voltage"): settings.LOW_VOLTAGE_THRESHOLD,
        ("em4m", "high_voltage"): settings.HIGH_VOLTAGE_THRESHOLD,
        ("em4m", "over_current"): settings.EM4M_MAX_CURRENT,
        ("em4m", "over_power"): settings.EM4M_MAX_POWER,
    }


def _violated(alert_type: str, value: float, threshold: float) -> bool:
    if alert_type == "low_voltage":
        return value < threshold
    return value > threshold


def check_reading(db: Session, reading: EnergyReading, payload: ReadingCreate) -> list[Alert]:
    """Evaluate all rules for a stored reading, honoring the cooldown window."""
    now = time.time()
    new_alerts: list[Alert] = []
    cooldown = float(settings.ALERT_COOLDOWN_SECONDS)

    for meter in ("em2m", "em4m"):
        meter_payload: Optional[dict] = getattr(payload, meter)
        if meter_payload is None:
            continue
        ts = reading.timestamp
        series = {
            "low_voltage": (meter_payload.voltage, getattr(reading, f"{meter}_voltage")),
            "high_voltage": (meter_payload.voltage, getattr(reading, f"{meter}_voltage")),
            "over_current": (meter_payload.current, getattr(reading, f"{meter}_current")),
            "over_power": (meter_payload.power, getattr(reading, f"{meter}_power")),
        }
        for alert_type, (measured, stored) in series.items():
            threshold = _thresholds()[(meter, alert_type)]
            if measured is None or not _violated(alert_type, measured, threshold):
                continue
            key = (payload.device_id, f"{meter}_{alert_type}")
            rule = RULES[alert_type]
            if now - _last_fired.get(key, 0.0) < cooldown:
                _last_violation[key] = now  # still in violation; window resets on recovery
                continue
            alert = Alert(
                device_id=payload.device_id,
                reading_id=reading.id,
                alert_type=alert_type,
                severity=rule["severity"],
                title=rule["title"],
                message=rule["message"].format(meter=meter.upper()),
                value=measured,
                threshold=threshold,
                timestamp=ts,
                acknowledged=False,
            )
            db.add(alert)
            db.flush()
            new_alerts.append(alert)
            _last_fired[key] = now
            _last_violation[key] = now
    db.commit()
    return new_alerts


def is_in_cooldown(cooldown_seconds: Optional[float] = None) -> bool:
    """Utility used by tests/tools."""
    return cooldown_seconds is not None and cooldown_seconds > 0
