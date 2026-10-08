// Generates docs/referencia/herramientas.md from the tools the built server
// actually publishes, so the reference can never drift from the code.
// Run with `npm run docs:tools` (builds first).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { loadConfig } from '../dist/config.js';
import { createContainer } from '../dist/container.js';

/** Sections of the page, in order. Tools not listed here end up under "Otras". */
const GROUPS = [
  { title: 'Dispositivos', tools: ['list_devices', 'boot_device', 'shutdown_device', 'erase_device', 'open_simulator_app'] },
  { title: 'Apps', tools: ['install_app', 'uninstall_app', 'launch_app', 'terminate_app', 'list_apps', 'open_url', 'get_app_container'] },
  {
    title: 'Interfaz',
    note: 'Estas herramientas requieren [idb](../guia/instalacion#instalar-idb). Las coordenadas se expresan en [puntos](../guia/conceptos#puntos-no-pixeles).',
    tools: ['ui_describe_screen', 'ui_describe_point', 'ui_tap', 'ui_swipe', 'ui_type_text', 'ui_press_button', 'ui_press_key'],
  },
  { title: 'Multimedia', tools: ['screenshot', 'start_recording', 'stop_recording', 'add_media'] },
  { title: 'Entorno', tools: ['set_appearance', 'set_location', 'set_status_bar', 'set_permission', 'send_push_notification'] },
  { title: 'Logs', tools: ['get_logs'] },
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs', 'referencia', 'herramientas.md');

const tools = await listTools();
const remaining = new Map(tools.map((tool) => [tool.name, tool]));
const sections = GROUPS.map((group) => ({
  ...group,
  tools: group.tools.flatMap((name) => {
    const tool = remaining.get(name);
    remaining.delete(name);
    return tool ? [tool] : [];
  }),
}));
if (remaining.size > 0) {
  sections.push({ title: 'Otras', tools: [...remaining.values()] });
}

const page = [
  '<!-- Generado por scripts/generate-tool-docs.mjs. No editar a mano: ejecuta `npm run docs:tools`. -->',
  '',
  '# Herramientas',
  '',
  `El servidor publica ${tools.length} herramientas. Esta página se genera a partir del propio servidor,`,
  'así que siempre coincide con el código. Las descripciones están en inglés porque son exactamente',
  'las que recibe el modelo.',
  '',
  'Casi todas aceptan un parámetro opcional `device`; consulta',
  '[El parámetro device](../guia/conceptos#el-parametro-device).',
  '',
  ...sections.flatMap(renderSection),
].join('\n');

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, page);
console.log(`Wrote ${tools.length} tools to ${path.relative(root, output)}`);

/** Asks the real server, over an in-memory transport, which tools it exposes. */
async function listTools() {
  const container = createContainer(loadConfig({}));
  const client = new Client({ name: 'docs-generator', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await container.server.connect(serverTransport);
  await client.connect(clientTransport);
  const result = await client.listTools();
  await client.close();
  await container.dispose();
  return result.tools;
}

function renderSection(section) {
  return [
    `## ${section.title}`,
    '',
    ...(section.note ? [section.note, ''] : []),
    ...section.tools.flatMap(renderTool),
  ];
}

function renderTool(tool) {
  const required = new Set(tool.inputSchema.required ?? []);
  const parameters = Object.entries(tool.inputSchema.properties ?? {});
  const rows = parameters.map(
    ([name, schema]) =>
      `| \`${name}\` | ${code(describeType(schema))} | ${required.has(name) ? 'Sí' : 'No'} | ${cell(schema.description ?? '')} |`,
  );
  return [
    `### ${tool.name}`,
    '',
    `**${escapeText(tool.title ?? tool.name)}** · ${behaviour(tool.annotations ?? {})}`,
    '',
    escapeText(tool.description ?? ''),
    '',
    ...(rows.length > 0
      ? ['| Parámetro | Tipo | Obligatorio | Descripción |', '| --- | --- | --- | --- |', ...rows]
      : ['Sin parámetros.']),
    '',
  ];
}

function behaviour(annotations) {
  if (annotations.destructiveHint) return 'Destructiva';
  return annotations.readOnlyHint ? 'Lectura' : 'Modifica';
}

/** Short human readable type of a JSON Schema node. */
function describeType(schema) {
  if (schema.enum) {
    return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  }
  if (schema.type === 'array') {
    return `${describeType(schema.items ?? {})}[]`;
  }
  const range = [
    schema.minimum !== undefined ? `>= ${schema.minimum}` : '',
    schema.maximum !== undefined ? `<= ${schema.maximum}` : '',
  ].filter(Boolean);
  const base = schema.type ?? 'any';
  return range.length > 0 ? `${base} (${range.join(', ')})` : base;
}

/** Keeps Markdown and Vue from interpreting characters of free text. */
function escapeText(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('{{', '&#123;&#123;');
}

/** Free text placed inside a table cell. */
function cell(value) {
  return escapeText(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

/** Inline code placed inside a table cell. */
function code(value) {
  return `\`${value.replaceAll('|', '\\|')}\``;
}
