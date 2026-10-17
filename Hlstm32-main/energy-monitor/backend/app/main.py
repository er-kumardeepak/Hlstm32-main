"""FastAPI application entrypoint — WebSocket-only backend (no REST API).

Run with: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Sockets:
  /ws/device     Raspberry Pi / mock device pushes readings here.
  /ws/dashboard  React dashboard: live stream + request/response queries.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.database import Base, engine
from app.ws_api import dashboard_ws, device_ws

DESCRIPTION = """
WebSocket-only backend for the STM32H755-based **Energy Monitoring System**.

Pipeline: EM2M/EM4M meters → STM32 (Modbus RTU) → Raspberry Pi (UART) →
**this backend (WebSocket /ws/device)** → PostgreSQL/SQLite → WebSocket
(/ws/dashboard) → React dashboard.
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=DESCRIPTION,
    lifespan=lifespan,
)

app.websocket("/ws/device")(device_ws)
app.websocket("/ws/dashboard")(dashboard_ws)


@app.get("/", include_in_schema=False)
def root():
    return {"name": settings.APP_NAME, "sockets": ["/ws/device", "/ws/dashboard"]}
