# LEGO SPIKE Prime / MINDSTORMS Robot Inventor VS Code Extension

This VS Code extension enables developers to connect to LEGO SPIKE Prime and MINDSTORMS Robot Inventor hubs via Bluetooth/USB, upload Python programs, and control execution. It targets **HubOS3 only** (v2.x+ of extension).

## Architecture Overview

### Dual Extension Design

- **Node.js Extension** (`src/extension.ts`): Full featured with BLE, USB, file system access, and compilation
- **Web Extension** (`src/web/extension.ts`): Browser-compatible with WebUSB only, no filesystem preprocessing
- **Shared Core** (`src/shared-extension.ts`): Common commands, status management, and hub communication logic

### Client Architecture Pattern

Abstract base client (`src/clients/base-client.ts`) with transport-specific implementations:

- `BleClient`: Bluetooth Low Energy via `@stoprocent/noble`
- `UsbClient`: Serial port communication via `serialport`
- `WebUsbClient`: Browser WebUSB API

All clients implement the same protocol: COBS-encoded binary messages over transport layer.

### Message Protocol

Hub communication uses structured message classes in `src/messages/`:

- Binary protocol with COBS encoding (`src/cobs.ts`)
- Request/response pairs (e.g., `StartFileUploadRequest/Response`)
- Async notifications (console output, program flow changes)
- CRC32 validation for file transfers

## Key Development Patterns

### File Upload Pipeline

1. **Preprocessing**: Import resolution (`from file_name import *`) - Node.js only
2. **Custom Preprocessor**: Optional external script via stdin/stdout
3. **Compilation**: Optional Python→MPY via `@pybricks/mpy-cross-v6`
4. **Chunked Upload**: Split by `maxChunkSize` with CRC validation

### Program Headers

Python files can include slot/autostart metadata:

```python
# LEGO slot:5 autostart
```

Parsed in `getProgramInfo()` to skip manual slot selection.

### Status Management

- Hub connection state via status bar item
- Context variables for command visibility (`lego-spikeprime-mindstorms-vscode.isConnectedIn`)
- Progress notifications for long operations
- Persistent terminal for hub logs

## Build System

### Webpack Configuration

Two separate builds in `webpack.config.js`:

- **Node.js target**: Full extension with native dependencies
- **Web target**: Browser-compatible with polyfills, different entry point

### Native Dependencies

Prebuilt binaries in `prebuilds/` for platform-specific modules:

- Noble (Bluetooth) - excluded on Windows
- Serialport native bindings
- Applied via `patch-package` for compatibility

### Development Commands

```bash
npm run compile        # Development build via webpack
npm run webpack        # Production build
npm run watch-web      # Web extension development
npm run open-in-browser # Test web extension
```

## Testing Strategy

VS Code test runner in `src/test/` with COBS encoding unit tests. Extension testing requires VS Code Extension Host.

## Platform-Specific Considerations

- **Windows**: Bluetooth HCI socket excluded from build
- **Web**: No file system access, no preprocessing, simplified upload
- **WASM**: mpy-cross compilation bundled as WebAssembly asset

## Configuration Schema

Settings in `package.json` `contributes.configuration`:

- `compileBeforeUpload`: Enable Python→MPY compilation
- `customPrepocessorPath`: External preprocessor script path
- Bluetooth discovery continues until the hub picker is dismissed or a hub is selected
- `saveFileToUpload`: Persist assembled files for debugging
