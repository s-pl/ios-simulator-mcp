# Known limitations

These limitations come from the tools the server builds on (`simctl` and `idb`), not from the
server. Each one lists how the server behaves and what the alternative is.

## Text with accents, ñ, emoji or other scripts

`idb` simulates a US hardware keyboard, so `ui_type_text` can only type unaccented Latin letters,
digits and common punctuation. Line breaks and tabs do work: they are sent as key presses.

The server validates the text before typing anything. If it contains characters that cannot be
typed, it answers `[UNSUPPORTED_TEXT]` naming them, instead of typing half of it and failing.

**Alternative:** `ui_paste_text`. It enters any text into a field through the clipboard, in a
single call:

```json
{ "text": "Añadir canción 🎵", "identifier": "name.field" }
```

Under the hood it copies the text, long-presses the field and taps the paste item of the menu
that appears. It is verified on a real simulator running iOS 26. Worth knowing:

- The text is inserted at the cursor; it does not replace what the field already contains.
- The paste item is recognised in English, Spanish, French, German, Italian, Portuguese, Dutch,
  Japanese, Chinese and Korean. With the simulator in another language, the tool answers
  `[PASTE_UNAVAILABLE]` with what is on screen, and you can tap the item with `ui_tap_element`.
- Some fields offer no edit menu (certain custom fields, for example). The answer is also
  `[PASTE_UNAVAILABLE]`; the text is left on the clipboard regardless.

## Gestures from the screen edges

Swipes that start at an edge do not trigger system gestures: Notification Center, Control Center
and the app switcher do not open with `ui_swipe`.

**Alternative:** use `ui_press_button` with `HOME` to return to the home screen, and `launch_app`
or `open_url` to switch apps.

## Multi-touch gestures

`idb` simulates a single finger, so there is no pinch, rotation or other multi-touch gesture.

**Alternative:** if your app offers another way to do the same thing (zoom buttons, double tap),
use it. A double tap is two `ui_tap` steps in a row inside a `ui_sequence`.

## Confirmation when opening a link into an app

When `open_url` opens a link with a custom scheme (`myapp://...`), iOS may show a prompt asking to
confirm opening the app.

**Alternative:** tap the confirmation button with `ui_tap_element` and `label: "Open"`.

## The screen is black right after launching an app

For a few seconds after `launch_app`, a screenshot can come out black and `ui_describe_screen` can
return no elements: the app is still loading. It is more common right after booting the
simulator.

**Alternative:** wait with `ui_wait_for_element` for an element you know will be on the screen,
instead of acting or capturing immediately.

## The interface needs the Simulator window

`idb` reads accessibility through the Simulator application. If the simulator was booted without
a window, `ui_describe_screen` fails with "No translation object returned".

`boot_device` opens the window by default. If it cannot, the boot still succeeds and the response
carries a warning; in that case, run `open_simulator_app` before using the interface tools.

## Push notifications

`send_push_notification` delivers the notification to the app, but iOS only shows it if the app
has asked for notification permission and it was granted. If `simctl` answers "Source is not
authorized", the server adds an explanation.

`set_permission` does not cover notifications: launch the app, trigger its permission request and
accept it on screen, for example with `ui_tap_element` and `label: "Allow"`.

## Changes made outside the server

The list of simulators is reused for a few seconds. If you shut a simulator down from Xcode and
call a tool immediately, it can fail with a `simctl` error until the list is refreshed. The
opposite case, a simulator booted outside the server, is always detected.
