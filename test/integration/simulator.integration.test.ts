import { spawnSync } from 'node:child_process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';
import { createContainer, type Container } from '../../src/container.js';

/**
 * Drives a real simulator through the MCP server. Only runs on macOS.
 * The UI tests additionally need idb and are skipped when it is not installed.
 */
const isMac = process.platform === 'darwin';
const config = loadConfig();
const hasIdb = isMac && spawnSync(config.idbPath, ['--help'], { stdio: 'ignore' }).status === 0;

interface Content {
  readonly type: string;
  readonly text?: string;
  readonly data?: string;
}

describe.skipIf(!isMac)('real simulator', () => {
  const client = new Client({ name: 'integration', version: '0.0.0' });
  let container: Container;
  let udid: string;

  async function call(name: string, args: Record<string, unknown> = {}): Promise<Content[]> {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 280_000 });
    const content = result.content as Content[];
    if (result.isError) {
      throw new Error(`${name} failed: ${content.map((item) => item.text).join('\n')}`);
    }
    return content;
  }

  const textOf = (content: Content[]): string => content.map((item) => item.text ?? '').join('\n');

  beforeAll(async () => {
    container = createContainer(config);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await container.server.connect(serverTransport);
    await client.connect(clientTransport);

    const devices = JSON.parse(textOf(await call('list_devices', { platform: 'iOS' }))) as {
      udid: string;
      name: string;
    }[];
    const iphone = devices.find((device) => device.name.startsWith('iPhone'));
    if (!iphone) {
      throw new Error('No iPhone simulator is available on this machine.');
    }
    udid = iphone.udid;
    console.log(`Using ${iphone.name} (${udid}); idb available: ${hasIdb}`);
    await call('boot_device', { device: udid, showWindow: false });
  });

  afterAll(async () => {
    if (udid) {
      await call('shutdown_device', { device: udid }).catch(() => undefined);
    }
    await client.close();
    await container?.dispose();
  });

  it('reports the simulator as booted', async () => {
    const booted = JSON.parse(textOf(await call('list_devices', { bootedOnly: true }))) as { udid: string }[];
    expect(booted.map((device) => device.udid)).toContain(udid);
  });

  it('lists the installed system apps', async () => {
    const { apps } = JSON.parse(textOf(await call('list_apps', { type: 'System', device: udid }))) as {
      apps: { bundleId: string }[];
    };
    expect(apps.map((app) => app.bundleId)).toContain('com.apple.mobilesafari');
  });

  it('launches and terminates an app', async () => {
    const launched = textOf(await call('launch_app', { bundleId: 'com.apple.Preferences', device: udid }));
    expect(launched).toMatch(/pid \d+/);
    await call('terminate_app', { bundleId: 'com.apple.Preferences', device: udid });
  });

  it('captures a screenshot', async () => {
    const content = await call('screenshot', { format: 'png', device: udid });
    const picture = Buffer.from(content.find((item) => item.type === 'image')?.data ?? '', 'base64');
    expect(picture.subarray(1, 4).toString()).toBe('PNG');
  });

  it('changes the environment', async () => {
    await call('set_appearance', { appearance: 'dark', device: udid });
    await call('set_location', { latitude: 40.4168, longitude: -3.7038, device: udid });
    await call('set_location', { clear: true, device: udid });
    await call('set_status_bar', { time: '9:41', batteryLevel: 100, batteryState: 'charged', device: udid });
    await call('set_status_bar', { clear: true, device: udid });
    await call('set_permission', { action: 'grant', service: 'photos', bundleId: 'com.apple.mobilesafari', device: udid });
  });

  it('opens a URL and resolves an app container', async () => {
    await call('open_url', { url: 'https://example.com', device: udid });
    const container = textOf(await call('get_app_container', { bundleId: 'com.apple.mobilesafari', kind: 'app', device: udid }));
    expect(container).toContain('.app');
  });

  it('records the screen', async () => {
    await call('start_recording', { device: udid });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(textOf(await call('stop_recording', { device: udid }))).toContain('.mp4');
  });

  it('reads logs', async () => {
    await call('get_logs', { minutes: 1, maxLines: 20, device: udid });
  });

  it.skipIf(!hasIdb)('inspects and drives the UI through idb', async () => {
    // idb reads accessibility through the Simulator app, so its window must exist.
    await call('open_simulator_app', { device: udid });
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    await call('ui_press_button', { button: 'HOME', device: udid });
    const { elements } = JSON.parse(textOf(await call('ui_describe_screen', { device: udid }))) as {
      elements: { tapPoint: { x: number; y: number } }[];
    };
    expect(elements.length).toBeGreaterThan(0);
    const [first] = elements;
    await call('ui_tap', { ...first?.tapPoint, device: udid });
    await call('ui_swipe', { fromX: 200, fromY: 600, toX: 200, toY: 300, device: udid });
  });
});
