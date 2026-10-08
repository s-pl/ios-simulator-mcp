# Arquitectura

El proyecto sigue una arquitectura hexagonal en cuatro capas. Las dependencias apuntan siempre
hacia el dominio: el dominio no depende de nada y la capa MCP no sabe qué es `simctl`.

```
mcp/              Presentación: herramientas y servidor MCP
   |  llama a
application/      Casos de uso: servicios y DeviceResolver
   |  depende de
domain/           Modelo, errores y puertos (interfaces ...Gateway)
   ^  implementa
infrastructure/   Adaptadores: simctl, idb, SimulatorHost, CommandRunner
```

## Capas

| Capa | Responsabilidad | Piezas principales |
| --- | --- | --- |
| `src/domain/` | Modelo y contratos, sin dependencias externas. | `Device`, `Runtime`, `Point`, `SimulatorError`, `ports/*Gateway` |
| `src/application/` | Reglas de negocio y orquestación. | `DeviceCatalog`, `DeviceResolver`, `DeviceService`, `AppService`, `UiService`, `MediaService`, `EnvironmentService`, `LogService` |
| `src/infrastructure/` | Comunicación con el sistema. | `NodeCommandRunner`, `SimulatorHost`, `Simctl*Gateway`, `IdbUiAutomationGateway` |
| `src/mcp/` | Exponer los casos de uso como herramientas MCP. | `ToolDefinition`, `*Tools`, `presenters`, `SimulatorMcpServer` |
| `src/container.ts` | Único lugar que conecta las capas. | `createContainer()` |

## Estructura de carpetas

```
src/
├── domain/
│   ├── Device.ts, Runtime.ts, geometry.ts, ui.ts, media.ts, environment.ts, InstalledApp.ts
│   ├── errors.ts
│   └── ports/
├── application/
├── infrastructure/
│   ├── process/      CommandRunner (interfaz) y NodeCommandRunner
│   ├── host/         SimulatorHost
│   ├── simctl/       Gateways sobre xcrun simctl
│   └── idb/          Gateway de automatización de interfaz
├── mcp/
│   ├── ToolDefinition.ts, responses.ts, presenters.ts, schemas.ts
│   ├── SimulatorMcpServer.ts
│   └── tools/        Un ToolProvider por grupo de herramientas
├── config.ts
├── container.ts
└── index.ts
```

## Recorrido de una llamada

1. `SimulatorMcpServer` valida la entrada con el esquema zod de la herramienta.
2. El `ToolProvider` la traduce a una llamada al servicio de aplicación.
3. El servicio resuelve el dispositivo con `DeviceResolver` y aplica sus reglas.
4. El gateway ejecuta el comando a través de `SimulatorHost`.
5. Si algo falla, el `SimulatorError` vuelve al cliente como `[CÓDIGO] mensaje`.

## Decisiones de diseño

### Sin shell

Los comandos se lanzan como ejecutable más vector de argumentos y nunca pasan por un intérprete
de comandos. Ningún valor enviado por el modelo puede inyectar comandos.

### Un puerto por capacidad

Cada capacidad tiene su interfaz en `domain/ports/`: `DeviceGateway`, `AppGateway`,
`MediaGateway`, `UiAutomationGateway`, `EnvironmentGateway` y `LogGateway`. `idb` es un adaptador
más de `UiAutomationGateway` y puede sustituirse sin tocar la aplicación ni la capa MCP.

### Herramientas declarativas

Cada herramienta es un `ToolDefinition`: su contrato (nombre, descripción, esquema, anotaciones)
y una función `execute`. No depende del SDK de MCP. El servidor solo las registra y centraliza el
tratamiento de errores.

### Un único punto de salida al sistema

`SimulatorHost` es la única clase que ejecuta comandos de macOS. Garantiza que solo se intenten
en macOS y aplica un tiempo máximo por defecto para que una herramienta bloqueada no cuelgue el
servidor.

### Pasos de interfaz como datos

Cada interacción es un `UiStep`: un valor del dominio, no una llamada. `UiService` ejecuta uno o
muchos por el mismo camino, resolviendo el dispositivo una sola vez. Por eso tocar un elemento,
encadenar una secuencia o devolver la pantalla resultante comparten implementación, y por eso
`ui_sequence` no necesita una herramienta distinta por tipo de paso.

La búsqueda de elementos es lógica de dominio (`ElementQuery`): coincidencia exacta antes que
parcial, y contenedores anidados tratados como un único destino. No depende de `idb`.

### Caché que solo se cree para respuestas positivas

`DeviceCatalog` reutiliza la lista de simuladores durante unos segundos. `DeviceResolver` nunca
informa de un fallo a partir de datos en caché: antes vuelve a consultar. Las operaciones que
cambian el estado de un simulador invalidan la caché, incluso si fallan a medias.

### Presentación pensada para un modelo

Todo lo que devuelve una herramienta lo lee un modelo y cuesta tokens. Los formatos de
`mcp/presenters.ts` son compactos a propósito: una línea por elemento, sin puntuación de JSON y
sin campos sobre los que el cliente no pueda actuar.

### El tiempo es una dependencia

Las esperas y la caducidad usan un `Clock` inyectable. Los tests lo sustituyen por un reloj falso
y comprueban esperas de varios segundos de forma instantánea.

### Errores con solución

Cuando la causa de un fallo es conocida, el error la explica: `CommandFailedError` admite una
línea `Hint:`, los tracebacks de Python de `idb` se reducen a su mensaje, y las comprobaciones
previas (rutas, URL, apps instaladas, texto tecleable) sustituyen errores internos por errores de
dominio.

### Estado acotado

El estado del servidor se limita a las grabaciones en curso, encapsuladas en `MediaService` y
liberadas al cerrar, y a la caché de la lista de simuladores.

### Operaciones destructivas explícitas

`erase_device` exige indicar el dispositivo y que esté apagado. Nunca lo apaga por su cuenta.
