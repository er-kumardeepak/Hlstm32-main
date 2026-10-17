# Raspberry Pi bridge

Reads the UART line from the STM32H755 (USART6, 115200 8-N-1) and streams each
reading to the FastAPI backend over **WebSocket** (`/ws/device`).

```
EM2M/EM4M meters -> STM32 (Modbus RTU) --UART--> Raspberry Pi --WS /ws/device--> backend
```

## Install

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Configure

Settings come from environment variables (or copy them into a `.env` you source):

| Variable | Default | Meaning |
| --- | --- | --- |
| `DEVICE_ID` | `energy-monitor-01` | Device identifier sent to backend |
| `SERIAL_PORT` | `/dev/ttyUSB0` | UART port (see *STM32 ↔ Pi wiring* below) |
| `SERIAL_BAUD` | `115200` | Must match STM32 USART6 |
| `WS_URL` | `ws://192.168.1.100:8000/ws/device` | Backend ingestion WebSocket (NOT a REST URL) |
| `DEVICE_API_KEY` | *(empty)* | Sent as an `auth` handshake if the backend sets `DEVICE_API_KEY` |

Run the backend first, then:

```bash
python main_runner.py
```

## Behaviour

- Reconnects automatically if the serial port or backend drop out.
- While the backend is offline, readings are queued (up to 500) and flushed on
  reconnect — nothing is lost during a short outage.
- Each accepted reading gets a `reading_ack` back from the backend.
- Skips unparseable lines but always prints them for debugging.

Logs:

```text
[UART] Connected
[READ] EM2M V=229.3 I=3.42 P=712.4
[WS] Connected to ws://...:8000/ws/device
```

---

## STM32 ↔ Pi UART wiring (the usual "can't connect" culprit)

The STM32H755 runs the meters on Modbus RTU and prints the reading line on
**USART6 @ 115200 8-N-1**. Connect it to the Pi like this:

| STM32 (USART6) | Raspberry Pi (GPIO UART / USB-serial) |
| --- | --- |
| TX | **RX** (GPIO15 `/dev/serial0`, or USB-adapter RX) |
| RX (optional) | TX (GPIO14) — only needed to ACK the STM32 |
| GND | GND — **always, even with a USB cable** |

1. **TX goes to RX.** Crossed lines, not TX→TX.
2. **Common ground.** floating grounds cause garbage bytes.
3. **Voltage levels.** Both are 3.3 V logic on Pi GPIO UART — direct connect is
   safe. Never wire a 5 V TTL to the Pi GPIO UART.
4. If you use a cheap USB-TTL adapter (CP2102/CH340) you get `/dev/ttyUSB0`;
   the Pi's own GPIO UART is `/dev/serial0` (or `/dev/ttyAMA0`).

### Enable the Pi's GPIO UART (only if NOT using a USB adapter)

```bash
sudo raspi-config
# Interface Options -> Serial Port:
#   login shell over serial?  -> No
#   serial port hardware      -> Yes
sudo reboot
```

If `/dev/serial0` doesn't appear, add to `/boot/config.txt`/`/boot/firmware/config.txt`:

```
enable_uart=1
dtoverlay=disable-bt   # frees the good PL011 UART from Bluetooth
```

### Permission errors

`[Errno 13] could not open port` → add yourself to the dialout group:

```bash
sudo usermod -aG dialout $USER   # then log out and back in
```

### Is data arriving at all?

```bash
# raw bytes straight from the port (Ctrl+C to quit)
cat /dev/ttyUSB0          # or: cat /dev/serial0
# or better, with framing:
python -m serial.tools.miniterm /dev/serial0 115200
```

You should see lines like:
`EM2M: V=229.3, I=3.42, P=712.4 | EM4M: V=231.1, I=5.11, P=1084.0`

- **Nothing at all** → wiring (TX→RX), baud rate, or STM32 isn't printing.
- **Garbage characters** → baud mismatch, ground missing, or wrong step.
- **Port not found** → `ls -la /dev/tty*`, `dmesg | tail -20` right after plugging in.

### Is the backend reachable?

```bash
python -c "import websocket,sys; websocket.create_connection('ws://<backend_ip>:8000/ws/device',timeout=5); print('ok')"
```

If this fails but the Pi **otherwise has internet**, check the backend host's
firewall — the backend now only listens on **two WebSocket routes**
(`/ws/device`, `/ws/dashboard`), and the `WS_URL` must start with `ws://` (not `http://`).
