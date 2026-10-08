# ios-simulator-mcp

[![CI](https://github.com/s-pl/ios-simulator-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/s-pl/ios-simulator-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Léelo en español](README.es.md) · [Documentation](https://s-pl.github.io/ios-simulator-mcp/en/)

An [MCP](https://modelcontextprotocol.io) server to control the iOS Simulator from an agent (Claude
Code, Claude Desktop and others): manage devices, install and launch apps, drive the interface by
text, read the accessibility tree, capture the screen, simulate location, permissions and push
notifications, and read logs.

It is designed to be fast to drive: an agent can tap an element by its text, get the resulting
screen back from any action, and send a whole flow as a single call.

## Requirements

| Requirement | What for | Install |
| --- | --- | --- |
| macOS + Xcode | Everything (`xcrun simctl`) | App Store + `xcode-select --install` |
| Node.js 20 or later | Running the server | `brew install node` |
| [idb](https://fbidb.io) (optional) | Only the `ui_*` tools | `brew tap facebook/fb && brew install idb-companion` and `pipx install fb-idb` (if Homebrew rejects the tap, run `brew trust facebook/fb` first) |

The simulator only exists on macOS. Elsewhere the server starts and lists its tools, but every
call answers `[UNSUPPORTED_PLATFORM]`.

## Installation

```bash
git clone https://github.com/s-pl/ios-simulator-mcp.git
cd ios-simulator-mcp
npm install        # also builds into dist/
```

### Claude Code

```bash
claude mcp add ios-simulator -- node "$(pwd)/dist/index.js"
```

### Claude Desktop and other clients

```json
{
  "mcpServers": {
    "ios-simulator": {
      "command": "node",
      "args": ["/absolute/path/to/ios-simulator-mcp/dist/index.js"]
    }
  }
}
```

### Configuration

| Environment variable | Default | Description |
| --- | --- | --- |
| `IOS_SIMULATOR_MCP_XCRUN_PATH` | `xcrun` | The `xcrun` executable. |
| `IOS_SIMULATOR_MCP_IDB_PATH` | `idb` | The `idb` executable. Useful when the MCP client does not inherit your `PATH`. |
| `IOS_SIMULATOR_MCP_UI_BACKEND` | `auto` | `companion` (direct connection, the fastest), `cli` or `auto`. |
| `IOS_SIMULATOR_MCP_IDB_COMPANION_PATH` | `idb_companion` | The `idb_companion` executable. |
| `IOS_SIMULATOR_MCP_OUTPUT_DIR` | `$TMPDIR/ios-simulator-mcp` | Default folder for recordings. |
| `IOS_SIMULATOR_MCP_DEVICE_CACHE_MS` | `10000` | How long the list of simulators is reused. `0` disables the cache. |

## Tools

Almost all accept an optional `device` (UDID or exact name). When omitted, the only booted
simulator is used; with several or none, the error says how to disambiguate.

| Group | Tool | What it does |
| --- | --- | --- |
| Devices | `list_devices` | Lists simulators (name, UDID, runtime, state). |
| | `boot_device` | Boots a simulator and waits until it is ready. |
| | `shutdown_device` | Shuts down one or all. |
| | `erase_device` | Factory reset (must be shut down). |
| | `open_simulator_app` | Brings the Simulator window to the front. |
| Apps | `install_app` / `uninstall_app` | Installs a `.app` / uninstalls by bundle id. |
| | `launch_app` / `terminate_app` | Launches (with arguments) / terminates an app. |
| | `list_apps` | Installed apps, filterable by `User`/`System`. |
| | `open_url` | Opens a URL or deep link. |
| | `get_app_container` | Path on the Mac of an app container. |
| UI (idb) | `ui_describe_screen` | Elements on screen, one line each with its tap point. |
| | `ui_describe_point` | The element at a coordinate. |
| | `ui_tap_element` | Finds an element by text, identifier or type and taps it. |
| | `ui_wait_for_element` | Waits until an element is on screen. |
| | `ui_paste_text` | Enters any text (accents, emoji, any script) into a field. |
| | `ui_scroll_to_element` | Scrolls until an element is visible. |
| | `ui_sequence` | Runs several UI steps in a single call. |
| | `ui_tap` / `ui_swipe` | Tap (or long press) / swipe by coordinates. |
| | `ui_type_text` | Types into the focused field (unaccented Latin text only). |
| | `ui_press_button` / `ui_press_key` | Hardware button (HOME, LOCK…) / key by HID code. |
| Media | `screenshot` | Screenshot, reduced to points by default. |
| | `start_recording` / `stop_recording` | Records the screen to `.mp4`. |
| | `add_media` | Adds photos/videos to the library. |
| Environment | `set_appearance` | Light/dark mode. |
| | `set_location` | Simulates or clears the GPS location. |
| | `set_status_bar` | Forces the time, network and battery of the status bar. |
| | `set_permission` | Grants/revokes/resets privacy permissions. |
| | `send_push_notification` | Sends a simulated push (APNs payload). |
| | `set_clipboard` / `get_clipboard` | Writes and reads the simulator clipboard. |
| Logs | `get_logs` | Recent logs, filterable by process or text. |

**Coordinates:** the `ui_*` tools work in *points*. Screenshots are returned in points by default,
so positions in them can be passed straight to `ui_tap`.

### Designed to be fast

What takes longest when an agent drives the simulator is each round trip with the model. The
server cuts them down:

- `ui_tap_element` finds and taps in one call, with no coordinates requested first.
- Any action accepts `describeAfter: true` and returns the resulting screen.
- `ui_sequence` runs a whole flow (filling a form, for example) at once.
- `ui_scroll_to_element` replaces swipe-and-look loops.
- Responses are compact: one line per element or app, and screenshots in points.
- The list of simulators is reused for a few seconds between calls.
- It talks to `idb_companion` directly over a persistent connection: a tap takes hundredths of a
  second instead of about six tenths.

More in [Working fast](https://s-pl.github.io/ios-simulator-mcp/en/guide/performance).

### Known limitations

- `ui_type_text` cannot type accents, ñ or emoji (an `idb` limitation). Use `ui_paste_text`.
- Swipes from a screen edge do not open Notification Center or Control Center.
- Pinch and other multi-touch gestures are not available.
- After launching an app the screen can be black for a few seconds; wait with
  `ui_wait_for_element`.

Explained in [Known limitations](https://s-pl.github.io/ios-simulator-mcp/en/guide/limitations).

## Architecture

A hexagonal architecture in four layers. Dependencies always point towards the domain.

```
src/
├── domain/            Model and contracts. No external dependencies.
│   ├── Device, Runtime, geometry, ui, ElementQuery, media, environment
│   ├── errors.ts      SimulatorError hierarchy, each error with a stable `code`
│   └── ports/         Interfaces the infrastructure implements (…Gateway)
├── application/       Use cases: one service per area, DeviceCatalog, DeviceResolver
├── infrastructure/    Adapters to the real world
│   ├── process/       CommandRunner (interface) and NodeCommandRunner (child_process)
│   ├── host/          SimulatorHost: the single way out to macOS commands
│   ├── simctl/        Gateways implemented with `xcrun simctl`
│   └── idb/           UI automation gateway on top of `idb`
├── mcp/               Presentation: tool definitions and the MCP server
├── config.ts          Configuration from environment variables
├── container.ts       Composition root: the only place that wires the layers
└── index.ts           Entry point (stdio transport)
```

Design decisions worth knowing:

- **No shell.** Commands run as an executable plus an argument vector, so nothing the model sends
  can inject commands.
- **One port per capability.** `idb` is just one adapter and can be replaced without touching the
  application or MCP layers.
- **Declarative tools.** Each tool is a `ToolDefinition` (contract + `execute`) independent of the
  MCP SDK.
- **UI steps as data.** One code path runs a single action or a whole sequence.

Details in [Architecture](https://s-pl.github.io/ios-simulator-mcp/en/project/architecture).

## Development

```bash
npm run lint               # ESLint with type-aware rules
npm run typecheck          # type-checks src + test
npm test                   # builds and runs the unit and e2e tests (no Mac needed)
npm run test:integration   # tests against a real simulator (macOS only)
npm run docs:dev           # serves the documentation locally
npm run docs:tools         # regenerates the tool reference
```

The tests do not need a Mac: `FakeCommandRunner` replaces command execution and the end-to-end
tests connect a real MCP client to the whole server in memory, checking the exact commands that
would be issued. The integration tests boot a real simulator, install a small SwiftUI fixture app
and run in CI on a macOS runner.

The documentation lives in `docs/` and is built with [VitePress](https://vitepress.dev), in
Spanish and English.

## License

[MIT](LICENSE) © Samuel Ponce Luna
