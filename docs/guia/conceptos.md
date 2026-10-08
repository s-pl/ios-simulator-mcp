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

## Localizar elementos

`ui_tap_element`, `ui_wait_for_element`, `ui_paste_text`, `ui_scroll_to_element` y los pasos
equivalentes de `ui_sequence` designan un elemento con uno o varios de estos criterios, que se
combinan con «y»:

| Criterio | Coincidencia |
| --- | --- |
| `label` | Texto visible del elemento: su etiqueta de accesibilidad o su valor. No distingue mayúsculas. |
| `identifier` | `accessibilityIdentifier` exacto. Es la opción más estable si la app los define. |
| `type` | Tipo de accesibilidad, por ejemplo `Button` o `TextField`. |
| `index` | Qué coincidencia usar, empezando en 0, cuando hay varias. |

Reglas de `label`:

- Una coincidencia exacta tiene prioridad sobre una parcial. `"Entrar"` elige el botón «Entrar»
  aunque exista «Entrar con Apple».
- Si no hay ninguna exacta, se aceptan los elementos cuyo texto contiene el indicado.
- Un contenedor y la etiqueta que lleva dentro, con el mismo texto, cuentan como un solo destino.

Si varios elementos distintos coinciden y no se indica `index`, la llamada falla con
`[AMBIGUOUS_ELEMENT]` y lista los candidatos numerados. Si no coincide ninguno tras la espera,
falla con `[ELEMENT_NOT_FOUND]` y lista lo que hay en pantalla.

## Puntos, no píxeles

Las herramientas `ui_*` trabajan en **puntos**, el espacio de coordenadas de UIKit. La pantalla
física tiene más **píxeles**: puntos multiplicados por la escala del dispositivo, normalmente 3 en
iPhone y 2 en iPad.

`screenshot` devuelve por defecto la imagen reducida a un píxel por punto, así que las posiciones
de la imagen son directamente coordenadas válidas para `ui_tap`. Con `resolution: "full"` la
imagen está en píxeles y hay que dividir por la escala; el texto que acompaña a la captura indica
siempre en qué unidad está.

Cuando el destino tiene texto o identificador, `ui_tap_element` evita trabajar con coordenadas.

## Operaciones que requieren un estado concreto

| Operación | Estado necesario |
| --- | --- |
| Apps, interfaz, multimedia, entorno y logs | Simulador arrancado |
| `erase_device` | Simulador apagado |

`erase_device` nunca apaga el simulador por su cuenta: borrar es irreversible y debe ser un paso
explícito.

## Comprobaciones previas

El servidor valida lo que puede antes de ejecutar nada, para devolver un mensaje claro en lugar
del error interno de la herramienta subyacente:

- `install_app` y `add_media` comprueban que las rutas existen.
- `open_url` comprueba que el texto es una URL con esquema.
- `uninstall_app` comprueba que la app está instalada.
- `ui_type_text` comprueba que todo el texto se puede teclear.

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
