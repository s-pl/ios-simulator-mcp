# Códigos de error

Los fallos se devuelven como resultado de error de la herramienta, con el formato
`[CÓDIGO] mensaje`. El mensaje indica qué hacer a continuación.

| Código | Significado |
| --- | --- |
| `UNSUPPORTED_PLATFORM` | El servidor no se está ejecutando en macOS. |
| `EXECUTABLE_NOT_FOUND` | Falta `xcrun` o `idb`. El mensaje incluye cómo instalarlo. |
| `COMMAND_FAILED` | Un comando terminó con error. Incluye el comando exacto y su salida. |
| `COMMAND_TIMEOUT` | Un comando superó su tiempo máximo. |
| `UNEXPECTED_OUTPUT` | La salida de una herramienta externa no tiene el formato esperado. |
| `DEVICE_NOT_FOUND` | Ningún simulador disponible coincide con el nombre o UDID. |
| `NO_BOOTED_DEVICE` | Se omitió `device` y no hay ningún simulador arrancado. |
| `AMBIGUOUS_DEVICE` | Varios simuladores coinciden. El mensaje lista los candidatos. |
| `DEVICE_NOT_BOOTED` | La operación necesita el simulador arrancado. |
| `DEVICE_NOT_SHUTDOWN` | La operación necesita el simulador apagado. |
| `RECORDING_ALREADY_ACTIVE` | Ya hay una grabación en curso en ese dispositivo. |
| `NO_ACTIVE_RECORDING` | No hay ninguna grabación que detener. |
| `INVALID_ARGUMENT` | Un valor es válido sintácticamente pero no aceptable. |
| `UNEXPECTED_ERROR` | Fallo no previsto. Conviene informar de él. |

Las entradas que no cumplen el esquema de la herramienta (un tipo incorrecto, un valor fuera de
rango) las rechaza el propio protocolo antes de ejecutar nada.

En el código, cada error es una subclase de `SimulatorError` definida en
[`src/domain/errors.ts`](https://github.com/s-pl/ios-simulator-mcp/blob/main/src/domain/errors.ts).
