<!-- Generado por scripts/generate-tool-docs.mjs. No editar a mano: ejecuta `npm run docs:tools`. -->

# Herramientas

El servidor publica 34 herramientas. Esta página se genera a partir del propio servidor,
así que siempre coincide con el código. Las descripciones están en inglés porque son exactamente
las que recibe el modelo.

Casi todas aceptan un parámetro opcional `device`; consulta
[El parámetro device](../guia/conceptos#el-parametro-device).

## Dispositivos

### list_devices

**List simulators** · Lectura

Lists the available simulators with their name, UDID, runtime and state. Use it to find the device to boot or to target with other tools.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `bootedOnly` | `boolean` | No | Return only running simulators. |
| `platform` | `string` | No | Filter by platform, e.g. "iOS", "watchOS", "tvOS". |

### boot_device

**Boot simulator** · Modifica

Boots a simulator and waits until it is ready to use. Does nothing if it is already running. If the Simulator window cannot be opened the boot still succeeds and a warning is returned.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `device` | `string` | Sí | Target simulator: UDID or exact name (see list_devices). |
| `showWindow` | `boolean` | No | Bring the Simulator app window to the foreground (default: true). |

### shutdown_device

**Shut down simulator** · Modifica

Shuts down a simulator, or every running simulator when "all" is true.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |
| `all` | `boolean` | No | Shut down every running simulator. |

### erase_device

**Erase simulator** · Destructiva

Restores a simulator to factory settings, permanently deleting its apps, data and settings. The simulator must be shut down first.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `device` | `string` | Sí | Target simulator: UDID or exact name (see list_devices). |

### open_simulator_app

**Open Simulator app** · Modifica

Opens the Simulator app window on the Mac, optionally focused on a device.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `device` | `string` | No | Simulator to focus: UDID or exact name. |

## Apps

### install_app

**Install app** · Modifica

Installs an app built for the simulator from a .app bundle (or .ipa) on the Mac. Reinstalling replaces the binary and keeps the app data.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `appPath` | `string` | Sí | Absolute path of an existing .app bundle on the Mac. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### uninstall_app

**Uninstall app** · Destructiva

Uninstalls an app, permanently deleting its data. Fails if the app is not installed.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `bundleId` | `string` | Sí | Bundle identifier of the app, e.g. com.apple.mobilesafari. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### launch_app

**Launch app** · Modifica

Launches an installed app and returns its process id. The screen can stay black for a few seconds while the app loads: use ui_wait_for_element rather than acting immediately.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `bundleId` | `string` | Sí | Bundle identifier of the app, e.g. com.apple.mobilesafari. |
| `arguments` | `string[]` | No | Command line arguments passed to the app. |
| `terminateRunning` | `boolean` | No | Terminate a running instance first so the app starts fresh. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### terminate_app

**Terminate app** · Modifica

Terminates a running app.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `bundleId` | `string` | Sí | Bundle identifier of the app, e.g. com.apple.mobilesafari. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### list_apps

**List installed apps** · Lectura

Lists the apps installed in a simulator, one per line: bundle id, name and version. Use get_app_container when you need the path of an app on the Mac.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `type` | `"User" \| "System"` | No | "User" for apps you installed, "System" for built-in apps. Omit for both. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### open_url

**Open URL** · Modifica

Opens a URL in the simulator: a web page in Safari, or a deep link / universal link handled by an installed app (e.g. myapp://profile/42).

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `url` | `string` | Sí | URL to open. It must include its scheme, e.g. https:// or myapp://. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### get_app_container

**Get app container path** · Lectura

Returns the path on the Mac of a container of an installed app, so its files (documents, databases, preferences) can be inspected directly.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `bundleId` | `string` | Sí | Bundle identifier of the app, e.g. com.apple.mobilesafari. |
| `kind` | `"app" \| "data" \| "groups"` | No | "app" for the bundle, "data" for the sandbox (default), "groups" for app groups. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

## Interfaz

Estas herramientas requieren [idb](../guia/instalacion#instalar-idb). Las coordenadas se expresan en [puntos](../guia/conceptos#puntos-no-pixeles). Consulta [Trabajar rápido](../guia/rendimiento) para elegir la más eficiente.

### ui_describe_screen

**Describe screen** · Lectura

Lists the accessibility elements on screen, one per line: type, label, value, identifier, the point to tap it at and its size, all in points. Prefer it over a screenshot: it is faster, cheaper and gives exact coordinates. Requires idb.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `containing` | `string` | No | Only elements whose label, value or identifier contains this text (case-insensitive). |
| `includeUnlabeled` | `boolean` | No | Include elements with no label, value or identifier (default: false). |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### ui_describe_point

**Describe element at point** · Lectura

Returns the accessibility element located at a screen coordinate. Requires idb.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `x` | `number (>= 0)` | Sí | Horizontal position, in points. |
| `y` | `number (>= 0)` | Sí | Vertical position, in points. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### ui_tap_element

**Tap element** · Modifica

Finds an element by its visible text, identifier or type and taps it, in a single call. This is the fastest way to press a button or focus a field: no coordinates needed. Waits briefly for the element to appear, so it can follow a screen transition. Requires idb.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `label` | `string` | No | Visible text of the element (label or value), case-insensitive. Exact matches win over partial ones. |
| `identifier` | `string` | No | Exact accessibilityIdentifier of the element. |
| `type` | `string` | No | Accessibility type to restrict the match to, e.g. "Button". |
| `index` | `integer (>= 0)` | No | Which match to use (0 = first) when several elements qualify. |
| `durationSeconds` | `number (<= 30)` | No | How long to hold the touch, for a long press. |
| `timeoutSeconds` | `number (>= 0, <= 60)` | No | How long to wait for the element to appear (default: 3). |
| `describeAfter` | `boolean` | No | Also return the elements on screen after the action, saving a ui_describe_screen call. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### ui_wait_for_element

**Wait for element** · Lectura

Waits until an element is on screen, e.g. after launching an app or submitting a form, and returns it. Use it instead of polling with ui_describe_screen. Requires idb.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `label` | `string` | No | Visible text of the element (label or value), case-insensitive. Exact matches win over partial ones. |
| `identifier` | `string` | No | Exact accessibilityIdentifier of the element. |
| `type` | `string` | No | Accessibility type to restrict the match to, e.g. "Button". |
| `index` | `integer (>= 0)` | No | Which match to use (0 = first) when several elements qualify. |
| `timeoutSeconds` | `number (>= 0, <= 60)` | No | How long to wait (default: 10). |
| `describeAfter` | `boolean` | No | Also return the elements on screen after the action, saving a ui_describe_screen call. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### ui_sequence

**Run a sequence of UI steps** · Modifica

Runs several UI steps in one call, which is much faster than one call per step. Use it for any flow you can plan ahead, such as filling a form. Stops at the first failing step and reports which steps completed, the error and the current screen. Requires idb.  
Each step is an object with an "action":  
- tap: x, y, durationSeconds?  
- tap_element: label?, identifier?, type?, index?, durationSeconds?, timeoutSeconds?  
- type_text: text  
- swipe: fromX, fromY, toX, toY, durationSeconds?  
- press_button: button (HOME, LOCK, SIDE_BUTTON, SIRI, APPLE_PAY)  
- press_key: keyCode  
- wait: seconds  
- wait_for_element: label?, identifier?, type?, index?, timeoutSeconds?  
Example: [{"action":"tap_element","label":"Email"},{"action":"type_text","text":"a@b.co"},{"action":"tap_element","label":"Sign in"},{"action":"wait_for_element","label":"Welcome"}]

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `steps` | `object[]` | Sí | Steps to run, in order. |
| `describeAfter` | `boolean` | No | Also return the elements on screen after the action, saving a ui_describe_screen call. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### ui_tap

**Tap** · Modifica

Taps a screen coordinate in points. Prefer ui_tap_element when the target has a label or identifier. Coordinates come from ui_describe_screen or from a screenshot taken at the default "points" resolution. Set a duration to long-press. Requires idb.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `x` | `number (>= 0)` | Sí | Horizontal position, in points. |
| `y` | `number (>= 0)` | Sí | Vertical position, in points. |
| `durationSeconds` | `number (<= 30)` | No | How long to hold the touch, for a long press. |
| `describeAfter` | `boolean` | No | Also return the elements on screen after the action, saving a ui_describe_screen call. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### ui_swipe

**Swipe** · Modifica

Drags a finger between two coordinates in points. To scroll content down, swipe from a lower point to a higher one (larger y to smaller y). Limitation: swipes that start at a screen edge do not trigger system gestures such as Notification Center, Control Center or the app switcher. Requires idb.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `fromX` | `number (>= 0)` | Sí | Starting horizontal position, in points. |
| `fromY` | `number (>= 0)` | Sí | Starting vertical position, in points. |
| `toX` | `number (>= 0)` | Sí | Ending horizontal position, in points. |
| `toY` | `number (>= 0)` | Sí | Ending vertical position, in points. |
| `durationSeconds` | `number (<= 30)` | No | Duration of the gesture. |
| `stepSize` | `number` | No | Distance in points between intermediate touch events. |
| `describeAfter` | `boolean` | No | Also return the elements on screen after the action, saving a ui_describe_screen call. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### ui_type_text

**Type text** · Modifica

Types text into the focused field, as if using the keyboard; line breaks press Return. Tap a text field first to give it focus. Limitation: only unaccented Latin letters, digits and common punctuation can be typed. For accents, ñ, emoji or any other script, use set_clipboard, long-press the field and tap "Paste". Requires idb.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `text` | `string` | Sí | Text to type (printable ASCII, line breaks and tabs). |
| `describeAfter` | `boolean` | No | Also return the elements on screen after the action, saving a ui_describe_screen call. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### ui_press_button

**Press hardware button** · Modifica

Presses a hardware button, e.g. HOME to return to the home screen. Requires idb.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `button` | `"HOME" \| "LOCK" \| "SIDE_BUTTON" \| "SIRI" \| "APPLE_PAY"` | Sí | Button to press. |
| `describeAfter` | `boolean` | No | Also return the elements on screen after the action, saving a ui_describe_screen call. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### ui_press_key

**Press keyboard key** · Modifica

Presses a keyboard key by its USB HID usage code. Common codes: 40 Return, 41 Escape, 42 Backspace, 43 Tab, 44 Space, 79 Right, 80 Left, 81 Down, 82 Up. Requires idb.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `keyCode` | `integer (>= 0, <= 255)` | Sí | USB HID keyboard usage code. |
| `describeAfter` | `boolean` | No | Also return the elements on screen after the action, saving a ui_describe_screen call. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

## Multimedia

### screenshot

**Take screenshot** · Lectura

Captures the simulator screen and returns the image. By default the image is scaled to one pixel per point, so positions in it are the coordinates ui_tap and ui_swipe expect. Use it to check how things look; to find or tap elements, ui_describe_screen and ui_tap_element are faster. A screen that is black right after launching an app is still loading.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `format` | `"png" \| "jpeg"` | No | Image format (default: jpeg, which is smaller). |
| `resolution` | `"points" \| "full"` | No | "points" (default): small image whose coordinates match the UI tools. "full": native device pixels. |
| `outputPath` | `string` | No | Also save the image to this path on the Mac. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### start_recording

**Start screen recording** · Modifica

Starts recording the simulator screen to a video file. The file is only complete after calling stop_recording.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `outputPath` | `string` | No | Destination .mp4 path on the Mac. Defaults to a timestamped file in the output directory. |
| `codec` | `"h264" \| "hevc"` | No | Video codec (default: h264). |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### stop_recording

**Stop screen recording** · Modifica

Stops a screen recording and returns the path of the finished video.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `device` | `string` | No | Simulator being recorded: UDID or exact name. Omit when only one recording is active. |

### add_media

**Add photos or videos** · Modifica

Adds photos or videos from the Mac to the simulator's Photos library.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `paths` | `string[]` | Sí | Paths of existing image or video files on the Mac. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

## Entorno

### set_appearance

**Set light or dark mode** · Modifica

Switches the simulator between light and dark appearance.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `appearance` | `"light" \| "dark"` | Sí | Appearance to apply. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### set_location

**Simulate location** · Modifica

Simulates a GPS location, or stops simulating one when "clear" is true.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `latitude` | `number (>= -90, <= 90)` | No | Latitude in decimal degrees. |
| `longitude` | `number (>= -180, <= 180)` | No | Longitude in decimal degrees. |
| `clear` | `boolean` | No | Stop simulating a location instead of setting one. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### set_status_bar

**Override status bar** · Modifica

Overrides what the status bar shows (clock, network, battery), which is useful for clean screenshots. Pass "clear": true to restore the real values.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `time` | `string` | No | Clock text, e.g. "9:41". |
| `dataNetwork` | `"hide" \| "wifi" \| "3g" \| "4g" \| "lte" \| "lte-a" \| "lte+" \| "5g" \| "5g+" \| "5g-uwb" \| "5g-uc"` | No | Data network indicator. |
| `wifiMode` | `"searching" \| "failed" \| "active"` | No |  |
| `wifiBars` | `integer (>= 0, <= 3)` | No | Wi-Fi signal strength, 0-3. |
| `cellularMode` | `"notSupported" \| "searching" \| "failed" \| "active"` | No |  |
| `cellularBars` | `integer (>= 0, <= 4)` | No | Cellular signal strength, 0-4. |
| `operatorName` | `string` | No | Carrier name. |
| `batteryState` | `"charging" \| "charged" \| "discharging"` | No |  |
| `batteryLevel` | `integer (>= 0, <= 100)` | No | Battery percentage, 0-100. |
| `clear` | `boolean` | No | Remove every override instead of setting values. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### set_permission

**Change privacy permission** · Modifica

Grants, revokes or resets a privacy permission (photos, location, contacts, microphone…) so permission dialogs do not need to be answered by hand. Changing a permission may terminate the affected app.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `action` | `"grant" \| "revoke" \| "reset"` | Sí | "reset" returns the permission to "not asked yet". |
| `service` | `"all" \| "calendar" \| "contacts-limited" \| "contacts" \| "location" \| "location-always" \| "photos-add" \| "photos" \| "media-library" \| "microphone" \| "motion" \| "reminders" \| "siri"` | Sí | Permission to change; "all" applies to every service. |
| `bundleId` | `string` | No | App the change applies to. Required for grant and revoke; omit on reset to affect all apps. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### send_push_notification

**Send push notification** · Modifica

Delivers a simulated remote push notification to an app. The payload is a standard APNs payload, e.g. {"aps": {"alert": {"title": "Hi", "body": "Hello"}, "badge": 1}}. The app must already have asked for, and been granted, permission to show notifications.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `bundleId` | `string` | Sí | Bundle identifier of the app, e.g. com.apple.mobilesafari. |
| `payload` | `object` | Sí | APNs payload; custom keys are allowed next to "aps". |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### set_clipboard

**Set clipboard text** · Modifica

Puts text on the simulator clipboard. This is the way to enter text ui_type_text cannot type (accents, ñ, emoji, non-Latin scripts): set the clipboard, long-press the text field and tap the "Paste" item of the menu that appears.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `text` | `string` | Sí | Text to copy. Any Unicode text is accepted. |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

### get_clipboard

**Get clipboard text** · Lectura

Returns the text currently on the simulator clipboard.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |

## Logs

### get_logs

**Read recent logs** · Lectura

Reads recent entries of the simulator system log (os_log, NSLog, print output captured by the system). Filter by process to see only your app; unfiltered logs are very noisy.

| Parámetro | Tipo | Obligatorio | Descripción |
| --- | --- | --- | --- |
| `processName` | `string` | No | Only entries from this process, usually the app executable name (e.g. "MyApp"). |
| `messageContains` | `string` | No | Only entries whose message contains this text. |
| `predicate` | `string` | No | Advanced: NSPredicate in "log show" syntax, e.g. subsystem == "com.example.app". |
| `minutes` | `integer (>= 1, <= 60)` | No | How far back to look (default: 1). |
| `maxLines` | `integer (>= 1, <= 2000)` | No | Maximum number of most recent lines to return (default: 200). |
| `device` | `string` | No | Target simulator: UDID or exact name. Omit to use the only booted simulator. |
