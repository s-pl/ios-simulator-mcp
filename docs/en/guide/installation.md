# Installation

## Requirements

| Requirement | What for | How to install it |
| --- | --- | --- |
| macOS with Xcode | Everything. The server uses `xcrun simctl`. | App Store and `xcode-select --install` |
| Node.js 20 or later | Running the server. | `brew install node` |
| [idb](https://fbidb.io) (optional) | Only the `ui_*` tools. | See [Installing idb](#installing-idb) |

::: warning macOS only
The iOS Simulator does not exist on Windows or Linux. On those systems the server starts and
publishes its tools, but every call returns `[UNSUPPORTED_PLATFORM]`.
:::

## Download and build

```bash
git clone https://github.com/s-pl/ios-simulator-mcp.git
cd ios-simulator-mcp
npm install
```

`npm install` also builds the project into `dist/`.

## Register the server

### Claude Code

From the project folder:

```bash
claude mcp add ios-simulator -- node "$(pwd)/dist/index.js"
```

Check that it is connected with `claude mcp list`, or with `/mcp` inside a session.

### Claude Desktop and other clients

Add the server to the client's configuration file. For Claude Desktop that is
`~/Library/Application Support/Claude/claude_desktop_config.json`:

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

## Installing idb

`simctl` cannot inject touches or read what is on screen, so the `ui_*` tools use
[idb](https://fbidb.io), from Meta. The rest of the server works without it.

```bash
brew tap facebook/fb
brew install idb-companion
pipx install fb-idb
```

If Homebrew refuses the formula because it comes from an untrusted tap, run
`brew trust facebook/fb` first.

::: tip The client cannot find idb
Desktop applications do not inherit your terminal's `PATH`. If the `ui_*` tools answer
`[EXECUTABLE_NOT_FOUND]`, give the full path through the `IOS_SIMULATOR_MCP_IDB_PATH` variable.
You get it with `which idb`. See [Configuration](./configuration).
:::
