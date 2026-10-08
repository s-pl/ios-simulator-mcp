# Troubleshooting

## The `ui_*` tools answer `EXECUTABLE_NOT_FOUND`

`idb` is missing or the MCP client cannot find it on its `PATH`. Install it following
[Installing idb](./installation#installing-idb) and, if it still fails, set
`IOS_SIMULATOR_MCP_IDB_PATH` to the output of `which idb`.

## `NO_BOOTED_DEVICE` from any tool

No simulator is booted. Use `list_devices` and then `boot_device`, or pass `device`.

## `ui_describe_screen` fails with "No translation object returned"

idb cannot read the simulator's accessibility. It happens when the simulator was booted without a
window. Open the Simulator application with `open_simulator_app`, wait a few seconds and try
again.

## `boot_device` answers with a warning about the window

The simulator booted, but the Simulator window could not be opened. Everything works except the
interface tools. Run `open_simulator_app` or open Simulator by hand.

## `ui_type_text` answers `UNSUPPORTED_TEXT`

The text contains accents, ñ, emoji or other characters the simulated keyboard cannot type. Use
`ui_paste_text`, which enters any text.

## `ui_paste_text` answers `PASTE_UNAVAILABLE`

The text was copied, but no paste option appeared after long-pressing the field. Check that the
target is an editable text field. If the simulator is in a language the tool does not recognise,
the error lists what is on screen: tap the paste item with `ui_tap_element`. See
[Known limitations](./limitations).

## The screenshot is black

The app is still loading. Wait with `ui_wait_for_element` for an element of the screen before
capturing.

## A swipe does not open Notification Center

Gestures that start at a screen edge do not trigger system gestures. See
[Known limitations](./limitations#gestures-from-the-screen-edges).

## A deep link does not reach the app

iOS may be asking to confirm opening the app. Read the screen with `ui_describe_screen` and tap
the "Open" button.

## A push fails with "Source is not authorized"

The app is not allowed to show notifications. It must ask for permission and the request has to
be accepted on screen before sending it a push.

## Taps land in the wrong place

Coordinates are probably being taken from a screenshot captured with `resolution: "full"`, which
is in pixels. Use `ui_tap_element`, the coordinates from `ui_describe_screen` or a screenshot at
the default resolution. See [Points, not pixels](./concepts#points-not-pixels).

## `xcrun: error: unable to find utility "simctl"`

The command line tools do not point at Xcode:

```bash
sudo xcode-select -s /Applications/Xcode.app
```

## The recorded video does not open

A recording is only finalised by `stop_recording`. If the server process is killed, the file can
be left incomplete.

## Finding out which command failed

`COMMAND_FAILED` errors include the exact command line and its output. Copy it and run it in a
terminal to reproduce the problem.

## Reporting a bug

[Open an issue](https://github.com/s-pl/ios-simulator-mcp/issues/new) stating your macOS and Xcode
versions and the full error message.
