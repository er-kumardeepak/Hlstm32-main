"""WebSocket sender for the backend ingestion socket /ws/device.

Replaces the old REST POST sender. Behaviour:
- Connects to ws://<host>:<port>/ws/device with auto-reconnect + backoff.
- If DEVICE_API_KEY is set on the backend it performs the auth handshake.
- While disconnected, readings are queued (bounded) and flushed on reconnect
  so nothing is lost during a short backend outage.
"""
import json
import logging
import queue
import threading
import time
from typing import Optional

import websocket  # websocket-client

logger = logging.getLogger("ws_sender")

MAX_QUEUE = 500


class WsSender:
    """Thread-safe, never-crashing WebSocket ingestion client."""

    def __init__(self, url: str, api_key: str = "", queue_max: int = MAX_QUEUE) -> None:
        self.url = url
        self.api_key = api_key
        self._q: "queue.Queue[dict]" = queue.Queue(maxsize=queue_max)
        self._lock = threading.Lock()
        self._ws: Optional[websocket.WebSocket] = None
        self._next_connect = 0.0

    # -- connection -----------------------------------------------------

    def _connect(self) -> None:
        if time.time() < self._next_connect:
            return
        self._next_connect = time.time() + 3.0
        try:
            ws = websocket.create_connection(self.url, timeout=5)
            if self.api_key:
                ws.send(json.dumps({"type": "auth", "data": {"api_key": self.api_key}}))
                reply = ws.recv_json()  # {"type": "auth_ok"|"auth_failed", ...}
                if reply.get("type") != "auth_ok":
                    logger.error("[WS] Backend rejected the API key — fix DEVICE_API_KEY")
                    ws.close()
                    self._next_connect = time.time() + 10.0
                    return
            with self._lock:
                self._ws = ws
            logger.info("[WS] Connected to %s", self.url)
        except Exception as exc:
            logger.warning("[WS] Backend unavailable (%s). Readings will be queued.", exc)
            self._next_connect = time.time() + 3.0

    def _drop(self) -> None:
        with self._lock:
            if self._ws is not None:
                try:
                    self._ws.close()
                except Exception:
                    pass
                self._ws = None
        self._next_connect = 0.0  # allow reconnect immediately

    # -- public ----------------------------------------------------------

    def send(self, payload: dict) -> bool:
        """Send one reading ({"type": "reading", "data": payload}).

        Returns True on success, False otherwise (queued for retry).
        """
        msg = {"type": "reading", "data": payload}
        with self._lock:
            ws = self._ws
        if ws is None:
            self._connect()
            with self._lock:
                ws = self._ws
        if ws is None:
            return self._enqueue(payload)
        try:
            ws.send(json.dumps(msg))
            # Non-blocking poll for the ack / errors so the UART loop never
            # stalls — the backend also survives this without an ack.
            ws.settimeout(0)
            try:
                _ = ws.recv()
            except Exception:
                pass
            ws.settimeout(5)
            return True
        except Exception:
            self._drop()
            return self._enqueue(payload)

    def _enqueue(self, payload: dict) -> bool:
        try:
            self._q.put_nowait(payload)
        except queue.Full:
            try:
                self._q.get_nowait()  # drop the oldest
                self._q.put_nowait(payload)
            except queue.Empty:
                pass
        return False

    def flush_queue(self) -> int:
        """Retry queued readings. Returns the number successfully sent."""
        sent = 0
        while self._ws is not None:
            try:
                payload = self._q.get_nowait()
            except queue.Empty:
                break
            msg = {"type": "reading", "data": payload}
            with self._lock:
                ws = self._ws
            try:
                ws.send(json.dumps(msg))
                sent += 1
            except Exception:
                self._drop()
                self._q.put(payload)  # put it back
                break
        if sent:
            logger.info("[WS] Flushed %d queued reading(s)", sent)
        return sent

    def service(self) -> None:
        """Call periodically: reconnect if needed and drain the offline queue."""
        if self._ws is None:
            self._connect()
        self.flush_queue()
