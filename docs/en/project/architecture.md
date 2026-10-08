# Architecture

The project follows a hexagonal architecture in four layers. Dependencies always point towards the
domain: the domain depends on nothing, and the MCP layer does not know what `simctl` is.

```
mcp/              Presentation: tools and the MCP server
   |  calls
application/      Use cases: services and DeviceResolver
   |  depends on
domain/           Model, errors and ports (...Gateway interfaces)
   ^  implements
infrastructure/   Adapters: simctl, idb, SimulatorHost, CommandRunner
```

## Layers

| Layer | Responsibility | Main pieces |
| --- | --- | --- |
| `src/domain/` | Model and contracts, with no external dependencies. | `Device`, `Runtime`, `Point`, `ElementQuery`, `UiStep`, `SimulatorError`, `ports/*Gateway` |
| `src/application/` | Business rules and orchestration. | `DeviceCatalog`, `DeviceResolver`, `DeviceService`, `AppService`, `UiService`, `MediaService`, `EnvironmentService`, `LogService` |
| `src/infrastructure/` | Talking to the system. | `NodeCommandRunner`, `SimulatorHost`, `Simctl*Gateway`, `CompanionUiAutomationGateway`, `IdbUiAutomationGateway` |
| `src/mcp/` | Exposing the use cases as MCP tools. | `ToolDefinition`, `*Tools`, `presenters`, `SimulatorMcpServer` |
| `src/container.ts` | The only place that wires the layers together. | `createContainer()` |

## Folder structure

```
src/
├── domain/
│   ├── Device.ts, Runtime.ts, geometry.ts, ui.ts, ElementQuery.ts, media.ts, environment.ts
│   ├── errors.ts
│   └── ports/
├── application/
├── infrastructure/
│   ├── process/      CommandRunner (interface) and NodeCommandRunner
│   ├── host/         SimulatorHost
│   ├── simctl/       Gateways on top of xcrun simctl
│   ├── companion/    UI automation over gRPC with idb_companion
│   └── idb/          The same automation through the command line client
├── mcp/
│   ├── ToolDefinition.ts, responses.ts, presenters.ts, schemas.ts
│   ├── SimulatorMcpServer.ts
│   └── tools/        One ToolProvider per group of tools
├── config.ts
├── container.ts
└── index.ts
```

## The path of a call

1. `SimulatorMcpServer` validates the input against the tool's zod schema.
2. The `ToolProvider` turns it into a call to an application service.
3. The service resolves the device with `DeviceResolver` and applies its rules.
4. The gateway runs the command through `SimulatorHost`.
5. If something fails, the `SimulatorError` reaches the client as `[CODE] message`.

## Design decisions

### No shell

Commands are launched as an executable plus an argument vector and never go through a command
interpreter. No value sent by the model can inject commands.

### One port per capability

Every capability has its interface in `domain/ports/`: `DeviceGateway`, `AppGateway`,
`MediaGateway`, `UiAutomationGateway`, `EnvironmentGateway` and `LogGateway`. `idb` is just one
adapter of `UiAutomationGateway` and can be replaced without touching the application or the MCP
layer.

### Two adapters for the same port

`UiAutomationGateway` has two implementations. `CompanionUiAutomationGateway` talks gRPC to
`idb_companion` over a connection that `CompanionPool` keeps open per simulator.
`IdbUiAutomationGateway` runs the command line client on every call.
`FallbackUiAutomationGateway` uses the former and switches to the latter, for good, only when the
former is not available; an ordinary failure of an operation never triggers the switch.

The few protocol messages needed are encoded by hand. The tests decode them with the official
`idb` definition on a real gRPC server, which is what proves the encoding is right.

### Declarative tools

Every tool is a `ToolDefinition`: its contract (name, description, schema, annotations) and an
`execute` function. It does not depend on the MCP SDK. The server only registers them and handles
errors in one place.

### A single way out to the system

`SimulatorHost` is the only class that runs macOS commands. It guarantees they are only attempted
on macOS and applies a default time limit so a stuck tool cannot hang the server.

### UI steps as data

Every interaction is a `UiStep`: a domain value, not a call. `UiService` runs one or many through
the same path, resolving the device only once. That is why tapping an element, chaining a
sequence and returning the resulting screen share one implementation, and why `ui_sequence` does
not need a separate tool per kind of step.

Finding elements is domain logic (`ElementQuery`): exact matches before partial ones, and nested
containers treated as a single target. It does not depend on `idb`.

### A cache that is only trusted for positive answers

`DeviceCatalog` reuses the list of simulators for a few seconds. `DeviceResolver` never reports a
failure from cached data: it reads the list again first. Operations that change the state of a
simulator invalidate the cache, even when they fail halfway.

### Presentation designed for a model

Everything a tool returns is read by a model and paid for in tokens. The formats in
`mcp/presenters.ts` are compact on purpose: one line per item, no JSON punctuation and no fields
the client cannot act on.

### Time is a dependency

Waiting and expiry use an injectable `Clock`. Tests replace it with a fake clock and check waits
of several seconds instantly.

### Errors that carry their fix

When the cause of a failure is known, the error explains it: `CommandFailedError` accepts a
`Hint:` line, Python tracebacks from `idb` are reduced to their message, and up-front checks
(paths, URLs, installed apps, typeable text) replace low-level failures with domain errors.

### Bounded state

The state of the server is limited to the recordings in progress, encapsulated in `MediaService`
and released on shutdown, and to the cached list of simulators.

### Explicit destructive operations

`erase_device` requires the device to be named and shut down. It never shuts it down itself.
