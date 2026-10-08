# Limitaciones conocidas

Estas limitaciones vienen de las herramientas en las que se apoya el servidor (`simctl` e `idb`),
no del servidor. Para cada una se indica cómo se comporta el servidor y qué alternativa hay.

## Texto con tildes, ñ, emojis u otros alfabetos

`idb` simula un teclado físico estadounidense, así que `ui_type_text` solo puede escribir letras
latinas sin acento, cifras y la puntuación habitual. Los saltos de línea y los tabuladores sí
funcionan: se envían como pulsaciones de tecla.

El servidor valida el texto antes de escribir nada. Si contiene caracteres que no se pueden
teclear, responde `[UNSUPPORTED_TEXT]` indicando cuáles son, en lugar de escribir la mitad y
fallar.

**Alternativa:** `ui_paste_text`. Introduce cualquier texto en un campo a través del
portapapeles, en una sola llamada:

```json
{ "text": "Añadir canción 🎵", "identifier": "name.field" }
```

Por dentro copia el texto, mantiene pulsado el campo y toca la opción de pegar del menú que
aparece. Está comprobado en un simulador real con iOS 26. A tener en cuenta:

- El texto se inserta en la posición del cursor; no sustituye lo que el campo ya contenga.
- La opción de pegar se reconoce en español, inglés, francés, alemán, italiano, portugués,
  neerlandés, japonés, chino y coreano. Si el simulador está en otro idioma, la herramienta
  responde `[PASTE_UNAVAILABLE]` con lo que hay en pantalla, y puedes tocar la opción con
  `ui_tap_element`.
- Algunos campos no ofrecen menú de edición (por ejemplo, ciertos campos personalizados). En ese
  caso la respuesta es también `[PASTE_UNAVAILABLE]`; el texto queda igualmente en el
  portapapeles.

## Gestos desde los bordes de la pantalla

Los deslizamientos que empiezan en un borde no activan los gestos del sistema: el Centro de
notificaciones, el Centro de control o el selector de apps no se abren con `ui_swipe`.

**Alternativa:** usa `ui_press_button` con `HOME` para volver a la pantalla de inicio, y
`launch_app` o `open_url` para cambiar de app.

## Gestos con varios dedos

`idb` solo simula un dedo, así que no hay pellizco, rotación ni otros gestos multitáctiles.

**Alternativa:** si tu app ofrece otro camino para la misma acción (botones de zoom, doble toque),
úsalo. Un doble toque se consigue con dos `ui_tap` seguidos dentro de un `ui_sequence`.

## Confirmación al abrir un enlace a una app

Al abrir con `open_url` un enlace con esquema propio (`miapp://...`), iOS puede mostrar un aviso
pidiendo confirmación para abrir la app.

**Alternativa:** toca el botón de confirmación con `ui_tap_element` y `label: "Open"` (o `"Abrir"`
si el simulador está en español).

## La pantalla sale en negro al lanzar una app

Durante unos segundos después de `launch_app`, una captura puede salir negra y
`ui_describe_screen` puede no devolver elementos: la app todavía está cargando. Es más frecuente
justo después de arrancar el simulador.

**Alternativa:** espera con `ui_wait_for_element` a un elemento que sepas que estará en la
pantalla, en vez de actuar o capturar de inmediato.

## La interfaz necesita la ventana de Simulator

`idb` lee la accesibilidad a través de la aplicación Simulator. Si el simulador se arrancó sin
ventana, `ui_describe_screen` falla con «No translation object returned».

`boot_device` abre la ventana por defecto. Si no puede abrirla, el arranque se da por bueno y la
respuesta incluye un aviso; en ese caso, ejecuta `open_simulator_app` antes de usar las
herramientas de interfaz.

## Notificaciones push

`send_push_notification` entrega la notificación a la app, pero iOS solo la muestra si la app ha
pedido permiso para notificaciones y se le ha concedido. Si `simctl` responde «Source is not
authorized», el servidor añade una explicación.

`set_permission` no cubre las notificaciones: hay que lanzar la app, provocar su solicitud de
permiso y aceptarla en pantalla, por ejemplo con `ui_tap_element` y `label: "Allow"`.

## Cambios hechos fuera del servidor

La lista de simuladores se reutiliza durante unos segundos. Si apagas un simulador desde Xcode y
llamas a una herramienta inmediatamente, puede fallar con un error de `simctl` hasta que la lista
se renueve. El caso contrario, un simulador arrancado fuera del servidor, se detecta siempre.
