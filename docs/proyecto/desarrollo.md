# Desarrollo

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run build` | Compila a `dist/`. |
| `npm run typecheck` | Comprueba los tipos de `src/` y `test/`. |
| `npm run lint` | Ejecuta ESLint con reglas que usan la información de tipos. |
| `npm run format` | Formatea el código con Prettier. `format:check` solo comprueba. |
| `npm test` | Compila y ejecuta los tests unitarios y de extremo a extremo. No necesitan un Mac. |
| `npm run test:watch` | Ejecuta los tests en modo observación mientras desarrollas. |
| `npm run test:integration` | Tests contra un simulador real. Solo macOS; arrancan un dispositivo. |
| `npm run docs:dev` | Sirve esta documentación en local. |
| `npm run docs:build` | Genera el sitio estático. |
| `npm run docs:tools` | Regenera la referencia de herramientas a partir del servidor, en ambos idiomas. |

## Tests

`npm test` ejecuta cinco grupos de tests, que no necesitan un Mac:

| Carpeta | Qué prueba | Qué se sustituye |
| --- | --- | --- |
| `test/domain/` | Modelo, búsqueda de elementos, errores. | Nada: es código puro. |
| `test/application/` | Reglas de cada servicio: caché, esperas, validaciones, secuencias, pegado, desplazamiento. | Los puertos, por implementaciones en memoria. |
| `test/infrastructure/` | Comandos que construye cada gateway y análisis de su salida. | La ejecución de comandos. |
| `test/mcp/` | El servidor completo a través de un cliente MCP real, en memoria. | La ejecución de comandos y el reloj. |
| `test/process/` | El binario compilado, arrancado como proceso y manejado por stdio. | Nada. |

`npm run test:integration` añade otro nivel: arranca un simulador de verdad y ejecuta las
herramientas contra él. Es lo que demuestra que los comandos que esperan los demás tests son
comandos que las herramientas reales aceptan. Tiene dos conjuntos:

- `simulator.integration.test.ts` usa las apps que trae iOS.
- `fixture.integration.test.ts` instala una pequeña app SwiftUI de `test/fixtures/app/`,
  compilada con `swiftc` sin proyecto de Xcode, y comprueba lo que muestra tras escribir, pegar,
  desplazarse, abrir un enlace o recibir una push. También registra tiempos y tamaños de
  respuesta. Necesita la variable `FIXTURE_APP`:

```bash
FIXTURE_APP="$(bash test/fixtures/app/build.sh | tail -n 1)" npm run test:integration
```

Las pruebas de interfaz se omiten si `idb` no está instalado.

La integración continua ejecuta el linter, `npm test` en Ubuntu y macOS con Node 20 y 22, y los
tests de integración en un runner de macOS con `idb` instalado.

Utilidades de test en `test/support/`:

- `Harness`: cliente MCP conectado al servidor completo, con comandos y reloj falsos.
- `FakeCommandRunner`: registra los comandos y responde con salidas preparadas o con fallos.
- `FakeClock`: reloj que solo avanza cuando el código duerme.
- `fakes.ts`: implementaciones en memoria de cada puerto del dominio.

## Añadir una herramienta

1. Si hace falta una capacidad nueva, añádela al puerto correspondiente en `src/domain/ports/` e
   impleméntala en su gateway de `src/infrastructure/`.
2. Expón el caso de uso en el servicio de `src/application/`.
3. Declara la herramienta en el `ToolProvider` de `src/mcp/tools/`:

```ts
defineTool({
  name: 'set_appearance',
  title: 'Set light or dark mode',
  description: 'Switches the simulator between light and dark appearance.',
  inputSchema: {
    appearance: z.enum(APPEARANCES).describe('Appearance to apply.'),
    device: deviceParam,
  },
  annotations: { ...Hints.mutating, idempotentHint: true },
  execute: async ({ appearance, device }) => {
    const target = await this.environment.setAppearance(appearance, device);
    return text(`${target.label} now uses the ${appearance} appearance.`);
  },
}),
```

4. Añade tests: la regla en `test/application/`, el comando en `test/infrastructure/` y el
   comportamiento visible en `test/mcp/`. Incluye el nombre en la lista de `protocol.e2e.test.ts`.
5. Ejecuta `npm run docs:tools` para regenerar la referencia.

## Documentación

El sitio está hecho con [VitePress](https://vitepress.dev). El contenido son los archivos Markdown
de `docs/` (español en la raíz, inglés en `docs/en/`) y la configuración está en
`docs/.vitepress/config.ts`. Cada cambio en `main` lo
publica en GitHub Pages el flujo de trabajo `.github/workflows/docs.yml`.

La página [Herramientas](../referencia/herramientas) se genera con
`scripts/generate-tool-docs.mjs` y no debe editarse a mano.

## Publicar una versión

1. Actualiza la versión en `package.json` y añade una entrada a `CHANGELOG.md`.
2. Etiqueta el commit (`git tag v1.2.0 && git push --tags`) y crea una release en GitHub.
3. Al publicar la release se ejecuta `.github/workflows/publish.yml`, que publica el paquete en
   npm si el secreto `NPM_TOKEN` está configurado.
