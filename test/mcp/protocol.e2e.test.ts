import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';
import { SimulatorMcpServer } from '../../src/mcp/SimulatorMcpServer.js';
import { text } from '../../src/mcp/responses.js';
import { defineTool, Hints } from '../../src/mcp/ToolDefinition.js';
import { Harness } from '../support/Harness.js';

const EXPECTED_TOOLS = [
  'list_devices', 'boot_device', 'shutdown_device', 'erase_device', 'open_simulator_app',
  'install_app', 'uninstall_app', 'launch_app', 'terminate_app', 'list_apps', 'open_url', 'get_app_container',
  'ui_describe_screen', 'ui_describe_point', 'ui_tap_element', 'ui_wait_for_element', 'ui_tap', 'ui_swipe',
  'ui_type_text', 'ui_press_button', 'ui_press_key', 'ui_sequence',
  'screenshot', 'start_recording', 'stop_recording', 'add_media',
  'set_appearance', 'set_location', 'set_status_bar', 'set_permission', 'send_push_notification',
  'set_clipboard', 'get_clipboard',
  'get_logs',
];

describe('MCP protocol surface', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.stop();
  });

  it('publishes exactly the documented tools', async () => {
    harness = await Harness.start();
    const names = (await harness.tools()).map((tool) => tool.name);
    expect([...names].sort()).toEqual([...EXPECTED_TOOLS].sort());
  });

  it('documents every tool and every parameter', async () => {
    harness = await Harness.start();
    for (const tool of await harness.tools()) {
      expect(tool.name, 'tool names are snake_case').toMatch(/^[a-z][a-z_]*[a-z]$/);
      expect(tool.title, `${tool.name} title`).toBeTruthy();
      expect(tool.description?.length ?? 0, `${tool.name} description`).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe('object');
      for (const [name, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        const description = (schema as { description?: string }).description;
        const selfExplanatory = Boolean((schema as { enum?: unknown[] }).enum);
        expect(description || selfExplanatory, `${tool.name}.${name} is documented`).toBeTruthy();
      }
    }
  });

  it('declares how each tool affects the simulator', async () => {
    harness = await Harness.start();
    const tools = await harness.tools();
    const hint = (name: string) => tools.find((tool) => tool.name === name)?.annotations;

    for (const tool of tools) {
      expect(typeof tool.annotations?.readOnlyHint, `${tool.name} declares readOnlyHint`).toBe('boolean');
      expect(tool.annotations?.openWorldHint, `${tool.name} only touches the local simulator`).toBe(false);
    }
    for (const name of ['list_devices', 'list_apps', 'ui_describe_screen', 'screenshot', 'get_logs', 'get_clipboard']) {
      expect(hint(name)?.readOnlyHint, `${name} is read-only`).toBe(true);
    }
    for (const name of ['erase_device', 'uninstall_app']) {
      expect(hint(name), `${name} is destructive`).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    }
    for (const name of ['ui_tap', 'launch_app', 'set_location', 'ui_sequence']) {
      expect(hint(name), `${name} is a plain mutation`).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    }
  });

  it('marks only the genuinely mandatory parameters as required', async () => {
    harness = await Harness.start();
    const required = Object.fromEntries(
      (await harness.tools()).map((tool) => [tool.name, tool.inputSchema.required ?? []]),
    );
    expect(required['list_devices']).toEqual([]);
    expect(required['boot_device']).toEqual(['device']);
    expect(required['erase_device']).toEqual(['device']);
    expect(required['launch_app']).toEqual(['bundleId']);
    expect(required['ui_tap']).toEqual(['x', 'y']);
    expect(required['ui_tap_element']).toEqual([]);
    expect(required['ui_sequence']).toEqual(['steps']);
    expect(required['screenshot']).toEqual([]);
  });

  it('tells the model how to work efficiently', async () => {
    harness = await Harness.start();
    const instructions = harness.instructions ?? '';
    for (const hint of ['ui_tap_element', 'describeAfter', 'ui_sequence', 'black', 'set_clipboard', 'points']) {
      expect(instructions, `instructions mention ${hint}`).toContain(hint);
    }
  });

  it('identifies itself with the package version', async () => {
    const config = loadConfig({});
    expect(config.name).toBe('ios-simulator');
    expect(config.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  describe('input validation', () => {
    it.each([
      ['set_appearance', { appearance: 'sepia' }],
      ['ui_tap', { x: -1, y: 10 }],
      ['ui_tap', { x: 'ten', y: 10 }],
      ['ui_tap', { x: 10 }],
      ['launch_app', {}],
      ['launch_app', { bundleId: '' }],
      ['ui_press_key', { keyCode: 1.5 }],
      ['ui_press_key', { keyCode: 999 }],
      ['ui_press_button', { button: 'VOLUME_UP' }],
      ['set_location', { latitude: 200, longitude: 0 }],
      ['set_status_bar', { batteryLevel: 150 }],
      ['get_logs', { minutes: 0 }],
      ['get_logs', { maxLines: 100000 }],
      ['add_media', { paths: [] }],
      ['ui_sequence', { steps: [] }],
      ['ui_sequence', { steps: [{ action: 'explode' }] }],
      ['ui_sequence', { steps: [{ action: 'tap', x: 1 }] }],
      ['ui_tap_element', { label: 'OK', index: -1 }],
      ['screenshot', { resolution: 'huge' }],
      ['send_push_notification', { bundleId: 'com.example.app', payload: { alert: 'no aps' } }],
    ])('rejects %s with %j without running any command', async (name, args) => {
      harness = await Harness.start();
      const result = await harness.call(name, args as Record<string, unknown>);
      expect(result.isError).toBe(true);
      expect(harness.runner.calls).toEqual([]);
    });
  });

  describe('error presentation', () => {
    it('explains that macOS is required on other platforms', async () => {
      harness = await Harness.start({ platform: 'win32' });
      for (const [name, args] of [
        ['list_devices', {}],
        ['screenshot', {}],
        ['ui_tap', { x: 1, y: 1 }],
        ['open_simulator_app', {}],
      ] as const) {
        const result = await harness.call(name, args);
        expect(result.isError).toBe(true);
        expect(result.text).toMatch(/^\[UNSUPPORTED_PLATFORM\]/);
      }
      expect(harness.runner.calls).toEqual([]);
    });

    it('prefixes domain errors with their code', async () => {
      harness = await Harness.start();
      const result = await harness.call('launch_app', { bundleId: 'com.example.app', device: 'Pixel 9' });
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/^\[DEVICE_NOT_FOUND\] No available simulator matches "Pixel 9"/);
    });

    it('includes the failing command and its output', async () => {
      harness = await Harness.start();
      harness.runner.fail('xcrun simctl ui', 'Operation not supported on this runtime');
      const result = await harness.call('set_appearance', { appearance: 'dark' });
      expect(result.text).toContain('[COMMAND_FAILED]');
      expect(result.text).toContain('xcrun simctl ui');
      expect(result.text).toContain('Operation not supported on this runtime');
    });

    it('keeps serving after a failed call', async () => {
      harness = await Harness.start();
      await harness.call('launch_app', { bundleId: 'x', device: 'nope' });
      expect((await harness.ok('list_devices')).text).toContain('iPhone 15');
    });
  });
});

describe('SimulatorMcpServer', () => {
  const tool = (name: string) =>
    defineTool({
      name,
      title: name,
      description: 'A test tool.',
      inputSchema: {},
      annotations: Hints.readOnly,
      execute: async () => text('ok'),
    });

  it('refuses two tools with the same name', () => {
    expect(
      () => new SimulatorMcpServer({ name: 'test', version: '0.0.0' }, [{ tools: () => [tool('a'), tool('a')] }]),
    ).toThrow('Duplicate tool name: a');
  });

  it('exposes the names of its tools', () => {
    const server = new SimulatorMcpServer({ name: 'test', version: '0.0.0' }, [
      { tools: () => [tool('a')] },
      { tools: () => [tool('b')] },
    ]);
    expect(server.toolNames).toEqual(['a', 'b']);
  });
});
