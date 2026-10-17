"""SQLAlchemy ORM models.

Future-ready: new measured fields can be added as nullable columns (frequency,
power_factor, energy_kwh, phase voltages/currents, reactive/apparent power)
without breaking existing rows.
"""
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
)

from app.database import Base

# SQLite only autoincrements an INTEGER primary key, so BigInteger gets an
# Integer variant under SQLite while staying a real BIGINT on PostgreSQL.
BigIntPK = BigInteger().with_variant(Integer, "sqlite")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True)
    device_id = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(128), default="")
    location = Column(String(128), default="")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(16), default="offline")  # online | offline


class EnergyReading(Base):
    __tablename__ = "energy_readings"

    id = Column(BigIntPK, primary_key=True, autoincrement=True)
    device_id = Column(String(64), ForeignKey("devices.device_id"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)

    # EM2M single-phase meter
    em2m_voltage = Column(Float, nullable=True)
    em2m_current = Column(Float, nullable=True)
    em2m_power = Column(Float, nullable=True)

    # EM4M three-phase meter
    em4m_voltage = Column(Float, nullable=True)
    em4m_current = Column(Float, nullable=True)
    em4m_power = Column(Float, nullable=True)

    # Future-ready optional fields
    frequency = Column(Float, nullable=True)
    power_factor = Column(Float, nullable=True)
    energy_kwh = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


Index("ix_readings_device_ts", EnergyReading.device_id, EnergyReading.timestamp)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(BigIntPK, primary_key=True, autoincrement=True)
    device_id = Column(String(64), ForeignKey("devices.device_id"), nullable=False, index=True)
    reading_id = Column(BigInteger, nullable=True)
    alert_type = Column(String(64), nullable=False)
    severity = Column(String(16), nullable=False)  # critical | warning | info
    title = Column(String(128), nullable=False)
    message = Column(String(256), nullable=False)
    value = Column(Float, nullable=True)
    threshold = Column(Float, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    acknowledged = Column(Boolean, default=False, nullable=False)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
