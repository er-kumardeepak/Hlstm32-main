# HIstm32

Dual-core STM32H755 firmware for an energy-monitoring system. The current Cortex-M7 application reads measurements from EM2M and EM4M energy meters over Modbus RTU and sends a combined text record over UART. The Cortex-M4 project participates in the STM32H7 dual-core boot sequence.

Anomaly detection and energy optimization are project goals; they are not implemented in the current firmware.

## Hardware and Tools

- MCU: STM32H755ZIT6, LQFP144
- Board configuration: NUCLEO-H755ZI-Q
- IDE and code generation: STM32CubeIDE / STM32CubeMX
- Firmware package: STM32CubeH7 v1.13.0
- Compiler: GNU Arm Embedded Toolchain (the checked-in generated makefiles identify GNU Tools for STM32 14.3.rel1)

Open `HIstm32.ioc` in STM32CubeIDE, then build both the CM7 and CM4 projects. The generated linker scripts and CubeIDE build files are under their respective core directories.

## Firmware Behavior

The CM7 application polls slave ID `1` on both meters using Modbus function `0x04` (read input registers). Each value is read as two registers and checked with Modbus CRC-16.

| Meter | UART | Baud | Measurements and register addresses |
| --- | --- | ---: | --- |
| EM2M single-phase | USART2 | 9600 | Voltage `0x0014`, current `0x0016`, active power `0x000E` |
| EM4M three-phase | USART1 | 9600 | V1N voltage `0x0000`, I1 current `0x0010`, active power `0x0018` |

Both meter ports use 8 data bits, no parity, and 1 stop bit (8-N-1). USART6 sends the combined readings at 115200 baud, also 8-N-1, in this format:

```text
EM2M: V=..., I=..., P=... | EM4M: V=..., I=..., P=...
```

Use the meter interfaces/transceivers and UART pin assignments appropriate to the board wiring. The pin configuration is defined in `HIstm32.ioc`.

## Repository Layout

| Path | Contents |
| --- | --- |
| `HIstm32.ioc` | STM32CubeMX configuration |
| `CM7/` | Cortex-M7 application, startup code, linker scripts, and build files |
| `CM4/` | Cortex-M4 application, startup code, linker scripts, and build files |
| `Common/` | Shared dual-core boot support |
| `Drivers/` | STM32 HAL, CMSIS, and Nucleo board support files |
