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
| 4 | `ui_wait_for_element` | Esperar a que la app haya cargado. |
| 5 | `ui_tap_element`, `ui_sequence` | Interactuar. |
| 6 | `ui_describe_screen`, `screenshot` | Verificar el resultado. |

## Ejemplo: iniciar sesión en una app

«Lanza MyApp e inicia sesión» se resuelve en dos llamadas:

1. `launch_app` con `bundleId: "com.example.myapp"` y `terminateRunning: true`.
2. `ui_sequence` con todo el flujo:

```json
{
  "steps": [
    { "action": "wait_for_element", "label": "Email", "timeoutSeconds": 20 },
    { "action": "tap_element", "label": "Email" },
    { "action": "type_text", "text": "ana@example.com" },
    { "action": "tap_element", "label": "Password" },
    { "action": "type_text", "text": "secreto" },
    { "action": "tap_element", "label": "Sign in" }
  ],
  "describeAfter": true
}
```

La respuesta enumera los pasos ejecutados y termina con los elementos de la pantalla resultante,
con lo que el agente confirma que ha llegado a la pantalla principal sin más llamadas.

Consulta [Trabajar rápido](./rendimiento) para sacar partido a estas herramientas, y la
[referencia](../referencia/herramientas) para ver todos los parámetros.
