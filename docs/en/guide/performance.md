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

Almost every call needs to know which simulator to use, and asking `simctl` for the list is among
the slowest things the server does. The list is reused for ten seconds between calls.

The cache is only used for positive answers. Before reporting that a device does not exist or is
not booted, the server reads the list again, so a simulator booted from Xcode is always found.
Operations that change the state of a simulator invalidate it.

The duration is set with `IOS_SIMULATOR_MCP_DEVICE_CACHE_MS`; `0` disables it. See
[Configuration](./configuration).

## Measurements

These figures come from the integration tests, which run on every change against an iPhone 16e
with iOS 26.2 on a GitHub Actions macOS runner. That is a slow virtual machine: on a development
Mac the absolute times will be lower. What matters is the proportions.

Pressing the same button three times:

| Approach | Tool calls | Server time |
| --- | --- | --- |
| `ui_describe_screen` and `ui_tap` by coordinates | 6 | 10.0 s |
| `ui_tap_element` | 3 | 5.6 s |
| `ui_sequence` | 1 | 6.2 s |

`ui_tap_element` nearly halves the server time. `ui_sequence` saves no server time over three
`ui_tap_element` calls; what it saves is two round trips with the model, which do not show in this
table and usually cost several seconds each.

Cost of each operation:

| Operation | Average time |
| --- | --- |
| `ui_describe_screen` | 0.9 s |
| `ui_tap` | 0.6 s |
| Listing simulators, which is what the cache avoids on every call | 1.4 s |

Size of the responses:

| Response | Size |
| --- | --- |
| `ui_describe_screen` of a screen with 16 elements | 964 characters |
| Screenshot at native resolution (JPEG) | 167 kB |
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
