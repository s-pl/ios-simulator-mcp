# Cambios

## 1.3.0

### Nuevo

- Conexión directa y persistente con `idb_companion` por gRPC para todas las acciones de interfaz,
  en lugar de arrancar el cliente de Python de `idb` en cada llamada. Medido en un simulador real:
  un toque pasa de unos 0,62 s a entre 0,01 y 0,19 s, y leer la pantalla de 0,79 s a 0,17 s.
- Variable `IOS_SIMULATOR_MCP_UI_BACKEND` (`auto`, `companion`, `cli`). Por defecto `auto`: usa la
  conexión directa y recurre al cliente de línea de comandos si no puede arrancarla.
- Variable `IOS_SIMULATOR_MCP_IDB_COMPANION_PATH`.

### Cambios

- El cliente de Python `fb-idb` pasa a ser opcional; basta con `idb-companion`.
- Los comandos de `simctl` que se pueden repetir sin efectos secundarios se reintentan cuando
  CoreSimulator responde «Operation timed out» (abrir una URL, portapapeles, apariencia,
  ubicación, barra de estado, permisos, listar apps).

## 1.2.0

### Nuevo

- `ui_paste_text`: introduce cualquier texto en un campo a través del portapapeles (tildes, ñ,
  emojis, cualquier alfabeto), en una sola llamada. Comprobado en un simulador real. También
  disponible como paso `paste_text` de `ui_sequence`.
- `ui_scroll_to_element`: se desplaza hasta que un elemento es visible. También disponible como
  paso `scroll_to_element`.
- Documentación en inglés, junto a la española, y README en ambos idiomas.
- App de prueba SwiftUI (`test/fixtures/app/`) que el CI compila e instala en un simulador real
  para comprobar escritura, pegado, desplazamiento, enlaces, permisos y notificaciones push.
- Mediciones de tiempos y tamaños de respuesta en cada ejecución del CI.
- ESLint y Prettier, exigidos en el CI.
- Flujo de publicación en npm al crear una release.

### Cambios

- El paquete pasa a llamarse `@s-pl/ios-simulator-mcp`, porque `ios-simulator-mcp` ya existe en npm.
- `ui_type_text` y el error `UNSUPPORTED_TEXT` remiten a `ui_paste_text`.
- `open_url` avisa de que iOS puede pedir confirmación al abrir un enlace a una app.

### Documentado

- No hay gestos de varios dedos (pellizco, rotación): `idb` simula un solo dedo.

## 1.1.0

Versión centrada en reducir el tiempo que un agente tarda en manejar el simulador y en corregir
los problemas encontrados al probarlo en un Mac.

### Nuevo

- `ui_tap_element`: localiza un elemento por texto, identificador o tipo y lo toca en una llamada.
  Espera a que aparezca.
- `ui_wait_for_element`: espera a que un elemento esté en pantalla.
- `ui_sequence`: ejecuta varios pasos de interfaz en una sola llamada y, si uno falla, informa de
  los completados, del error y de la pantalla actual.
- Parámetro `describeAfter` en todas las acciones de interfaz, para recibir la pantalla resultante.
- `set_clipboard` y `get_clipboard`, que permiten introducir texto que el teclado no puede escribir.
- Parámetro `resolution` en `screenshot`.
- Variable `IOS_SIMULATOR_MCP_DEVICE_CACHE_MS`.

### Cambios

- `screenshot` devuelve por defecto la imagen reducida a un píxel por punto: es mucho más pequeña
  y sus posiciones son coordenadas válidas para `ui_tap`. `resolution: "full"` conserva la
  resolución nativa.
- `ui_describe_screen` y `ui_describe_point` devuelven texto compacto, una línea por elemento, en
  lugar de JSON.
- `list_apps` devuelve una línea por app y ya no incluye la ruta interna de cada una.
- La lista de simuladores se reutiliza durante diez segundos entre llamadas.
- `boot_device` ya no falla si lo único que falla es abrir la ventana de Simulator: devuelve un
  aviso.
- El tiempo máximo por defecto de un comando pasa de 60 a 120 segundos.

### Correcciones

- `ui_type_text` rechaza de antemano el texto con tildes, ñ, emojis u otros alfabetos con un
  error `UNSUPPORTED_TEXT` que explica la alternativa, en vez de fallar a medias con un traceback
  de Python. Los saltos de línea y tabuladores se envían como pulsaciones de tecla.
- Los errores de `idb` ya no incluyen el traceback de Python, solo su mensaje.
- `uninstall_app` ya no dice haber desinstalado una app que no está instalada.
- `launch_app`, `terminate_app` y `get_app_container` explican cuándo el fallo se debe a que la
  app no está instalada.
- `install_app` y `add_media` comprueban que las rutas existen antes de ejecutar nada.
- `open_url` rechaza el texto que no es una URL.
- `send_push_notification` explica el error «Source is not authorized».
- `ui_describe_screen` explica qué hacer cuando el simulador no tiene ventana.

### Documentado

- Los deslizamientos desde un borde no activan los gestos del sistema.
- La pantalla puede salir en negro unos segundos mientras una app carga.

## 1.0.0

Primera versión: 29 herramientas para dispositivos, apps, interfaz, multimedia, entorno y logs.
