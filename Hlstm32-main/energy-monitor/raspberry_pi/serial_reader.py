"""Parses the UART line emitted by the STM32H755 CM7 application.

Expected line format (see HIstm32 firmware, USART6, 115200 8-N-1):

    EM2M: V=229.3, I=3.42, P=712.4 | EM4M: V=231.1, I=5.11, P=1084.0
"""
import re
from datetime import datetime, timezone
from typing import Optional

LINE_RE = re.compile(
    r"EM2M\s*:\s*V\s*=\s*([-+0-9.eE]+)\s*,\s*I\s*=\s*([-+0-9.eE]+)\s*,\s*P\s*=\s*([-+0-9.eE]+)"
    r"\s*\|\s*"
    r"EM4M\s*:\s*V\s*=\s*([-+0-9.eE]+)\s*,\s*I\s*=\s*([-+0-9.eE]+)\s*,\s*P\s*=\s*([-+0-9.eE]+)"
)


class ParseError(ValueError):
    pass


def parse_line(device_id: str, line: str) -> Optional[dict]:
    """Convert one UART line into the reading payload for the WS ingestion.

    Returns None for empty lines; raises ParseError for unparseable content
    so the caller can log and skip it. Use with serial reconnection logic in
    main_runner.py (see README).
    """
    if not line:
        return None
    match = LINE_RE.search(line)
    if match is None:
        raise ParseError(f"unrecognized line: {line!r}")

    em2m_v, em2m_i, em2m_p, em4m_v, em4m_i, em4m_p = (float(g) for g in match.groups())
    if min(em2m_v, em2m_i, em4m_v, em4m_i) < 0:
        raise ValueError("negative voltage/current from meter")
    if any(v != v for v in (em2m_v, em2m_i, em4m_v, em4m_i)):
        raise ValueError("NaN value from meter")

    return build_payload(
        device_id,
        em2m=(em2m_v, em2m_i, em2m_p),
        em4m=(em4m_v, em4m_i, em4m_p),
    )


def build_payload(
    device_id: str,
    em2m: tuple[float, float, float],
    em4m: tuple[float, float, float],
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "device_id": device_id,
        "timestamp": now,
        "em2m": {"voltage": em2m[0], "current": em2m[1], "power": em2m[2]},
        "em4m": {"voltage": em4m[0], "current": em4m[1], "power": em4m[2]},
    }
