"""Raspberry Pi bridge entrypoint.

Reads UART lines from the STM32H755 and streams them to the backend over
WebSocket (/ws/device):
    EM2M: V=..., I=..., P=... | EM4M: V=..., I=..., P=...

Never crashes: serial reconnection, timeouts, WS reconnect + bounded offline
queue so readings survive a temporary backend outage.
"""
import logging
import sys
import time

import serial  # type: ignore

from config import API_KEY, DEVICE_ID, SERIAL_BAUD, SERIAL_PORT, WS_URL
from serial_reader import parse_line
from ws_sender import WsSender

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("bridge")

RETRY_DELAY_SECONDS = 2.0
SERVICE_EVERY = 5.0  # seconds between reconnect attempts / queue flushes


def open_serial():
    log.info("[UART] Connecting to %s @ %d baud ...", SERIAL_PORT, SERIAL_BAUD)
    ser = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=0.2, parity="N", stopbits=1)
    log.info("[UART] Connected")
    return ser


def main():
    sender = WsSender(WS_URL, api_key=API_KEY)
    last_service = 0.0

    while True:
        ser = None
        try:
            ser = open_serial()
            while True:
                # Every few seconds: reconnect to the backend if needed and
                # flush any readings queued while it was offline.
                now = time.time()
                if now - last_service >= SERVICE_EVERY:
                    last_service = now
                    try:
                        sender.service()
                    except Exception as exc:
                        log.warning("[WS] service() error: %s", exc)

                raw = ser.readline()
                if not raw:
                    continue  # keep-alive timeout tick
                line = raw.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    payload = parse_line(DEVICE_ID, line)
                except Exception as exc:
                    log.warning("[READ] Invalid line skipped (%s): %r", exc, line)
                    continue
                if payload is None:
                    continue
                log.info(
                    "[READ] EM2M V=%.2f I=%.2f P=%.2f | EM4M V=%.2f I=%.2f P=%.2f",
                    payload["em2m"]["voltage"], payload["em2m"]["current"], payload["em2m"]["power"],
                    payload["em4m"]["voltage"], payload["em4m"]["current"], payload["em4m"]["power"],
                )
                sender.send(payload)
        except serial.SerialException as exc:
            log.error("[UART] Serial error: %s. Reconnecting in %.0fs...", exc, RETRY_DELAY_SECONDS)
        except KeyboardInterrupt:
            log.info("[UART] Stopped by user")
            if ser is not None:
                ser.close()
            break
        except Exception as exc:  # never die: reconnect and keep retrying
            log.error("[UART] Unexpected error: %s. Retrying...", exc)
        time.sleep(RETRY_DELAY_SECONDS)


if __name__ == "__main__":
    main()
