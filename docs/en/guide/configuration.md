# Configuration

The server works with no configuration. These optional settings are given as environment
variables.

| Variable | Default | Description |
| --- | --- | --- |
| `IOS_SIMULATOR_MCP_XCRUN_PATH` | `xcrun` | The `xcrun` executable. |
| `IOS_SIMULATOR_MCP_IDB_PATH` | `idb` | The `idb` executable, used by the `ui_*` tools. |
| `IOS_SIMULATOR_MCP_OUTPUT_DIR` | `$TMPDIR/ios-simulator-mcp` | Folder where recordings are saved when no path is given. |
| `IOS_SIMULATOR_MCP_DEVICE_CACHE_MS` | `10000` | Milliseconds the list of simulators is reused between calls. `0` disables the cache. See [Working fast](./performance#less-work-in-the-server). |

## Claude Code

```bash
claude mcp add ios-simulator \
  -e IOS_SIMULATOR_MCP_IDB_PATH="$(which idb)" \
  -e IOS_SIMULATOR_MCP_OUTPUT_DIR="$HOME/Desktop/sim" \
  -- node "$(pwd)/dist/index.js"
```

## Claude Desktop and other clients

```json
{
  "mcpServers": {
    "ios-simulator": {
      "command": "node",
      "args": ["/absolute/path/to/ios-simulator-mcp/dist/index.js"],
      "env": {
        "IOS_SIMULATOR_MCP_IDB_PATH": "/Users/you/.local/bin/idb",
        "IOS_SIMULATOR_MCP_OUTPUT_DIR": "/Users/you/Desktop/sim"
      }
    }
  }
}
```
