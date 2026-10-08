import { spawnSync } from 'node:child_process';
import { stat } from 'node:fs/promises';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';
import { createContainer, type Container } from '../../src/container.js';

/**
 * Drives a real simulator through the MCP server. Only runs on macOS.
 * The UI tests additionally need idb and are skipped when it is not installed.
 *
 * Nothing is faked here: these tests are what proves that the commands the
 * unit tests expect are commands the real tools accept.
 */
const isMac = process.platform === 'darwin';
const config = loadConfig();
const hasIdb = isMac && spawnSync(config.idbPath, ['--help'], { stdio: 'ignore' }).status === 0;

const SETTINGS = 'com.apple.Preferences';
const SAFARI = 'com.apple.mobilesafari';

interface Content {
  readonly type: string;
  readonly text?: string;
  readonly data?: string;
}

interface Outcome {
  readonly isError: boolean;
  readonly text: string;
  readonly content: Content[];
}

/** Width in pixels of a PNG, read from its IHDR chunk. */
function pngWidth(base64: string): number {
  return Buffer.from(base64, 'base64').readUInt32BE(16);
}

describe.skipIf(!isMac)('real simulator', () => {
  const client = new Client({ name: 'integration', version: '0.0.0' });
  let container: Container;
  let udid: string;

  async function call(name: string, args: Record<string, unknown> = {}): Promise<Outcome> {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 280_000 });
    const content = result.content as Content[];
    return {
      isError: result.isError === true,
      content,
      text: content.flatMap((item) => (item.type === 'text' ? [item.text ?? ''] : [])).join('\n'),
    };
  }

  /** Calls a tool on the test device and fails if it reports an error. */
  async function ok(name: string, args: Record<string, unknown> = {}): Promise<Outcome> {
    const outcome = await call(name, { device: udid, ...args });
    if (outcome.isError) {
      throw new Error(`${name} failed: ${outcome.text}`);
    }
    return outcome;
  }

  beforeAll(async () => {
    container = createContainer(config);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await container.server.connect(serverTransport);
    await client.connect(clientTransport);

    const listed = await call('list_devices', { platform: 'iOS' });
    const devices = JSON.parse(listed.text) as { udid: string; name: string }[];
    const iphone = devices.find((device) => device.name.startsWith('iPhone'));
    if (!iphone) {
      throw new Error('No iPhone simulator is available on this machine.');
    }
    udid = iphone.udid;
    console.log(`Using ${iphone.name} (${udid}); idb available: ${hasIdb}`);

    // The window is opened because idb reads accessibility through the Simulator app.
    const booted = await ok('boot_device');
    console.log(booted.text);
  });

  afterAll(async () => {
    if (udid) {
      await call('shutdown_device', { device: udid }).catch(() => undefined);
    }
    await client.close();
    await container?.dispose();
  });

  describe('devices', () => {
    it('reports the simulator as booted', async () => {
      const booted = JSON.parse((await call('list_devices', { bootedOnly: true })).text) as { udid: string }[];
      expect(booted.map((device) => device.udid)).toContain(udid);
    });

    it('treats booting a running simulator as a no-op', async () => {
      expect((await ok('boot_device', { showWindow: false })).text).toContain('already booted');
    });

    it('refuses to erase it while it runs', async () => {
      expect((await call('erase_device', { device: udid })).text).toMatch(/^\[DEVICE_NOT_SHUTDOWN\]/);
    });

    it('resolves the device by name and by omission', async () => {
      const booted = JSON.parse((await call('list_devices', { bootedOnly: true })).text) as { name: string }[];
      if (booted.length === 1) {
        expect((await call('set_appearance', { appearance: 'light' })).isError).toBe(false);
      }
      expect((await call('get_clipboard', { device: 'no such simulator' })).text).toMatch(/^\[DEVICE_NOT_FOUND\]/);
    });
  });

  describe('apps', () => {
    it('lists the installed system apps compactly', async () => {
      const { text } = await ok('list_apps', { type: 'System' });
      expect(text).toContain(SAFARI);
      expect(text).toContain('[system]');
      expect(text).not.toContain('/Library/Developer/');
    });

    it('launches and terminates an app', async () => {
      expect((await ok('launch_app', { bundleId: SETTINGS })).text).toMatch(/pid \d+/);
      await ok('terminate_app', { bundleId: SETTINGS });
    });

    it('does not pretend to uninstall an app that is not installed', async () => {
      const result = await call('uninstall_app', { bundleId: 'com.noexiste.app', device: udid });
      expect(result.text).toMatch(/^\[APP_NOT_INSTALLED\]/);
    });

    it('explains a launch of an app that is not installed', async () => {
      const result = await call('launch_app', { bundleId: 'com.noexiste.app', device: udid });
      expect(result.text).toMatch(/^\[APP_NOT_INSTALLED\]/);
    });

    it('reports a missing bundle before calling simctl', async () => {
      const result = await call('install_app', { appPath: '/definitely/not/here/Missing.app', device: udid });
      expect(result.text).toMatch(/^\[PATH_NOT_FOUND\]/);
    });

    it('opens a URL and rejects text that is not one', async () => {
      await ok('open_url', { url: 'https://example.com' });
      expect((await call('open_url', { url: 'esto no es una url', device: udid })).text).toMatch(/^\[INVALID_ARGUMENT\]/);
    });

    it('resolves an app container', async () => {
      expect((await ok('get_app_container', { bundleId: SAFARI, kind: 'app' })).text).toContain('.app');
    });
  });

  describe('media', () => {
    it('captures a screenshot reduced to points', async () => {
      const full = await ok('screenshot', { format: 'png', resolution: 'full' });
      const points = await ok('screenshot', { format: 'png' });
      const fullWidth = pngWidth(full.content.find((item) => item.type === 'image')?.data ?? '');
      const pointsWidth = pngWidth(points.content.find((item) => item.type === 'image')?.data ?? '');
      console.log(`Screenshot widths: full ${fullWidth}px, points ${pointsWidth}px`);

      expect(full.text).toMatch(/in pixels at [23]x/);
      expect(points.text).toContain('The image is in points');
      expect([2, 3]).toContain(Math.round(fullWidth / pointsWidth));
    });

    it('returns a JPEG by default', async () => {
      const shot = await ok('screenshot');
      const picture = Buffer.from(shot.content.find((item) => item.type === 'image')?.data ?? '', 'base64');
      expect(picture.subarray(0, 2).toString('hex')).toBe('ffd8');
    });

    it('records the screen to a playable file', async () => {
      await ok('start_recording');
      expect((await call('start_recording', { device: udid })).text).toMatch(/^\[RECORDING_ALREADY_ACTIVE\]/);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const stopped = await ok('stop_recording');
      const file = /saved to (.*\.mp4)\.$/.exec(stopped.text)?.[1] ?? '';
      expect((await stat(file)).size).toBeGreaterThan(0);
    });

    it('rejects media that does not exist', async () => {
      expect((await call('add_media', { paths: ['/nope/missing.png'], device: udid })).text).toMatch(/^\[PATH_NOT_FOUND\]/);
    });
  });

  describe('environment', () => {
    it('changes appearance, location, status bar and permissions', async () => {
      await ok('set_appearance', { appearance: 'dark' });
      await ok('set_location', { latitude: 40.4168, longitude: -3.7038 });
      await ok('set_location', { clear: true });
      await ok('set_status_bar', { time: '9:41', batteryLevel: 100, batteryState: 'charged' });
      await ok('set_status_bar', { clear: true });
      await ok('set_permission', { action: 'grant', service: 'photos', bundleId: SAFARI });
      await ok('set_appearance', { appearance: 'light' });
    });

    it('round-trips text the keyboard cannot type through the clipboard', async () => {
      const text = 'Añadir canción 🎵 "comillas" $HOME';
      await ok('set_clipboard', { text });
      expect((await ok('get_clipboard')).text).toBe(text);
    });

    it('reads logs', async () => {
      await ok('get_logs', { minutes: 1, maxLines: 20 });
    });
  });

  describe.skipIf(!hasIdb)('interface, through idb', () => {
    beforeAll(async () => {
      // idb reads accessibility through the Simulator window: make sure it is up.
      await ok('open_simulator_app');
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      await ok('launch_app', { bundleId: SETTINGS, terminateRunning: true });
      try {
        await ok('ui_wait_for_element', { label: 'General', timeoutSeconds: 60 });
      } catch (error) {
        // Leave evidence of what the screen looked like for the CI artifact.
        await call('screenshot', { device: udid, format: 'png', outputPath: 'artifacts/ui-setup-failure.png' });
        throw error;
      }
    });

    it('describes the screen compactly', async () => {
      const { text } = await ok('ui_describe_screen');
      console.log(text.split('\n').slice(0, 12).join('\n'));
      expect(text).toMatch(/^Screen of .*: \d+ element\(s\)\./);
      expect(text).toMatch(/"General".* @\(\d+,\d+\) \d+x\d+/);
    });

    it('taps an element by its text and returns the new screen', async () => {
      const { text } = await ok('ui_tap_element', { label: 'General', describeAfter: true });
      console.log(text.split('\n').slice(0, 10).join('\n'));
      expect(text).toContain('tap_element label "general" ->');
      expect(text).toContain('Screen now');
      expect(text).toContain('"About"');
    });

    it('runs a sequence of steps in one call', async () => {
      const { text } = await ok('ui_sequence', {
        steps: [
          { action: 'tap_element', label: 'About', timeoutSeconds: 10 },
          { action: 'wait', seconds: 1 },
          { action: 'swipe', fromX: 200, fromY: 500, toX: 200, toY: 300, durationSeconds: 0.3 },
          { action: 'press_button', button: 'HOME' },
        ],
      });
      expect(text).toContain('Ran 4 of 4 step(s)');
    });

    it('reports a missing element with what is on screen', async () => {
      const result = await call('ui_tap_element', {
        label: 'this label does not exist anywhere',
        timeoutSeconds: 1,
        device: udid,
      });
      expect(result.text).toMatch(/^\[ELEMENT_NOT_FOUND\]/);
      expect(result.text).toContain('Elements on screen:');
    });

    it('taps coordinates and describes a point', async () => {
      await ok('ui_tap', { x: 200, y: 400 });
      await ok('ui_describe_point', { x: 200, y: 400 });
      await ok('ui_press_button', { button: 'HOME' });
    });

    it('refuses untypeable text with a workaround instead of a traceback', async () => {
      const result = await call('ui_type_text', { text: 'España', device: udid });
      expect(result.text).toMatch(/^\[UNSUPPORTED_TEXT\]/);
      expect(result.text).not.toContain('Traceback');
    });
  });
});
