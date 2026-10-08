# Solución de problemas

## Las herramientas `ui_*` responden `EXECUTABLE_NOT_FOUND`

Falta `idb` o el cliente MCP no lo encuentra en su `PATH`. Instálalo siguiendo
[Instalar idb](./instalacion#instalar-idb) y, si sigue fallando, define
`IOS_SIMULATOR_MCP_IDB_PATH` con la salida de `which idb`.

## `NO_BOOTED_DEVICE` al usar cualquier herramienta

No hay ningún simulador arrancado. Usa `list_devices` y después `boot_device`, o indica `device`.

## `ui_describe_screen` falla con «No translation object returned»

idb no puede leer la accesibilidad del simulador. Suele ocurrir cuando el simulador se ha
arrancado sin ventana. Abre la aplicación Simulator con `open_simulator_app` y vuelve a intentarlo.

## Los toques caen en el sitio equivocado

Probablemente se están usando píxeles de la captura. Usa el `tapPoint` de `ui_describe_screen`,
que ya está en puntos. Consulta [Puntos, no píxeles](./conceptos#puntos-no-pixeles).

## `xcrun: error: unable to find utility "simctl"`

Las herramientas de línea de comandos no apuntan a Xcode:

```bash
sudo xcode-select -s /Applications/Xcode.app
```

## El vídeo grabado no se abre

La grabación solo se finaliza con `stop_recording`. Si el proceso del servidor se mata a la
fuerza, el archivo puede quedar incompleto.

## Cómo saber qué comando falló

Los errores `COMMAND_FAILED` incluyen la línea de comandos exacta y su salida. Cópiala y
ejecútala en una terminal para reproducir el problema.

## Informar de un fallo

[Abre una incidencia](https://github.com/s-pl/ios-simulator-mcp/issues/new) indicando la versión
de macOS y de Xcode, y el mensaje de error completo.
