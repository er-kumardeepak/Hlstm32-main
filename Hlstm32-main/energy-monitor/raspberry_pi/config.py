import os

DEVICE_ID = os.getenv("DEVICE_ID", "energy-monitor-01")
SERIAL_PORT = os.getenv("SERIAL_PORT", "/dev/ttyUSB0")
SERIAL_BAUD = int(os.getenv("SERIAL_BAUD", "115200"))
# Backend ingestion WebSocket (NOT a REST URL any more).
WS_URL = os.getenv(
    "WS_URL",
    "ws://192.168.1.100:8000/ws/device",
)
API_KEY = os.getenv("DEVICE_API_KEY", "")
