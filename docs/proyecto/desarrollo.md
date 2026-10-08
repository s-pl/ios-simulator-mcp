# Desarrollo

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run build` | Compila a `dist/`. |
| `npm run typecheck` | Comprueba los tipos de `src/` y `test/`. |
| `npm test` | Tests unitarios y de extremo a extremo en memoria. No necesitan un Mac. |
| `npm run test:integration` | Tests contra un simulador real. Solo macOS; arrancan un dispositivo. |
| `npm run docs:dev` | Sirve esta documentación en local. |
| `npm run docs:build` | Genera el sitio estático. |
| `npm run docs:tools` | Regenera la referencia de herramientas a partir del servidor. |

## Tests

Hay dos niveles:

- **`npm test`.** Sustituye la ejecución de comandos por un `FakeCommandRunner` y conecta un
  cliente MCP real al servidor completo mediante un transporte en memoria. Comprueba los comandos
  exactos que se emitirían, la resolución de dispositivos, el análisis de la salida de `simctl` e
  `idb` y la presentación de errores. Se ejecuta en cualquier sistema.
- **`npm run test:integration`.** Arranca un simulador de verdad y ejecuta las herramientas contra
  él. Las pruebas de interfaz se omiten si `idb` no está instalado.

La integración continua ejecuta el primer nivel en Ubuntu y macOS con Node 20 y 22, y el segundo
en un runner de macOS.

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

4. Añade un test en `test/mcp/server.e2e.test.ts` que compruebe el comando emitido.
5. Ejecuta `npm run docs:tools` para regenerar la referencia.

## Documentación

El sitio está hecho con [VitePress](https://vitepress.dev). El contenido son los archivos Markdown
de `docs/` y la configuración está en `docs/.vitepress/config.ts`. Cada cambio en `main` lo
publica en GitHub Pages el flujo de trabajo `.github/workflows/docs.yml`.

La página [Herramientas](../referencia/herramientas) se genera con
`scripts/generate-tool-docs.mjs` y no debe editarse a mano.
