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

**Alternativa:** el portapapeles.

1. `set_clipboard` con el texto completo. Acepta cualquier texto Unicode.
2. Mantén pulsado el campo: `ui_tap_element` con `durationSeconds: 1`.
3. Toca la opción de pegar del menú que aparece: `ui_tap_element` con `label: "Paste"`, o
   `"Pegar"` si el simulador está en español.

El primer paso está comprobado en un simulador real: el portapapeles conserva tildes, ñ y emojis.
Los pasos 2 y 3 son el gesto habitual de iOS para pegar, pero no están cubiertos por los tests
automáticos: el menú depende de cada app y de su idioma. Si no aparece la opción de pegar, usa
`ui_describe_screen` tras la pulsación larga para ver qué ofrece el menú.

## Gestos desde los bordes de la pantalla

Los deslizamientos que empiezan en un borde no activan los gestos del sistema: el Centro de
notificaciones, el Centro de control o el selector de apps no se abren con `ui_swipe`.

**Alternativa:** usa `ui_press_button` con `HOME` para volver a la pantalla de inicio, y
`launch_app` o `open_url` para cambiar de app.

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

`send_push_notification` solo funciona si la app ya ha pedido permiso para mostrar notificaciones
y se le ha concedido. En caso contrario `simctl` responde «Source is not authorized», y el
servidor añade una explicación.

`set_permission` no cubre las notificaciones: hay que lanzar la app, provocar su solicitud de
permiso y aceptarla en pantalla.

## Cambios hechos fuera del servidor

La lista de simuladores se reutiliza durante unos segundos. Si apagas un simulador desde Xcode y
llamas a una herramienta inmediatamente, puede fallar con un error de `simctl` hasta que la lista
se renueve. El caso contrario, un simulador arrancado fuera del servidor, se detecta siempre.
