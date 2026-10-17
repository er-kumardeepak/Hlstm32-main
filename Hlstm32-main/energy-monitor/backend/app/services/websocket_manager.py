"""WebSocket connection manager for broadcasting readings and alerts."""
import asyncio
import logging
from typing import Any, Set

from fastapi import WebSocket

logger = logging.getLogger("energy.ws")


class WebSocketManager:
    def __init__(self) -> None:
        self._dashboards: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    @property
    def connection_count(self) -> int:
        return len(self._dashboards)

    async def accept_dashboard(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._dashboards.add(ws)
        logger.info("WS dashboard connected (%d total)", len(self._dashboards))

    async def unregister(self, ws: WebSocket) -> None:
        async with self._lock:
            self._dashboards.discard(ws)
        logger.info("WS dashboard disconnected (%d total)", len(self._dashboards))

    @staticmethod
    async def send(ws: WebSocket, payload: dict[str, Any]) -> None:
        await ws.send_json({"type": payload["type"], "data": payload["data"]})

    async def broadcast_to_dashboards(self, msg_type: str, data: dict[str, Any]) -> None:
        """Send a message to every connected dashboard client. A failing
        client is dropped so a broken socket never blocks the pipeline."""
        async with self._lock:
            targets = list(self._dashboards)
        for ws in targets:
            try:
                await WebSocketManager.send(ws, {"type": msg_type, "data": data})
            except Exception:
                await self.unregister(ws)


async def broadcast_to_dashboards(msg_type: str, data: dict[str, Any]) -> None:
    """Module-level helper so handlers never need to import `manager` twice."""
    await manager.broadcast_to_dashboards(msg_type, data)


async def send_json(ws: WebSocket, msg_type: str, data: Any) -> None:
    await ws.send_json({"type": msg_type, "data": data})


async def send_msg(ws: WebSocket, envelope: dict) -> None:
    """Send a flat envelope verbatim (for request/response replies that carry
    top-level request_id alongside type/data)."""
    await ws.send_json(envelope)


def register_dashboard(ws: WebSocket) -> None:
    """Sync registration hook (accept already happened): just track the socket.

    Kept for the dashboard endpoint, which registers immediately after accept.
    """
    manager._dashboards.add(ws)


def unregister_dashboard(ws: WebSocket) -> None:
    manager._dashboards.discard(ws)


manager = WebSocketManager()
