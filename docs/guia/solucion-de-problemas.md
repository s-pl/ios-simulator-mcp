# Solución de problemas

## Las herramientas `ui_*` responden `EXECUTABLE_NOT_FOUND`

Falta `idb` o el cliente MCP no lo encuentra en su `PATH`. Instálalo siguiendo
[Instalar idb](./instalacion#instalar-idb) y, si sigue fallando, define
`IOS_SIMULATOR_MCP_IDB_PATH` con la salida de `which idb`.

## `NO_BOOTED_DEVICE` al usar cualquier herramienta

No hay ningún simulador arrancado. Usa `list_devices` y después `boot_device`, o indica `device`.

## `ui_describe_screen` falla con «No translation object returned»

idb no puede leer la accesibilidad del simulador. Ocurre cuando el simulador se ha arrancado sin
ventana. Abre la aplicación Simulator con `open_simulator_app`, espera unos segundos y vuelve a
intentarlo.

## `boot_device` responde con un aviso sobre la ventana

El simulador ha arrancado, pero no se pudo abrir la ventana de Simulator. Todo funciona salvo las
herramientas de interfaz. Ejecuta `open_simulator_app` o abre Simulator a mano.

## `ui_type_text` responde `UNSUPPORTED_TEXT`

El texto contiene tildes, ñ, emojis u otros caracteres que el teclado simulado no puede escribir.
Usa `ui_paste_text`, que introduce cualquier texto.

## `ui_paste_text` responde `PASTE_UNAVAILABLE`

El texto se copió, pero no apareció ninguna opción de pegar tras mantener pulsado el campo.
Comprueba que el destino es un campo de texto editable. Si el simulador está en un idioma que la
herramienta no reconoce, el error lista lo que hay en pantalla: toca la opción de pegar con
`ui_tap_element`. Consulta [Limitaciones conocidas](./limitaciones).

## Un enlace no llega a la app

iOS puede estar pidiendo confirmación para abrir la app. Lee la pantalla con
`ui_describe_screen` y toca el botón «Open» o «Abrir».

## La captura sale en negro

La app todavía está cargando. Espera con `ui_wait_for_element` a un elemento de la pantalla antes
de capturar.

## Un deslizamiento no abre el Centro de notificaciones

Los gestos que empiezan en un borde de la pantalla no activan los gestos del sistema. Consulta
[Limitaciones conocidas](./limitaciones#gestos-desde-los-bordes-de-la-pantalla).

## Una push falla con «Source is not authorized»

La app no tiene permiso para mostrar notificaciones. Debe pedirlo y hay que aceptarlo en pantalla
antes de enviarle una push.

## Los toques caen en el sitio equivocado

Probablemente se están usando coordenadas de una captura tomada con `resolution: "full"`, que
está en píxeles. Usa `ui_tap_element`, las coordenadas de `ui_describe_screen` o una captura a la
resolución por defecto. Consulta [Puntos, no píxeles](./conceptos#puntos-no-pixeles).

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
