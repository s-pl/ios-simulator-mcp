# Error codes

Failures are returned as a tool error result in the form `[CODE] message`. The message says what
to do next.

| Code | Meaning |
| --- | --- |
| `UNSUPPORTED_PLATFORM` | The server is not running on macOS. |
| `EXECUTABLE_NOT_FOUND` | `xcrun` or `idb` is missing. The message explains how to install it. |
| `COMMAND_FAILED` | A command exited with an error. Includes the exact command, its output and, when the cause is known, a `Hint:` line with the fix. |
| `COMMAND_TIMEOUT` | A command exceeded its time limit. |
| `UNEXPECTED_OUTPUT` | The output of an external tool does not have the expected format. |
| `DEVICE_NOT_FOUND` | No available simulator matches the name or UDID. |
| `NO_BOOTED_DEVICE` | `device` was omitted and no simulator is booted. |
| `AMBIGUOUS_DEVICE` | Several simulators match. The message lists the candidates. |
| `DEVICE_NOT_BOOTED` | The operation needs the simulator to be booted. |
| `DEVICE_NOT_SHUTDOWN` | The operation needs the simulator to be shut down. |
| `RECORDING_ALREADY_ACTIVE` | A recording is already in progress on that device. |
| `NO_ACTIVE_RECORDING` | There is no recording to stop. |
| `ELEMENT_NOT_FOUND` | No element on screen matches the query. The message lists what is there. |
| `AMBIGUOUS_ELEMENT` | Several elements match. The message lists them numbered, to choose one with `index`. |
| `UNSUPPORTED_TEXT` | The text contains characters the simulated keyboard cannot type. Use `ui_paste_text`. |
| `PASTE_UNAVAILABLE` | The text was copied, but the field offered no "Paste" option. See [Limitations](../guide/limitations). |
| `APP_NOT_INSTALLED` | The app is not installed on the simulator. |
| `PATH_NOT_FOUND` | A file or folder does not exist on the Mac. |
| `INVALID_ARGUMENT` | A value is syntactically valid but not acceptable. |
| `UNEXPECTED_ERROR` | An unforeseen failure. Worth reporting. |

Input that does not match a tool's schema (a wrong type, a value out of range) is rejected by the
protocol itself before anything runs.

In the code, every error is a subclass of `SimulatorError` defined in
[`src/domain/errors.ts`](https://github.com/s-pl/ios-simulator-mcp/blob/main/src/domain/errors.ts).
