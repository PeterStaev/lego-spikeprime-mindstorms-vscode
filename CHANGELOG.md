# Change Log

## 2.1.0 - 2025-05-25

- Add USB connection support for HubOS3
- Add support for a custom preprocessor

## 2.0.0 - 2025-05-12

- Refactor plugin to work with HubOS3 BLE connection

## 1.7.1 - 2024-01-27

- Disconnect monitoring (#47)

## 1.7.0 - 2022-04-10

- Multifile support (#58)
- Updated SerialPort dependencies

## 1.6.0 - 2022-04-10

- Update to support vscode 1.66
- Updated SerialPort dependencies which should make the plugin run without problem on all environments and future versions of vscode because of the provide NAPI bindings.

## 1.5.0 - 2022-02-13

- Add timeout to commands executed on the hub. Default is 30 seconds and can be changed under vscode settings.
- Fix `print` not printing correctly new lines in console.

## 1.4.0 - 2021-10-29

- Add title menu buttons for easier access to commands

## 1.3.1 - 2021-09-25

- Enhance prnting to correct new lines and bare printing numbers
- Fix auto-uploading of programs to slot 0

## 1.3.0 - 2021-09-22

- Bundle extension with `webpack` improving load performance and minimizing size

## 1.2.2 - 2021-09-08

- Add support for VSCode 1.59+ for Apple Silicon

## 1.2.1 - 2021-08-29

- Add support for Linux x64 platform

## 1.2.0 - 2021-08-22

- Add support for native python `print` command (it is no longer needed to override with the spike prime version!)
- Print error when local MPY compile fails
- Don't use temp file for compiled MPY result. Stream the result directly from memmory.

## 1.1.1 - 2021-08-09

- Add support for VSCode 1.59+ (macOS x64, win32 and win64)

## 1.1.0 - 2021-08-02

- Added option to compile programs to MPY before uploading to the LEGO Brick
- Fix `print` to be faster and not delay program for 1sec

## 1.0.3 - 2021-06-13

- Add bindings for M1 Mac platform

## 1.0.2 - 2021-05-16

- Add bindings for win32 platform

## 1.0.1 - 2021-05-15

- Bumped Electron version

## 1.0.0 - 2021-05-02

- Initial release
