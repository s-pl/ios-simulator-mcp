# Working fast

What takes longest when an agent drives the simulator is not the simulator: it is each round trip
with the model, and the size of what the server sends back. The server is designed to cut both.
Its instructions already tell the model how to take advantage of it, but knowing it helps you
phrase requests better.

## Fewer calls

### Tapping by text

`ui_tap_element` finds an element by its visible text, its identifier or its type and taps it,
all in one call. It replaces the `ui_describe_screen` plus `ui_tap` pair.

```json
{ "label": "Sign in" }
```

It also waits a few seconds for the element to appear, so it can be used right after a screen
transition. See [how an element is located](./concepts#locating-elements).

### Getting the resulting screen back

Every interface action accepts `describeAfter: true`. The response then includes the elements on
screen after the action, with no need to ask for them separately.

```json
{ "label": "Sign in", "describeAfter": true }
```

### Sequences

`ui_sequence` runs several steps in a single call. It is the right choice for any flow that can
be planned ahead, such as filling a form:

```json
{
  "steps": [
    { "action": "paste_text", "text": "José Muñoz", "label": "Name" },
    { "action": "tap_element", "label": "Email" },
    { "action": "type_text", "text": "jose@example.com" },
    { "action": "scroll_to_element", "label": "Submit" },
    { "action": "tap_element", "label": "Submit" },
    { "action": "wait_for_element", "label": "Thank you", "timeoutSeconds": 15 }
  ],
  "describeAfter": true
}
```

The sequence stops at the first step that fails. The response says which steps completed, the
error and what is on screen at that moment, so the model can carry on from there.

Available steps: `tap`, `tap_element`, `type_text`, `paste_text`, `scroll_to_element`, `swipe`,
`press_button`, `press_key`, `wait` and `wait_for_element`.

### Scrolling to an element

`ui_scroll_to_element` swipes the screen until an element is visible and returns it. It replaces
the `ui_swipe` and `ui_describe_screen` loop. It stops when the element appears, when the end of
the content is reached or after `maxSwipes` swipes.

### Waiting instead of polling

`ui_wait_for_element` waits until an element is on screen. It avoids chaining calls to
`ui_describe_screen` while an app loads.

## Smaller responses

### The screen as compact text

`ui_describe_screen` returns one line per element:

```
Button "Sign in" id=login.submit @(195,725) 350x50
```

Each line carries the type, the text, the identifier, the point to tap and the size. It takes
less than half the space of the equivalent JSON.

### Screenshots in points

`screenshot` reduces the image to one pixel per point. On an iPhone with a scale of 3 that is a
ninth of the pixels, and therefore far fewer image tokens. Positions in the image also match the
coordinates of `ui_tap`. Use `resolution: "full"` when you need the native resolution.

### App list without paths

`list_apps` returns one line per app, without the internal path of the bundle. If you need it,
ask for it with `get_app_container`.

## Less work in the server

### A direct connection to idb_companion

`idb` has two parts: `idb_companion`, which talks to the simulator, and a Python client. The
client starts an interpreter, connects, does one thing and exits, on every action.

The server talks to `idb_companion` directly and keeps the connection open between calls. It is
the change that cuts the time of each interface action the most: a tap goes from about six tenths
of a second to a few hundredths.

This is the default. If `idb_companion` cannot be started, the server falls back to the command
line client and says so once on its error output. It is controlled with
`IOS_SIMULATOR_MCP_UI_BACKEND`; see [Configuration](./configuration).

In this mode only `idb_companion` (the Homebrew package) is needed; the Python client is no
longer required.

### The cached list of simulators

Almost every call needs to know which simulator to use, and asking `simctl` for the list is among
the slowest things the server does. The list is reused for ten seconds between calls.

The cache is only used for positive answers. Before reporting that a device does not exist or is
not booted, the server reads the list again, so a simulator booted from Xcode is always found.
Operations that change the state of a simulator invalidate it.

The duration is set with `IOS_SIMULATOR_MCP_DEVICE_CACHE_MS`; `0` disables it.

## Measurements

These figures come from the integration tests, which run on every change against an iPhone 16e
with iOS 26.2 on a GitHub Actions macOS runner. Absolute times vary a good deal between runs and
between machines; what matters is the proportions.

The two ways of talking to `idb`, in the same run:

| Mode | `ui_describe_screen` | `ui_tap` |
| --- | --- | --- |
| Direct connection (`companion`) | 0.17 s | 0.19 s |
| Command line client (`cli`) | 0.79 s | 0.62 s |

Once the connection was established, successive taps dropped to about 0.01 s on average.

Pressing the same button three times, over the direct connection:

| Approach | Tool calls | Server time |
| --- | --- | --- |
| `ui_describe_screen` and `ui_tap` by coordinates | 6 | 0.7 s |
| `ui_tap_element` | 3 | 0.8 s |
| `ui_sequence` | 1 | 1.0 s |

With the direct connection, server time stops being what matters: the three variants take about
a second. What tells them apart is the number of round trips with the model, which do not show in
the table and usually cost several seconds each. With the command line client, the first variant
took 10.0 s and the second 5.6 s.

Other operations:

| Operation | Average time |
| --- | --- |
| Listing simulators, which is what the cache avoids on every call | 0.3 to 1.4 s |
| One `simctl` call with the device cached | 0.3 to 1.2 s |

Size of the responses:

| Response | Size |
| --- | --- |
| `ui_describe_screen` of a screen with 16 elements | 964 characters |
| Screenshot at native resolution (JPEG) | 168 kB |
| Screenshot in points (JPEG) | 29 kB |

The screenshot in points is a little under a sixth of the size.

The measurements of every run are kept as the `simulator-artifacts` artifact of the CI workflow.

## In the client

- **Allow the server's tools** so the client does not ask for confirmation on every call. In
  Claude Code, with `/permissions`.
- **Ask for whole flows.** "Sign in with the test user and open Settings" allows a single
  sequence; asking step by step forces one call per step.
- **Keep screenshots for visual checks.** To know what is on screen or where to tap, the text of
  `ui_describe_screen` is faster and exact.
