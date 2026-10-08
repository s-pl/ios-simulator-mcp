import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { deviceListJson, UDID } from '../support/FakeCommandRunner.js';
import { Harness } from '../support/Harness.js';

const LIST = 'xcrun simctl list devices --json';

let harness: Harness;
let workspace: string;
let appBundle: string;

beforeAll(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'ios-simulator-mcp-e2e-'));
  appBundle = path.join(workspace, 'Example.app');
  await writeFile(appBundle, 'bundle');
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

afterEach(async () => {
  await harness.stop();
});

describe('device tools', () => {
  it('lists available simulators, booted first', async () => {
    harness = await Harness.start();
    const devices = JSON.parse((await harness.ok('list_devices')).text) as Record<string, unknown>[];
    expect(devices).toHaveLength(3);
    expect(devices[0]).toEqual({
      udid: UDID.iphone15,
      name: 'iPhone 15',
      state: 'Booted',
      runtime: 'iOS 17.5',
      isAvailable: true,
    });
  });

  it('filters the list', async () => {
    harness = await Harness.start();
    expect(JSON.parse((await harness.ok('list_devices', { bootedOnly: true })).text)).toHaveLength(1);
    expect(JSON.parse((await harness.ok('list_devices', { platform: 'tvOS' })).text)).toEqual([]);
  });

  it('boots a shut down simulator, waits for it and shows its window', async () => {
    harness = await Harness.start();
    const result = await harness.ok('boot_device', { device: 'iPad Air' });
    expect(result.text).toBe(`Booted iPad Air (iOS 17.5, ${UDID.ipad}).`);
    expect(harness.runner.commandLines).toEqual([
      LIST,
      `xcrun simctl boot ${UDID.ipad}`,
      `xcrun simctl bootstatus ${UDID.ipad} -b`,
      `open -a Simulator --args -CurrentDeviceUDID ${UDID.ipad}`,
    ]);
  });

  it('does not boot a simulator that is already running', async () => {
    harness = await Harness.start();
    const result = await harness.ok('boot_device', { device: UDID.iphone15, showWindow: false });
    expect(result.text).toContain('already booted');
    expect(harness.runner.commandLines).toEqual([LIST]);
  });

  it('reports a boot as successful, with a warning, when only the window fails to open', async () => {
    harness = await Harness.start();
    harness.runner.fail('open -a Simulator', 'Unable to find application named Simulator');
    const result = await harness.call('boot_device', { device: 'iPad Air' });
    expect(result.isError).toBe(false);
    expect(result.text).toMatch(/^Booted iPad Air .*\nWarning: The Simulator window could not be opened/);
    expect(result.text).toContain('open_simulator_app');
  });

  it('fails when the boot itself fails', async () => {
    harness = await Harness.start();
    harness.runner.fail('xcrun simctl boot', 'Unable to boot device in current state');
    const result = await harness.call('boot_device', { device: 'iPad Air' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Unable to boot device in current state');
    expect(harness.runner.matching('open')).toEqual([]);
  });

  it('refreshes its view of the simulators after booting one', async () => {
    harness = await Harness.start();
    await harness.ok('boot_device', { device: 'iPad Air', showWindow: false });
    harness.runner.on(LIST, deviceListJson([UDID.ipad]));
    const result = await harness.ok('set_appearance', { appearance: 'dark' });
    expect(result.text).toContain('iPad Air');
  });

  it('shuts down the booted simulator, a named one, or all of them', async () => {
    harness = await Harness.start();
    expect((await harness.ok('shutdown_device')).text).toContain('Shut down iPhone 15');
    await harness.ok('shutdown_device', { device: 'iPad Air' });
    await harness.ok('shutdown_device', { all: true });
    expect(harness.runner.matching('xcrun simctl shutdown')).toEqual([
      `xcrun simctl shutdown ${UDID.iphone15}`,
      'xcrun simctl shutdown all',
    ]);
  });

  it('refuses to erase a running simulator', async () => {
    harness = await Harness.start();
    const result = await harness.call('erase_device', { device: UDID.iphone15 });
    expect(result.text).toMatch(/^\[DEVICE_NOT_SHUTDOWN\]/);
    expect(harness.runner.matching('xcrun simctl erase')).toEqual([]);
  });

  it('erases a stopped simulator', async () => {
    harness = await Harness.start();
    await harness.ok('erase_device', { device: 'iPad Air' });
    expect(harness.runner.matching('xcrun simctl erase')).toEqual([`xcrun simctl erase ${UDID.ipad}`]);
  });

  it('opens the Simulator app, optionally on a device', async () => {
    harness = await Harness.start();
    await harness.ok('open_simulator_app');
    await harness.ok('open_simulator_app', { device: 'ipad air' });
    expect(harness.runner.matching('open')).toEqual([
      'open -a Simulator',
      `open -a Simulator --args -CurrentDeviceUDID ${UDID.ipad}`,
    ]);
  });
});

describe('device resolution', () => {
  it('asks which simulator to use when several are booted', async () => {
    harness = await Harness.start();
    harness.runner.on(LIST, deviceListJson([UDID.iphone15, UDID.ipad]));
    const result = await harness.call('set_appearance', { appearance: 'dark' });
    expect(result.text).toMatch(/^\[AMBIGUOUS_DEVICE\] Several simulators are booted/);
    expect(result.text).toContain(UDID.ipad);
  });

  it('explains that nothing is booted', async () => {
    harness = await Harness.start();
    harness.runner.on(LIST, deviceListJson([]));
    expect((await harness.call('screenshot')).text).toMatch(/^\[NO_BOOTED_DEVICE\]/);
  });

  it('requires the target of an app operation to be booted', async () => {
    harness = await Harness.start();
    const result = await harness.call('launch_app', { bundleId: 'com.example.app', device: 'iPad Air' });
    expect(result.text).toMatch(/^\[DEVICE_NOT_BOOTED\]/);
  });

  it('prefers the booted simulator among those sharing a name', async () => {
    harness = await Harness.start();
    harness.runner.on(LIST, deviceListJson([UDID.iphone15OnIos18]));
    const result = await harness.ok('set_appearance', { appearance: 'light', device: 'iPhone 15' });
    expect(result.text).toContain('iOS 18.0');
  });

  it('reuses the device list across a burst of calls', async () => {
    harness = await Harness.start();
    await harness.ok('set_appearance', { appearance: 'dark' });
    await harness.ok('open_url', { url: 'https://example.com' });
    await harness.ok('terminate_app', { bundleId: 'com.example.app' });
    expect(harness.runner.matching(LIST)).toHaveLength(1);
  });

  it('reads the list again once the cache expires', async () => {
    harness = await Harness.start();
    await harness.ok('set_appearance', { appearance: 'dark' });
    harness.clock.advance(10_000);
    await harness.ok('set_appearance', { appearance: 'light' });
    expect(harness.runner.matching(LIST)).toHaveLength(2);
  });

  it('can run with the cache disabled', async () => {
    harness = await Harness.start({ config: { deviceCacheTtlMs: 0 } });
    await harness.ok('set_appearance', { appearance: 'dark' });
    await harness.ok('set_appearance', { appearance: 'light' });
    expect(harness.runner.matching(LIST)).toHaveLength(2);
  });

  it('finds a simulator booted outside the server while the cache is warm', async () => {
    harness = await Harness.start();
    harness.runner.on(LIST, deviceListJson([]));
    expect((await harness.call('screenshot')).isError).toBe(true);
    harness.runner.on(LIST, deviceListJson([UDID.ipad]));
    expect((await harness.ok('set_appearance', { appearance: 'dark' })).text).toContain('iPad Air');
  });
});

describe('app tools', () => {
  it('installs an existing bundle', async () => {
    harness = await Harness.start();
    await harness.ok('install_app', { appPath: appBundle });
    expect(harness.runner.commandLines.at(-1)).toBe(`xcrun simctl install ${UDID.iphone15} ${appBundle}`);
  });

  it('reports a missing bundle clearly instead of a low-level error', async () => {
    harness = await Harness.start();
    const result = await harness.call('install_app', { appPath: path.join(workspace, 'Missing.app') });
    expect(result.text).toMatch(/^\[PATH_NOT_FOUND\] ".*Missing\.app" does not exist/);
    expect(harness.runner.matching('xcrun simctl install')).toEqual([]);
  });

  it('uninstalls an installed app', async () => {
    harness = await Harness.start();
    const result = await harness.ok('uninstall_app', { bundleId: 'com.example.app' });
    expect(result.text).toContain('Uninstalled com.example.app');
    expect(harness.runner.commandLines.slice(1)).toEqual([
      `xcrun simctl get_app_container ${UDID.iphone15} com.example.app app`,
      `xcrun simctl uninstall ${UDID.iphone15} com.example.app`,
    ]);
  });

  it('does not claim to have uninstalled an app that is not there', async () => {
    harness = await Harness.start();
    harness.runner.fail('xcrun simctl get_app_container', 'No such file or directory');
    const result = await harness.call('uninstall_app', { bundleId: 'com.noexiste.app' });
    expect(result.text).toMatch(/^\[APP_NOT_INSTALLED\] App "com\.noexiste\.app" is not installed/);
    expect(harness.runner.matching('xcrun simctl uninstall')).toEqual([]);
  });

  it('launches an app and reports its pid', async () => {
    harness = await Harness.start();
    harness.runner.on('xcrun simctl launch', 'com.example.app: 777\n');
    const result = await harness.ok('launch_app', {
      bundleId: 'com.example.app',
      terminateRunning: true,
      arguments: ['-uiTesting', 'YES'],
    });
    expect(result.text).toContain('Launched com.example.app (pid 777)');
    expect(harness.runner.commandLines.at(-1)).toBe(
      `xcrun simctl launch --terminate-running-process ${UDID.iphone15} com.example.app -uiTesting YES`,
    );
  });

  it('explains a launch that fails because the app is missing', async () => {
    harness = await Harness.start();
    harness.runner
      .fail('xcrun simctl launch', 'FBSOpenApplicationServiceErrorDomain')
      .fail('xcrun simctl get_app_container', 'No such file or directory');
    const result = await harness.call('launch_app', { bundleId: 'com.missing.app' });
    expect(result.text).toMatch(/^\[APP_NOT_INSTALLED\]/);
  });

  it('keeps the real error when an installed app fails to launch', async () => {
    harness = await Harness.start();
    harness.runner.fail('xcrun simctl launch', 'The request was denied by service delegate');
    const result = await harness.call('launch_app', { bundleId: 'com.example.app' });
    expect(result.text).toMatch(/^\[COMMAND_FAILED\]/);
    expect(result.text).toContain('denied by service delegate');
  });

  it('lists apps compactly, without host paths', async () => {
    harness = await Harness.start();
    harness.runner.on('xcrun simctl listapps', '{ plist }').on('plutil', () =>
      JSON.stringify({
        'com.example.app': {
          CFBundleDisplayName: 'Example',
          CFBundleShortVersionString: '1.2',
          ApplicationType: 'User',
          Path: '/Users/me/Library/Developer/CoreSimulator/Devices/X/data/Containers/Bundle/Application/Y/Example.app',
        },
        'com.apple.mobilesafari': { CFBundleDisplayName: 'Safari', ApplicationType: 'System', Path: '/long/path' },
      }),
    );
    const result = await harness.ok('list_apps');
    expect(result.text).toBe(
      [
        `2 app(s) on iPhone 15 (iOS 17.5, ${UDID.iphone15}).`,
        'com.example.app  Example  1.2',
        'com.apple.mobilesafari  Safari  [system]',
      ].join('\n'),
    );
    expect(result.text).not.toContain('/Users/');
  });

  it('filters apps by type', async () => {
    harness = await Harness.start();
    harness.runner.on('plutil', () =>
      JSON.stringify({
        'com.example.app': { ApplicationType: 'User' },
        'com.apple.mobilesafari': { ApplicationType: 'System' },
      }),
    );
    const result = await harness.ok('list_apps', { type: 'User' });
    expect(result.text).toContain('1 app(s)');
    expect(result.text).not.toContain('mobilesafari');
  });

  it('opens web and custom-scheme URLs', async () => {
    harness = await Harness.start();
    await harness.ok('open_url', { url: 'myapp://settings?tab=2' });
    expect(harness.runner.commandLines.at(-1)).toBe(`xcrun simctl openurl ${UDID.iphone15} myapp://settings?tab=2`);
  });

  it.each(['esto no es una url', 'example.com', 'https://'])('rejects %j as a URL up front', async (url) => {
    harness = await Harness.start();
    const result = await harness.call('open_url', { url });
    expect(result.text).toMatch(/^\[INVALID_ARGUMENT\] .* is not a URL/);
    expect(harness.runner.calls).toEqual([]);
  });

  it('returns the container path of an app', async () => {
    harness = await Harness.start();
    harness.runner.on('xcrun simctl get_app_container', '/sim/data/Containers/Data/Application/ABC\n');
    const result = await harness.ok('get_app_container', { bundleId: 'com.example.app' });
    expect(result.text).toBe('/sim/data/Containers/Data/Application/ABC');
    expect(harness.runner.commandLines.at(-1)).toBe(
      `xcrun simctl get_app_container ${UDID.iphone15} com.example.app data`,
    );
  });

  it('terminates an app', async () => {
    harness = await Harness.start();
    await harness.ok('terminate_app', { bundleId: 'com.example.app' });
    expect(harness.runner.commandLines.at(-1)).toBe(`xcrun simctl terminate ${UDID.iphone15} com.example.app`);
  });
});
