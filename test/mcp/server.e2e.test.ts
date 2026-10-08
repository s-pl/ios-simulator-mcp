import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';
import { createContainer, type Container } from '../../src/container.js';
import { deviceListJson, FakeCommandRunner, UDID } from '../support/FakeCommandRunner.js';

interface ToolContent {
  readonly type: string;
  readonly text?: string;
  readonly data?: string;
  readonly mimeType?: string;
}

interface ToolOutcome {
  readonly isError: boolean;
  readonly content: ToolContent[];
  readonly text: string;
}

/** A real MCP client talking to the full application over an in-memory transport. */
class Harness {
  readonly runner = new FakeCommandRunner().on('xcrun simctl list devices', deviceListJson());
  private readonly client = new Client({ name: 'test-client', version: '0.0.0' });
  private container: Container | undefined;

  async start(platform: NodeJS.Platform = 'darwin'): Promise<this> {
    const config = { ...loadConfig({}), outputDirectory: path.join(os.tmpdir(), 'ios-simulator-mcp-test') };
    this.container = createContainer(config, { runner: this.runner, platform });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await this.container.server.connect(serverTransport);
    await this.client.connect(clientTransport);
    return this;
  }

  async toolNames(): Promise<string[]> {
    return (await this.client.listTools()).tools.map((tool) => tool.name);
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolOutcome> {
    const result = await this.client.callTool({ name, arguments: args });
    const content = result.content as ToolContent[];
    return {
      isError: result.isError === true,
      content,
      text: content.map((item) => item.text ?? '').join('\n'),
    };
  }

  async stop(): Promise<void> {
    await this.client.close();
    await this.container?.dispose();
  }
}

describe('MCP server', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.stop();
  });

  it('publishes every tool with a description and an input schema', async () => {
    harness = await new Harness().start();
    const names = await harness.toolNames();
    expect(names).toEqual(
      expect.arrayContaining([
        'list_devices', 'boot_device', 'shutdown_device', 'erase_device', 'open_simulator_app',
        'install_app', 'uninstall_app', 'launch_app', 'terminate_app', 'list_apps', 'open_url',
        'get_app_container', 'ui_describe_screen', 'ui_describe_point', 'ui_tap', 'ui_swipe',
        'ui_type_text', 'ui_press_button', 'ui_press_key', 'screenshot', 'start_recording',
        'stop_recording', 'add_media', 'set_appearance', 'set_location', 'set_status_bar',
        'set_permission', 'send_push_notification', 'get_logs',
      ]),
    );
    expect(names).toHaveLength(29);
  });

  it('lists available simulators, booted first', async () => {
    harness = await new Harness().start();
    const result = await harness.call('list_devices');
    const devices = JSON.parse(result.text) as { name: string; state: string }[];
    expect(devices).toHaveLength(3);
    expect(devices[0]).toMatchObject({ name: 'iPhone 15', state: 'Booted', runtime: 'iOS 17.5' });
  });

  it('boots a shut down simulator, waits for it and shows its window', async () => {
    harness = await new Harness().start();
    const result = await harness.call('boot_device', { device: 'iPad Air' });
    expect(result.text).toContain('Booted iPad Air');
    expect(harness.runner.commandLines).toEqual([
      'xcrun simctl list devices --json',
      `xcrun simctl boot ${UDID.ipad}`,
      `xcrun simctl bootstatus ${UDID.ipad} -b`,
      `open -a Simulator --args -CurrentDeviceUDID ${UDID.ipad}`,
    ]);
  });

  it('does not boot a simulator that is already running', async () => {
    harness = await new Harness().start();
    const result = await harness.call('boot_device', { device: UDID.iphone15, showWindow: false });
    expect(result.text).toContain('already booted');
    expect(harness.runner.commandLines).toEqual(['xcrun simctl list devices --json']);
  });

  it('refuses to erase a running simulator', async () => {
    harness = await new Harness().start();
    const result = await harness.call('erase_device', { device: UDID.iphone15 });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('[DEVICE_NOT_SHUTDOWN]');
    expect(harness.runner.commandLines).not.toContain(`xcrun simctl erase ${UDID.iphone15}`);
  });

  it('launches an app on the booted simulator and reports its pid', async () => {
    harness = await new Harness().start();
    harness.runner.on('xcrun simctl launch', 'com.example.app: 777\n');
    const result = await harness.call('launch_app', {
      bundleId: 'com.example.app',
      terminateRunning: true,
      arguments: ['-uiTesting', 'YES'],
    });
    expect(result.text).toContain('pid 777');
    expect(harness.runner.commandLines).toContain(
      `xcrun simctl launch --terminate-running-process ${UDID.iphone15} com.example.app -uiTesting YES`,
    );
  });

  it('lists installed apps through plutil, filtered by type', async () => {
    harness = await new Harness().start();
    harness.runner.on('xcrun simctl listapps', '{ plist }').on('plutil', (_args, options) => {
      expect(options.stdin).toBe('{ plist }');
      return JSON.stringify({
        'com.example.app': { CFBundleDisplayName: 'Example', ApplicationType: 'User' },
        'com.apple.mobilesafari': { CFBundleDisplayName: 'Safari', ApplicationType: 'System' },
      });
    });
    const result = await harness.call('list_apps', { type: 'User' });
    const { apps } = JSON.parse(result.text) as { apps: { bundleId: string }[] };
    expect(apps.map((app) => app.bundleId)).toEqual(['com.example.app']);
  });

  it('taps through idb using whole points', async () => {
    harness = await new Harness().start();
    const result = await harness.call('ui_tap', { x: 100.4, y: 200.6, durationSeconds: 1 });
    expect(result.isError).toBe(false);
    expect(harness.runner.commandLines).toContain(`idb ui tap --udid ${UDID.iphone15} --duration 1 100 201`);
  });

  it('describes the screen with tap points and hides unlabeled elements', async () => {
    harness = await new Harness().start();
    harness.runner.on(
      'idb ui describe-all',
      JSON.stringify([
        { type: 'Application', frame: { x: 0, y: 0, width: 390, height: 844 } },
        { type: 'Button', AXLabel: 'Sign in', frame: { x: 20, y: 700, width: 350, height: 50 } },
      ]),
    );
    const result = await harness.call('ui_describe_screen');
    const { elements } = JSON.parse(result.text) as { elements: Record<string, unknown>[] };
    expect(elements).toEqual([
      {
        type: 'Button',
        label: 'Sign in',
        frame: { x: 20, y: 700, width: 350, height: 50 },
        tapPoint: { x: 195, y: 725 },
      },
    ]);
  });

  it('returns a screenshot as an image', async () => {
    harness = await new Harness().start();
    harness.runner.on('xcrun simctl io', async (args) => {
      await writeFile(args.at(-1) ?? '', Buffer.from('fake-image-bytes'));
      return '';
    });
    const result = await harness.call('screenshot', { format: 'png' });
    const picture = result.content.find((item) => item.type === 'image');
    expect(picture?.mimeType).toBe('image/png');
    expect(Buffer.from(picture?.data ?? '', 'base64').toString()).toBe('fake-image-bytes');
  });

  it('records the screen until stopped, one recording per device', async () => {
    harness = await new Harness().start();
    const started = await harness.call('start_recording', { codec: 'hevc' });
    expect(started.text).toMatch(/recording-iPhone_15-.*\.mp4/);
    expect(harness.runner.commandLines.at(-1)).toMatch(
      new RegExp(`^xcrun simctl io ${UDID.iphone15} recordVideo --codec=hevc --force .*\\.mp4$`),
    );

    const duplicate = await harness.call('start_recording');
    expect(duplicate.text).toContain('[RECORDING_ALREADY_ACTIVE]');

    const stopped = await harness.call('stop_recording');
    expect(stopped.text).toContain('saved to');
    expect(harness.runner.background[0]?.hasExited).toBe(true);

    const again = await harness.call('stop_recording');
    expect(again.text).toContain('[NO_ACTIVE_RECORDING]');
  });

  it('sends a push payload through standard input', async () => {
    harness = await new Harness().start();
    const payload = { aps: { alert: 'Hello' }, custom: 1 };
    await harness.call('send_push_notification', { bundleId: 'com.example.app', payload });
    const push = harness.runner.calls.find((call) => call.commandLine.includes('simctl push'));
    expect(push?.commandLine).toBe(`xcrun simctl push ${UDID.iphone15} com.example.app -`);
    expect(JSON.parse(push?.stdin ?? '')).toEqual(payload);
  });

  it('requires a bundle id to grant a permission', async () => {
    harness = await new Harness().start();
    const result = await harness.call('set_permission', { action: 'grant', service: 'photos' });
    expect(result.text).toContain('[INVALID_ARGUMENT]');
  });

  it('builds a log predicate from the filters and keeps the most recent lines', async () => {
    harness = await new Harness().start();
    harness.runner.on('xcrun simctl spawn', 'Timestamp Ty Process\none\ntwo\nthree\n');
    const result = await harness.call('get_logs', { processName: 'MyApp', messageContains: 'err"or', maxLines: 2 });
    expect(result.text).toBe('(1 older line(s) omitted)\ntwo\nthree');
    const log = harness.runner.calls.find((call) => call.commandLine.includes('simctl spawn'));
    expect(log?.args.at(-1)).toBe('process == "MyApp" AND eventMessage CONTAINS[c] "err\\"or"');
  });

  it('rejects input that does not match the schema', async () => {
    harness = await new Harness().start();
    const result = await harness.call('set_appearance', { appearance: 'sepia' });
    expect(result.isError).toBe(true);
  });

  it('explains that macOS is required on other platforms', async () => {
    harness = await new Harness().start('win32');
    const result = await harness.call('list_devices');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('[UNSUPPORTED_PLATFORM]');
    expect(harness.runner.calls).toHaveLength(0);
  });
});
