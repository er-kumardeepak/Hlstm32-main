"""Pydantic schemas for API requests/responses and WebSocket payloads."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MeterReading(BaseModel):
    """One meter snapshot. Extra measured values may be added here later
    (frequency, power_factor, energy_kwh, phase voltages/currents, ...)."""

    voltage: float = Field(..., ge=0, le=1000, description="Voltage in volts (RMS)")
    current: float = Field(..., ge=0, le=500, description="Current in amperes (RMS)")
    power: float = Field(..., description="Active power in watts. Negative values allowed for future bidirectional meters.", le=100000)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {"voltage": 229.3, "current": 3.42, "power": 712.4}
        }
    )


class ReadingCreate(BaseModel):
    """Payload posted by the Raspberry Pi (or mock device)."""

    device_id: str = Field(..., min_length=1, max_length=64)
    timestamp: Optional[datetime] = Field(
        None, description="ISO 8601 timestamp. Assigned server-side when omitted."
    )
    em2m: Optional[MeterReading] = None
    em4m: Optional[MeterReading] = None

    @field_validator("device_id")
    @classmethod
    def validate_device_id(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("device_id must not be empty")
        return v

    @field_validator("em2m", "em4m")
    @classmethod
    def at_least_one_meter(cls, v, info):
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "device_id": "energy-monitor-01",
                "timestamp": "2026-10-14T10:30:00+05:30",
                "em2m": {"voltage": 229.3, "current": 3.42, "power": 712.4},
                "em4m": {"voltage": 231.1, "current": 5.11, "power": 1084.0},
            }
        }
    )


class ReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: str
    timestamp: datetime
    em2m_voltage: Optional[float] = None
    em2m_current: Optional[float] = None
    em2m_power: Optional[float] = None
    em4m_voltage: Optional[float] = None
    em4m_current: Optional[float] = None
    em4m_power: Optional[float] = None
    frequency: Optional[float] = None
    power_factor: Optional[float] = None
    energy_kwh: Optional[float] = None
    created_at: datetime


class ReadingStoreResponse(BaseModel):
    success: bool = True
    message: str = "Reading stored successfully"
    reading_id: Optional[int] = None
    alerts_generated: int = 0


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    device_id: str
    name: str
    location: str
    created_at: datetime
    last_seen: Optional[datetime] = None
    status: str


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: str
    reading_id: Optional[int] = None
    alert_type: str
    severity: str
    title: str
    message: str
    value: Optional[float] = None
    threshold: Optional[float] = None
    timestamp: datetime
    acknowledged: bool
    acknowledged_at: Optional[datetime] = None


class AlertAcknowledge(BaseModel):
    acknowledged: bool = True


class HealthResponse(BaseModel):
    status: str
    database: str
    version: str


class WsEnvelope(BaseModel):
    """Generic WebSocket message envelope."""
    type: str  # "reading" | "alert" | "health"
    data: dict
