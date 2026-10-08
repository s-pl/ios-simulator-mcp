# ios-simulator-mcp

[![CI](https://github.com/s-pl/ios-simulator-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/s-pl/ios-simulator-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Documentación completa: <https://s-pl.github.io/ios-simulator-mcp/>

Servidor [MCP](https://modelcontextprotocol.io) para controlar el Simulador de iOS desde un agente
(Claude Code, Claude Desktop, etc.): gestionar dispositivos, instalar y lanzar apps, tocar la
pantalla, leer el árbol de accesibilidad, capturar pantalla/vídeo, simular ubicación, permisos y
notificaciones push, y leer logs.

## Requisitos

| Requisito | Para qué | Instalación |
| --- | --- | --- |
| macOS + Xcode | Todo (`xcrun simctl`) | App Store + `xcode-select --install` |
| Node.js ≥ 20 | Ejecutar el servidor | `brew install node` |
| [idb](https://fbidb.io) *(opcional)* | Solo las herramientas `ui_*` | `brew tap facebook/fb && brew install idb-companion` y `pipx install fb-idb` (si Homebrew rechaza el tap, antes `brew trust facebook/fb`) |

> El simulador solo existe en macOS. En otros sistemas el servidor arranca y lista sus
> herramientas, pero cada llamada responde `[UNSUPPORTED_PLATFORM]`.

## Instalación

```bash
git clone https://github.com/s-pl/ios-simulator-mcp.git
cd ios-simulator-mcp
npm install        # también compila a dist/
npm test           # opcional
```

### Registrar en Claude Code

```bash
claude mcp add ios-simulator -- node "$(pwd)/dist/index.js"
```

### Registrar en Claude Desktop (u otro cliente)

```json
{
  "mcpServers": {
    "ios-simulator": {
      "command": "node",
      "args": ["/ruta/absoluta/ios-simulator-mcp/dist/index.js"],
      "env": { "IOS_SIMULATOR_MCP_OUTPUT_DIR": "/Users/tu-usuario/Desktop/sim-recordings" }
    }
  }
}
```

### Configuración

| Variable de entorno | Por defecto | Descripción |
| --- | --- | --- |
| `IOS_SIMULATOR_MCP_XCRUN_PATH` | `xcrun` | Ejecutable de `xcrun`. |
| `IOS_SIMULATOR_MCP_IDB_PATH` | `idb` | Ejecutable de `idb`. Útil si el cliente MCP no hereda tu `PATH` (p. ej. `~/.local/bin/idb`). |
| `IOS_SIMULATOR_MCP_OUTPUT_DIR` | `$TMPDIR/ios-simulator-mcp` | Carpeta por defecto para las grabaciones. |

## Herramientas

Casi todas aceptan un parámetro opcional `device` (UDID o nombre exacto). Si se omite, se usa el
único simulador arrancado; si hay varios o ninguno, el error indica cómo desambiguar.

| Grupo | Herramienta | Qué hace |
| --- | --- | --- |
| Dispositivos | `list_devices` | Lista simuladores (nombre, UDID, runtime, estado). |
| | `boot_device` | Arranca un simulador y espera a que esté listo. |
| | `shutdown_device` | Apaga uno o todos. |
| | `erase_device` | Restaura de fábrica (debe estar apagado). |
| | `open_simulator_app` | Trae la ventana de Simulator al frente. |
| Apps | `install_app` / `uninstall_app` | Instala un `.app` / desinstala por bundle id. |
| | `launch_app` / `terminate_app` | Lanza (con argumentos) / termina una app. |
| | `list_apps` | Apps instaladas, filtrables por `User`/`System`. |
| | `open_url` | Abre una URL o deep link. |
| | `get_app_container` | Ruta en el Mac del contenedor de la app. |
| UI (idb) | `ui_describe_screen` | Elementos de accesibilidad con su `tapPoint`. |
| | `ui_describe_point` | Elemento en una coordenada. |
| | `ui_tap` / `ui_swipe` | Toque (o pulsación larga) / deslizamiento. |
| | `ui_type_text` | Escribe en el campo con foco. |
| | `ui_press_button` / `ui_press_key` | Botón físico (HOME, LOCK…) / tecla por código HID. |
| Multimedia | `screenshot` | Captura de pantalla (devuelve la imagen). |
| | `start_recording` / `stop_recording` | Graba la pantalla a `.mp4`. |
| | `add_media` | Añade fotos/vídeos a la fototeca. |
| Entorno | `set_appearance` | Modo claro/oscuro. |
| | `set_location` | Simula o limpia la ubicación GPS. |
| | `set_status_bar` | Fuerza hora, red y batería de la barra de estado. |
| | `set_permission` | Concede/revoca/resetea permisos de privacidad. |
| | `send_push_notification` | Envía una push simulada (payload APNs). |
| Logs | `get_logs` | Logs recientes, filtrables por proceso o texto. |

**Coordenadas:** las herramientas `ui_*` trabajan en *puntos*, no en píxeles de la captura
(píxeles ÷ escala del dispositivo, normalmente 3 en iPhone y 2 en iPad). Lo fiable es tomar el
`tapPoint` de `ui_describe_screen`.

## Arquitectura

Arquitectura hexagonal en cuatro capas. Las dependencias apuntan siempre hacia el dominio.

```
src/
├── domain/            Modelo y contratos. Sin dependencias externas.
│   ├── Device, Runtime, geometry, ui, media, environment, InstalledApp
│   ├── errors.ts      Jerarquía SimulatorError, cada error con un `code` estable
│   └── ports/         Interfaces que la infraestructura implementa (…Gateway)
├── application/       Casos de uso: un servicio por área + DeviceResolver
├── infrastructure/    Adaptadores hacia el mundo real
│   ├── process/       CommandRunner (interfaz) y NodeCommandRunner (child_process)
│   ├── host/          SimulatorHost: único punto de salida a comandos de macOS
│   ├── simctl/        Gateways implementados con `xcrun simctl`
│   └── idb/           Gateway de automatización de UI con `idb`
├── mcp/               Presentación: definiciones de herramientas y servidor MCP
│   ├── ToolDefinition.ts, responses.ts, schemas.ts
│   ├── SimulatorMcpServer.ts
│   └── tools/         Un ToolProvider por grupo de herramientas
├── config.ts          Configuración desde variables de entorno
├── container.ts       Composition root: único lugar que conecta las capas
└── index.ts           Punto de entrada (transporte stdio)
```

Flujo de una llamada: `SimulatorMcpServer` valida la entrada con el esquema zod de la herramienta →
el `ToolProvider` la traduce a una llamada al servicio de aplicación → el servicio resuelve el
dispositivo con `DeviceResolver` y aplica las reglas de negocio → el gateway ejecuta el comando a
través de `SimulatorHost`. Cualquier `SimulatorError` vuelve al cliente como `[CODE] mensaje`.

Decisiones de diseño:

- **Sin shell.** Los comandos se ejecutan como ejecutable + vector de argumentos, así que ningún
  valor que envíe el modelo puede inyectar comandos.
- **Puertos por capacidad** (`DeviceGateway`, `AppGateway`, `UiAutomationGateway`…): `idb` es un
  adaptador más y puede sustituirse sin tocar aplicación ni MCP.
- **Herramientas declarativas.** Cada herramienta es un `ToolDefinition` (contrato + `execute`)
  independiente del SDK de MCP; el servidor solo las registra y centraliza el manejo de errores.
- **Estado acotado.** El único estado son las grabaciones en curso, encapsulado en `MediaService`
  y liberado en `dispose()` al cerrar el servidor.

### Añadir una herramienta

1. Si necesita una capacidad nueva, añádela al puerto en `domain/ports/` e impleméntala en el gateway.
2. Expón el caso de uso en el servicio de `application/`.
3. Declárala con `defineTool({...})` en el `ToolProvider` correspondiente de `mcp/tools/`.

## Desarrollo

```bash
npm run typecheck          # comprueba tipos (src + test)
npm test                   # tests unitarios y e2e en memoria (no necesitan Mac)
npm run test:integration   # tests contra un simulador real (solo macOS)
npm run build              # compila a dist/
npm run docs:dev           # sirve la documentación en local
npm run docs:tools         # regenera la referencia de herramientas
```

Los tests no necesitan un Mac: `FakeCommandRunner` sustituye la ejecución de comandos y
`test/mcp/server.e2e.test.ts` conecta un cliente MCP real al servidor completo en memoria,
verificando los comandos exactos que se emitirían.
Los tests de integración (`test/integration/`) arrancan un simulador de verdad y se ejecutan en CI
sobre un runner de macOS.

La documentación vive en `docs/` y está hecha con [VitePress](https://vitepress.dev); se publica
en GitHub Pages con cada cambio en `main`. La referencia de herramientas
(`docs/referencia/herramientas.md`) se genera a partir del propio servidor.

## Licencia

[MIT](LICENSE) © Samuel Ponce Luna
