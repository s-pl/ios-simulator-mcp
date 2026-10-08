# Instalación

## Requisitos

| Requisito | Para qué | Cómo instalarlo |
| --- | --- | --- |
| macOS con Xcode | Todo. El servidor usa `xcrun simctl`. | App Store y `xcode-select --install` |
| Node.js 20 o superior | Ejecutar el servidor. | `brew install node` |
| [idb](https://fbidb.io) (opcional) | Solo las herramientas `ui_*`. | Ver [Instalar idb](#instalar-idb) |

::: warning Solo macOS
El Simulador de iOS no existe en Windows ni en Linux. En esos sistemas el servidor arranca y
publica sus herramientas, pero cada llamada devuelve `[UNSUPPORTED_PLATFORM]`.
:::

## Descargar y compilar

```bash
git clone https://github.com/s-pl/ios-simulator-mcp.git
cd ios-simulator-mcp
npm install
```

`npm install` también compila el proyecto a `dist/`.

## Registrar el servidor

### Claude Code

Desde la carpeta del proyecto:

```bash
claude mcp add ios-simulator -- node "$(pwd)/dist/index.js"
```

Comprueba que está conectado con `claude mcp list`, o con `/mcp` dentro de una sesión.

### Claude Desktop y otros clientes

Añade el servidor al archivo de configuración del cliente. En Claude Desktop es
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ios-simulator": {
      "command": "node",
      "args": ["/ruta/absoluta/ios-simulator-mcp/dist/index.js"]
    }
  }
}
```

## Instalar idb

`simctl` no puede inyectar toques ni leer el contenido de la pantalla, así que las herramientas
`ui_*` usan [idb](https://fbidb.io), de Meta. El resto del servidor funciona sin él.

```bash
brew tap facebook/fb
brew install idb-companion
pipx install fb-idb
```

Si Homebrew rechaza la fórmula por venir de un tap que no es de confianza, ejecuta antes
`brew trust facebook/fb`.

::: tip El cliente no encuentra idb
Las aplicaciones de escritorio no heredan el `PATH` de tu terminal. Si las herramientas `ui_*`
responden `[EXECUTABLE_NOT_FOUND]`, indica la ruta completa con la variable
`IOS_SIMULATOR_MCP_IDB_PATH`. La obtienes con `which idb`. Consulta
[Configuración](./configuracion).
:::
