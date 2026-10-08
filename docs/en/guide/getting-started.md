# Getting started

With the server connected, ask the agent for what you need in plain language. It picks the tools.

## Example requests

- "Boot an iPhone 16 and take a screenshot."
- "Install `build/MyApp.app`, launch it and sign in with the test user."
- "Open `myapp://settings`, switch to dark mode and tell me if anything looks wrong."
- "Grant photo access to my app and send it a test push."
- "Reproduce the cart bug and show me MyApp's logs from the last minute."

## The usual flow

| Step | Tool | Goal |
| --- | --- | --- |
| 1 | `list_devices` | Find the simulator. |
| 2 | `boot_device` | Boot it and wait until it is ready. |
| 3 | `install_app`, `launch_app` | Get the app running. |
| 4 | `ui_wait_for_element` | Wait until the app has loaded. |
| 5 | `ui_tap_element`, `ui_sequence` | Interact. |
| 6 | `ui_describe_screen`, `screenshot` | Check the result. |

## Example: signing in to an app

"Launch MyApp and sign in" takes two calls:

1. `launch_app` with `bundleId: "com.example.myapp"` and `terminateRunning: true`.
2. `ui_sequence` with the whole flow:

```json
{
  "steps": [
    { "action": "wait_for_element", "label": "Email", "timeoutSeconds": 20 },
    { "action": "tap_element", "label": "Email" },
    { "action": "type_text", "text": "ana@example.com" },
    { "action": "tap_element", "label": "Password" },
    { "action": "type_text", "text": "secret" },
    { "action": "tap_element", "label": "Sign in" }
  ],
  "describeAfter": true
}
```

The response lists the steps that ran and ends with the elements of the resulting screen, so the
agent confirms it reached the main screen with no further calls.

See [Working fast](./performance) to get the most out of these tools, and the
[reference](../reference/tools) for every parameter.
