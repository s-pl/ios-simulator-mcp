# Trabajar rápido

Lo que más tiempo consume al manejar el simulador desde un agente no es el simulador: es cada ida
y vuelta con el modelo, y el tamaño de lo que el servidor le devuelve. El servidor está diseñado
para reducir ambas cosas. Sus instrucciones ya le indican al modelo cómo aprovecharlo, pero
conviene conocerlo para formular mejor las peticiones.

## Menos llamadas

### Tocar por texto

`ui_tap_element` busca un elemento por su texto visible, su identificador o su tipo, y lo toca,
todo en una llamada. Sustituye a la pareja `ui_describe_screen` más `ui_tap`.

```json
{ "label": "Iniciar sesión" }
```

Además espera unos segundos a que el elemento aparezca, así que puede usarse justo después de una
transición de pantalla. Consulta [cómo se localiza un elemento](./conceptos#localizar-elementos).

### Recibir la pantalla resultante

Todas las acciones de interfaz aceptan `describeAfter: true`. La respuesta incluye entonces los
elementos que hay en pantalla después de la acción, sin necesidad de pedirlos aparte.

```json
{ "label": "Iniciar sesión", "describeAfter": true }
```

### Secuencias

`ui_sequence` ejecuta varios pasos en una sola llamada. Es la opción adecuada para cualquier
flujo que se pueda planificar de antemano, como rellenar un formulario:

```json
{
  "steps": [
    { "action": "paste_text", "text": "José Muñoz", "label": "Nombre" },
    { "action": "tap_element", "label": "Email" },
    { "action": "type_text", "text": "jose@example.com" },
    { "action": "scroll_to_element", "label": "Enviar" },
    { "action": "tap_element", "label": "Enviar" },
    { "action": "wait_for_element", "label": "Gracias", "timeoutSeconds": 15 }
  ],
  "describeAfter": true
}
```

La secuencia se detiene en el primer paso que falla. La respuesta indica qué pasos se
completaron, el error y lo que hay en pantalla en ese momento, de modo que el modelo puede
continuar desde ahí.

Pasos disponibles: `tap`, `tap_element`, `type_text`, `paste_text`, `scroll_to_element`, `swipe`,
`press_button`, `press_key`, `wait` y `wait_for_element`.

### Desplazarse hasta un elemento

`ui_scroll_to_element` desliza la pantalla hasta que un elemento es visible y lo devuelve.
Sustituye al bucle de `ui_swipe` y `ui_describe_screen`. Se detiene cuando el elemento aparece,
cuando se llega al final del contenido o tras `maxSwipes` deslizamientos.

### Esperar en vez de sondear

`ui_wait_for_element` espera a que un elemento esté en pantalla. Evita encadenar llamadas a
`ui_describe_screen` mientras una app carga.

## Respuestas más pequeñas

### Pantalla en texto compacto

`ui_describe_screen` devuelve una línea por elemento:

```
Button "Iniciar sesión" id=login.submit @(195,725) 350x50
```

Cada línea incluye el tipo, el texto, el identificador, el punto donde tocarlo y su tamaño. Ocupa
menos de la mitad que el JSON equivalente.

### Capturas en puntos

`screenshot` reduce la imagen a un píxel por punto. En un iPhone con escala 3 es una novena parte
de los píxeles, y por tanto muchos menos tokens de imagen. Además, las posiciones de la imagen
coinciden con las coordenadas de `ui_tap`. Usa `resolution: "full"` cuando necesites la resolución
nativa.

### Lista de apps sin rutas

`list_apps` devuelve una línea por app, sin la ruta interna del paquete. Si la necesitas, pídela
con `get_app_container`.

## Menos trabajo en el servidor

Casi todas las llamadas necesitan saber qué simulador usar, y consultar la lista a `simctl` es de
lo más lento que hace el servidor. La lista se reutiliza durante diez segundos entre llamadas.

La caché solo se usa para respuestas positivas. Antes de informar de que un dispositivo no existe
o no está arrancado, el servidor vuelve a consultar, de modo que un simulador arrancado desde
Xcode se encuentra siempre. Las operaciones que cambian el estado de un simulador la invalidan.

La duración se ajusta con `IOS_SIMULATOR_MCP_DEVICE_CACHE_MS`; `0` la desactiva. Consulta
[Configuración](./configuracion).

## Mediciones

Estas cifras salen de los tests de integración, que se ejecutan en cada cambio contra un iPhone
16e con iOS 26.2 en un runner de macOS de GitHub Actions. Es una máquina virtual lenta: en un Mac
de desarrollo los tiempos absolutos serán menores. Lo que importa son las proporciones.

Pulsar tres veces el mismo botón:

| Método | Llamadas a herramientas | Tiempo en el servidor |
| --- | --- | --- |
| `ui_describe_screen` y `ui_tap` por coordenadas | 6 | 10,0 s |
| `ui_tap_element` | 3 | 5,6 s |
| `ui_sequence` | 1 | 6,2 s |

`ui_tap_element` reduce el tiempo del servidor casi a la mitad. `ui_sequence` no ahorra tiempo de
servidor frente a tres `ui_tap_element`; lo que ahorra son dos idas y vueltas con el modelo, que
no aparecen en esta tabla y suelen costar varios segundos cada una.

Coste de cada operación:

| Operación | Tiempo medio |
| --- | --- |
| `ui_describe_screen` | 0,9 s |
| `ui_tap` | 0,6 s |
| Listar simuladores, que es lo que la caché evita en cada llamada | 1,4 s |

Tamaño de las respuestas:

| Respuesta | Tamaño |
| --- | --- |
| `ui_describe_screen` de una pantalla con 16 elementos | 964 caracteres |
| Captura a resolución nativa (JPEG) | 167 kB |
| Captura en puntos (JPEG) | 29 kB |

La captura en puntos ocupa algo menos de una sexta parte.

Las mediciones de cada ejecución quedan como artefacto `simulator-artifacts` del flujo de CI.

## En el cliente

- **Permite las herramientas del servidor** para que el cliente no pida confirmación en cada
  llamada. En Claude Code, con `/permissions`.
- **Pide flujos completos.** «Inicia sesión con el usuario de pruebas y abre Ajustes» permite una
  sola secuencia; pedirlo paso a paso obliga a una llamada por paso.
- **Reserva las capturas para lo visual.** Para saber qué hay en pantalla o dónde tocar, el texto
  de `ui_describe_screen` es más rápido y exacto.
