# Key concepts

## The device parameter

Almost every tool accepts an optional `device` parameter, which can be a UDID or the exact name of
the simulator, case-insensitive. It is resolved like this:

- **Omitted.** The only booted simulator is used. If none is booted, or several are, the call
  fails with an error that says how to choose.
- **UDID.** That device.
- **Name.** That device. If several runtimes share the name (for example "iPhone 15" on iOS 17
  and on iOS 18), the booted one is chosen. If that does not settle it, the UDID is requested.

Only available simulators are considered; those Xcode marks as unavailable are ignored.

The operations where guessing would be dangerous, `boot_device` and `erase_device`, require
`device`.

## Locating elements

`ui_tap_element`, `ui_wait_for_element`, `ui_paste_text`, `ui_scroll_to_element` and the matching
steps of `ui_sequence` designate an element with one or more of these criteria, combined with
"and":

| Criterion | Match |
| --- | --- |
| `label` | Visible text of the element: its accessibility label or its value. Case-insensitive. |
| `identifier` | Exact `accessibilityIdentifier`. The most stable option when the app defines them. |
| `type` | Accessibility type, for example `Button` or `TextField`. |
| `index` | Which match to use, starting at 0, when there are several. |

Rules for `label`:

- An exact match wins over a partial one. `"Sign in"` picks the "Sign in" button even when
  "Sign in with Apple" exists.
- When there is no exact match, elements whose text contains the given one are accepted.
- A container and the label inside it, with the same text, count as a single target.

If several distinct elements match and no `index` is given, the call fails with
`[AMBIGUOUS_ELEMENT]` and lists the candidates, numbered. If none matches after waiting, it fails
with `[ELEMENT_NOT_FOUND]` and lists what is on screen.

## Points, not pixels

The `ui_*` tools work in **points**, the coordinate space of UIKit. The physical screen has more
**pixels**: points multiplied by the device scale, usually 3 on iPhone and 2 on iPad.

By default `screenshot` returns the image reduced to one pixel per point, so positions in the
image are valid coordinates for `ui_tap` as they are. With `resolution: "full"` the image is in
pixels and has to be divided by the scale; the text that comes with the capture always says which
unit it is in.

When the target has text or an identifier, `ui_tap_element` avoids working with coordinates at
all.

## Operations that need a particular state

| Operation | Required state |
| --- | --- |
| Apps, interface, media, environment and logs | Simulator booted |
| `erase_device` | Simulator shut down |

`erase_device` never shuts the simulator down itself: erasing is irreversible and must be an
explicit step.

## Up-front checks

The server validates what it can before running anything, to return a clear message instead of
the internal error of the underlying tool:

- `install_app` and `add_media` check that the paths exist.
- `open_url` checks that the text is a URL with a scheme.
- `uninstall_app` checks that the app is installed.
- `ui_type_text` checks that all of the text can be typed.

## Behaviour hints

Every tool declares how it affects the simulator through the standard MCP annotations. Clients
use them to decide when to ask for confirmation.

| Kind | Meaning |
| --- | --- |
| Read-only | Only reads state. |
| Mutating | Changes state in a way that is easy to undo or repeat. |
| Destructive | Deletes data that cannot be recovered (`erase_device`, `uninstall_app`). |

## Recordings

`start_recording` starts one recording per device and `stop_recording` finishes it. The video file
is only complete after stopping. If the server shuts down normally, it stops pending recordings.
