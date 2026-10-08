# Configuración

El servidor funciona sin configuración. Estos ajustes opcionales se indican con variables de
entorno.

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `IOS_SIMULATOR_MCP_XCRUN_PATH` | `xcrun` | Ejecutable de `xcrun`. |
| `IOS_SIMULATOR_MCP_IDB_PATH` | `idb` | Ejecutable de `idb`, usado por las herramientas `ui_*`. |
| `IOS_SIMULATOR_MCP_UI_BACKEND` | `auto` | Cómo se maneja la interfaz: `companion` (conexión directa con `idb_companion`, la más rápida), `cli` (cliente de línea de comandos `idb`) o `auto` (prefiere `companion` y recurre a `cli` si no puede arrancarlo). |
| `IOS_SIMULATOR_MCP_IDB_COMPANION_PATH` | `idb_companion` | Ejecutable de `idb_companion`. |
| `IOS_SIMULATOR_MCP_OUTPUT_DIR` | `$TMPDIR/ios-simulator-mcp` | Carpeta donde se guardan las grabaciones cuando no se indica una ruta. |
| `IOS_SIMULATOR_MCP_DEVICE_CACHE_MS` | `10000` | Milisegundos durante los que se reutiliza la lista de simuladores entre llamadas. `0` desactiva la caché. Consulta [Trabajar rápido](./rendimiento#cache-de-la-lista-de-simuladores). |

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
