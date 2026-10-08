# Conceptos clave

## El parámetro `device`

Casi todas las herramientas aceptan un parámetro opcional `device`, que puede ser un UDID o el
nombre exacto del simulador, sin distinguir mayúsculas. Se resuelve así:

- **Omitido.** Se usa el único simulador arrancado. Si no hay ninguno, o hay varios, la llamada
  falla con un error que indica cómo elegir.
- **UDID.** Ese dispositivo.
- **Nombre.** Ese dispositivo. Si varios runtimes comparten el nombre (por ejemplo, «iPhone 15»
  en iOS 17 y en iOS 18), se elige el que esté arrancado. Si no se puede decidir, se pide el UDID.

Solo se tienen en cuenta los simuladores disponibles; los que Xcode marca como no disponibles se
ignoran.

Las operaciones en las que adivinar sería peligroso, `boot_device` y `erase_device`, exigen
`device`.

## Puntos, no píxeles

Las herramientas `ui_*` trabajan en **puntos**, el espacio de coordenadas de UIKit. Una captura de
pantalla está en **píxeles**: puntos multiplicados por la escala del dispositivo, normalmente 3 en
iPhone y 2 en iPad.

Para tocar un elemento, usa el `tapPoint` que devuelve `ui_describe_screen` en lugar de estimar
coordenadas sobre la imagen.

## Operaciones que requieren un estado concreto

| Operación | Estado necesario |
| --- | --- |
| Apps, interfaz, multimedia, entorno y logs | Simulador arrancado |
| `erase_device` | Simulador apagado |

`erase_device` nunca apaga el simulador por su cuenta: borrar es irreversible y debe ser un paso
explícito.

## Indicadores de comportamiento

Cada herramienta declara cómo afecta al simulador mediante las anotaciones estándar de MCP. Los
clientes las usan para decidir cuándo pedir confirmación.

| Tipo | Significado |
| --- | --- |
| Lectura | Solo consulta estado. |
| Modifica | Cambia estado de forma fácil de deshacer o repetir. |
| Destructiva | Borra datos que no se pueden recuperar (`erase_device`, `uninstall_app`). |

## Grabaciones

`start_recording` inicia una grabación por dispositivo y `stop_recording` la finaliza. El archivo
de vídeo solo queda completo tras detenerla. Si el servidor se cierra con normalidad, detiene las
grabaciones pendientes.
