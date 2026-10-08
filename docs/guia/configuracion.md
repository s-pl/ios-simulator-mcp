# Configuración

El servidor funciona sin configuración. Estos ajustes opcionales se indican con variables de
entorno.

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `IOS_SIMULATOR_MCP_XCRUN_PATH` | `xcrun` | Ejecutable de `xcrun`. |
| `IOS_SIMULATOR_MCP_IDB_PATH` | `idb` | Ejecutable de `idb`, usado por las herramientas `ui_*`. |
| `IOS_SIMULATOR_MCP_OUTPUT_DIR` | `$TMPDIR/ios-simulator-mcp` | Carpeta donde se guardan las grabaciones cuando no se indica una ruta. |

## Claude Code

```bash
claude mcp add ios-simulator \
  -e IOS_SIMULATOR_MCP_IDB_PATH="$(which idb)" \
  -e IOS_SIMULATOR_MCP_OUTPUT_DIR="$HOME/Desktop/sim" \
  -- node "$(pwd)/dist/index.js"
```

## Claude Desktop y otros clientes

```json
{
  "mcpServers": {
    "ios-simulator": {
      "command": "node",
      "args": ["/ruta/absoluta/ios-simulator-mcp/dist/index.js"],
      "env": {
        "IOS_SIMULATOR_MCP_IDB_PATH": "/Users/tu-usuario/.local/bin/idb",
        "IOS_SIMULATOR_MCP_OUTPUT_DIR": "/Users/tu-usuario/Desktop/sim"
      }
    }
  }
}
```
