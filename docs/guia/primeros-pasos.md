# Primeros pasos

Con el servidor conectado, pide al agente lo que necesites en lenguaje natural. Él elige las
herramientas.

## Ejemplos de peticiones

- «Arranca un iPhone 16 y hazme una captura.»
- «Instala `build/MyApp.app`, lánzala e inicia sesión con el usuario de pruebas.»
- «Abre `myapp://settings`, ponlo en modo oscuro y dime si algo se ve mal.»
- «Concede permiso de fotos a mi app y envíale una push de prueba.»
- «Reproduce el fallo del carrito y enséñame los logs de MyApp del último minuto.»

## Flujo habitual

| Paso | Herramienta | Objetivo |
| --- | --- | --- |
| 1 | `list_devices` | Encontrar el simulador. |
| 2 | `boot_device` | Arrancarlo y esperar a que esté listo. |
| 3 | `install_app`, `launch_app` | Poner la app en marcha. |
| 4 | `ui_describe_screen` | Localizar los elementos en pantalla. |
| 5 | `ui_tap`, `ui_type_text` | Interactuar. |
| 6 | `screenshot` | Verificar el resultado. |

## Ejemplo: iniciar sesión en una app

Así se traduce «lanza MyApp e inicia sesión» en llamadas a herramientas:

1. `launch_app` con `bundleId: "com.example.myapp"` y `terminateRunning: true`.
2. `ui_describe_screen` con `containing: "email"` devuelve el campo y su `tapPoint`.
3. `ui_tap` sobre ese `tapPoint` para darle el foco.
4. `ui_type_text` con el correo.
5. Lo mismo para la contraseña y el botón de entrar.
6. `screenshot` para confirmar que se ha llegado a la pantalla principal.

Consulta la [referencia de herramientas](../referencia/herramientas) para ver todos los parámetros.
