# Códigos de error

Los fallos se devuelven como resultado de error de la herramienta, con el formato
`[CÓDIGO] mensaje`. El mensaje indica qué hacer a continuación.

| Código | Significado |
| --- | --- |
| `UNSUPPORTED_PLATFORM` | El servidor no se está ejecutando en macOS. |
| `EXECUTABLE_NOT_FOUND` | Falta `xcrun` o `idb`. El mensaje incluye cómo instalarlo. |
| `COMMAND_FAILED` | Un comando terminó con error. Incluye el comando exacto, su salida y, cuando la causa es conocida, una línea `Hint:` con la solución. |
| `COMMAND_TIMEOUT` | Un comando superó su tiempo máximo. |
| `UNEXPECTED_OUTPUT` | La salida de una herramienta externa no tiene el formato esperado. |
| `DEVICE_NOT_FOUND` | Ningún simulador disponible coincide con el nombre o UDID. |
| `NO_BOOTED_DEVICE` | Se omitió `device` y no hay ningún simulador arrancado. |
| `AMBIGUOUS_DEVICE` | Varios simuladores coinciden. El mensaje lista los candidatos. |
| `DEVICE_NOT_BOOTED` | La operación necesita el simulador arrancado. |
| `DEVICE_NOT_SHUTDOWN` | La operación necesita el simulador apagado. |
| `RECORDING_ALREADY_ACTIVE` | Ya hay una grabación en curso en ese dispositivo. |
| `NO_ACTIVE_RECORDING` | No hay ninguna grabación que detener. |
| `ELEMENT_NOT_FOUND` | Ningún elemento en pantalla coincide con la búsqueda. El mensaje lista los que hay. |
| `AMBIGUOUS_ELEMENT` | Varios elementos coinciden. El mensaje los lista numerados para elegir con `index`. |
| `UNSUPPORTED_TEXT` | El texto contiene caracteres que el teclado simulado no puede escribir. Usa `ui_paste_text`. |
| `PASTE_UNAVAILABLE` | El texto se copió, pero el campo no ofreció la opción de pegar. Consulta [Limitaciones](../guia/limitaciones). |
| `APP_NOT_INSTALLED` | La app indicada no está instalada en el simulador. |
| `PATH_NOT_FOUND` | Un archivo o carpeta indicado no existe en el Mac. |
| `INVALID_ARGUMENT` | Un valor es válido sintácticamente pero no aceptable. |
| `UNEXPECTED_ERROR` | Fallo no previsto. Conviene informar de él. |

Las entradas que no cumplen el esquema de la herramienta (un tipo incorrecto, un valor fuera de
rango) las rechaza el propio protocolo antes de ejecutar nada.

En el código, cada error es una subclase de `SimulatorError` definida en
[`src/domain/errors.ts`](https://github.com/s-pl/ios-simulator-mcp/blob/main/src/domain/errors.ts).
