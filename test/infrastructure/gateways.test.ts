import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CommandFailedError,
  ExecutableNotFoundError,
  PathNotFoundError,
  UnexpectedOutputError,
  UnsupportedPlatformError,
} from '../../src/domain/errors.js';
import { Point } from '../../src/domain/geometry.js';
import { SimulatorHost } from '../../src/infrastructure/host/SimulatorHost.js';
import { IdbUiAutomationGateway } from '../../src/infrastructure/idb/IdbUiAutomationGateway.js';
import type { CommandRunner } from '../../src/infrastructure/process/CommandRunner.js';
import { SimctlAppGateway } from '../../src/infrastructure/simctl/SimctlAppGateway.js';
import { SimctlDeviceGateway } from '../../src/infrastructure/simctl/SimctlDeviceGateway.js';
import { SimctlEnvironmentGateway } from '../../src/infrastructure/simctl/SimctlEnvironmentGateway.js';
import { SimctlLogGateway } from '../../src/infrastructure/simctl/SimctlLogGateway.js';
import { SimctlMediaGateway } from '../../src/infrastructure/simctl/SimctlMediaGateway.js';
import { deviceTypesJson, FakeCommandRunner, IPHONE_15_TYPE } from '../support/FakeCommandRunner.js';

const U = 'UDID-1';

function mac(runner: CommandRunner = new FakeCommandRunner()): SimulatorHost {
  return new SimulatorHost(runner, { platform: 'darwin' });
}

/** A runner whose executables do not exist. */
const missingExecutables: CommandRunner = {
  run: async (command) => {
    throw new ExecutableNotFoundError(command);
  },
  start: () => {
    throw new Error('not used');
  },
};

let workspace: string;
let existingFile: string;

beforeAll(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'ios-simulator-mcp-gateways-'));
  existingFile = path.join(workspace, 'Example.app');
  await writeFile(existingFile, 'bundle');
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('SimulatorHost', () => {
  it.each(['win32', 'linux'] as const)('refuses to run anything on %s', async (platform) => {
    const runner = new FakeCommandRunner();
    const host = new SimulatorHost(runner, { platform });
    await expect(host.simctl(['list'])).rejects.toBeInstanceOf(UnsupportedPlatformError);
    await expect(host.run('open', [])).rejects.toBeInstanceOf(UnsupportedPlatformError);
    expect(() => host.startSimctl(['io'])).toThrow(UnsupportedPlatformError);
    expect(runner.calls).toEqual([]);
  });

  it('prefixes simctl commands and applies a default timeout', async () => {
    const runner = new FakeCommandRunner();
    await mac(runner).simctl(['list', 'devices']);
    expect(runner.calls[0]).toMatchObject({ commandLine: 'xcrun simctl list devices', timeoutMs: 120_000 });
  });

  it('lets a command override the timeout', async () => {
    const runner = new FakeCommandRunner();
    await mac(runner).simctl(['boot', U], { timeoutMs: 5 });
    expect(runner.calls[0]?.timeoutMs).toBe(5);
  });

  it('uses the configured xcrun path', async () => {
    const runner = new FakeCommandRunner();
    await new SimulatorHost(runner, { platform: 'darwin', xcrunPath: '/custom/xcrun' }).simctl(['list']);
    expect(runner.commandLines).toEqual(['/custom/xcrun simctl list']);
  });

  it('explains how to get xcrun when it is missing', async () => {
    await expect(mac(missingExecutables).simctl(['list'])).rejects.toThrow(/xcrun.*xcode-select --install/s);
  });
});

describe('SimctlDeviceGateway', () => {
  it('waits for the boot to complete, with a generous timeout', async () => {
    const runner = new FakeCommandRunner();
    await new SimctlDeviceGateway(mac(runner)).boot(U);
    expect(runner.commandLines).toEqual([`xcrun simctl boot ${U}`, `xcrun simctl bootstatus ${U} -b`]);
    expect(runner.calls[1]?.timeoutMs).toBe(180_000);
  });

  it('builds the lifecycle commands', async () => {
    const runner = new FakeCommandRunner();
    const gateway = new SimctlDeviceGateway(mac(runner));
    await gateway.shutdown(U);
    await gateway.shutdownAll();
    await gateway.erase(U);
    await gateway.openSimulatorApp();
    await gateway.openSimulatorApp(U);
    expect(runner.commandLines).toEqual([
      `xcrun simctl shutdown ${U}`,
      'xcrun simctl shutdown all',
      `xcrun simctl erase ${U}`,
      'open -a Simulator',
      `open -a Simulator --args -CurrentDeviceUDID ${U}`,
    ]);
  });

  describe('screenScale', () => {
    function runnerWithScale(scale: string): FakeCommandRunner {
      return new FakeCommandRunner().on('xcrun simctl list devicetypes', deviceTypesJson()).on('plutil', scale);
    }

    it('reads the scale from the profile of the device type', async () => {
      const runner = runnerWithScale('3\n');
      expect(await new SimctlDeviceGateway(mac(runner)).screenScale(IPHONE_15_TYPE)).toBe(3);
      expect(runner.commandLines[1]).toBe(
        'plutil -extract mainScreenScale raw -o - /Types/iPhone 15.simdevicetype/Contents/Resources/profile.plist',
      );
    });

    it('accepts a decimal scale', async () => {
      expect(await new SimctlDeviceGateway(mac(runnerWithScale('2.000000'))).screenScale(IPHONE_15_TYPE)).toBe(2);
    });

    it('looks each device type up only once', async () => {
      const runner = runnerWithScale('3');
      const gateway = new SimctlDeviceGateway(mac(runner));
      await gateway.screenScale(IPHONE_15_TYPE);
      await gateway.screenScale(IPHONE_15_TYPE);
      expect(runner.calls).toHaveLength(2);
    });

    it.each(['', 'nope', '0', '-2'])('is undefined for the nonsensical scale %j', async (scale) => {
      expect(await new SimctlDeviceGateway(mac(runnerWithScale(scale))).screenScale(IPHONE_15_TYPE)).toBeUndefined();
    });

    it('is undefined for an unknown device type, without reading any profile', async () => {
      const runner = runnerWithScale('3');
      expect(await new SimctlDeviceGateway(mac(runner)).screenScale('unknown.type')).toBeUndefined();
      expect(runner.matching('plutil')).toEqual([]);
    });

    it('is undefined, not an error, when a tool fails', async () => {
      const runner = runnerWithScale('3').fail('plutil', 'Could not extract value');
      expect(await new SimctlDeviceGateway(mac(runner)).screenScale(IPHONE_15_TYPE)).toBeUndefined();
      const garbled = new FakeCommandRunner().on('xcrun simctl list devicetypes', 'not json');
      expect(await new SimctlDeviceGateway(mac(garbled)).screenScale(IPHONE_15_TYPE)).toBeUndefined();
    });

    it('retries after a failure instead of remembering it', async () => {
      const runner = runnerWithScale('3').fail('plutil', 'busy');
      const gateway = new SimctlDeviceGateway(mac(runner));
      await gateway.screenScale(IPHONE_15_TYPE);
      runner.on('plutil', '3');
      expect(await gateway.screenScale(IPHONE_15_TYPE)).toBe(3);
    });
  });
});

describe('SimctlAppGateway', () => {
  it('installs an existing bundle by its absolute path', async () => {
    const runner = new FakeCommandRunner();
    await new SimctlAppGateway(mac(runner)).install(U, existingFile);
    expect(runner.commandLines).toEqual([`xcrun simctl install ${U} ${existingFile}`]);
    expect(runner.calls[0]?.timeoutMs).toBe(300_000);
  });

  it('reports a missing bundle without calling simctl', async () => {
    const runner = new FakeCommandRunner();
    const missing = path.join(workspace, 'Nope.app');
    await expect(new SimctlAppGateway(mac(runner)).install(U, missing)).rejects.toBeInstanceOf(PathNotFoundError);
    expect(runner.calls).toEqual([]);
  });

  it('passes launch flags before the device and arguments after the bundle id', async () => {
    const runner = new FakeCommandRunner().on('xcrun simctl launch', 'com.example.app: 9\n');
    const result = await new SimctlAppGateway(mac(runner)).launch(U, 'com.example.app', {
      terminateRunning: true,
      arguments: ['-flag', 'value with spaces'],
    });
    expect(result).toEqual({ bundleId: 'com.example.app', pid: 9 });
    expect(runner.calls[0]?.args).toEqual([
      'simctl', 'launch', '--terminate-running-process', U, 'com.example.app', '-flag', 'value with spaces',
    ]);
  });

  it('launches without flags by default', async () => {
    const runner = new FakeCommandRunner();
    const result = await new SimctlAppGateway(mac(runner)).launch(U, 'com.example.app');
    expect(runner.commandLines).toEqual([`xcrun simctl launch ${U} com.example.app`]);
    expect(result.pid).toBeUndefined();
  });

  it('checks installation through the app container', async () => {
    const runner = new FakeCommandRunner();
    const gateway = new SimctlAppGateway(mac(runner));
    expect(await gateway.isInstalled(U, 'com.example.app')).toBe(true);
    expect(runner.commandLines).toEqual([`xcrun simctl get_app_container ${U} com.example.app app`]);

    runner.fail('xcrun simctl get_app_container', 'No such file or directory');
    expect(await gateway.isInstalled(U, 'com.missing.app')).toBe(false);
  });

  it('does not mistake a broken toolchain for a missing app', async () => {
    await expect(new SimctlAppGateway(mac(missingExecutables)).isInstalled(U, 'x')).rejects.toBeInstanceOf(
      ExecutableNotFoundError,
    );
  });

  it('converts the app list through plutil', async () => {
    const runner = new FakeCommandRunner()
      .on('xcrun simctl listapps', '{ old = plist; }')
      .on('plutil', (_args, options) => {
        expect(options.stdin).toBe('{ old = plist; }');
        return JSON.stringify({ 'com.example.app': { CFBundleName: 'Example', ApplicationType: 'User' } });
      });
    const apps = await new SimctlAppGateway(mac(runner)).listInstalled(U);
    expect(apps).toEqual([
      { bundleId: 'com.example.app', name: 'Example', version: undefined, type: 'User', bundlePath: undefined },
    ]);
    expect(runner.commandLines[1]).toBe('plutil -convert json -o - -');
  });

  it('builds the remaining commands and trims the container path', async () => {
    const runner = new FakeCommandRunner().on('xcrun simctl get_app_container', '/data/Containers/ABC\n');
    const gateway = new SimctlAppGateway(mac(runner));
    await gateway.uninstall(U, 'com.example.app');
    await gateway.terminate(U, 'com.example.app');
    await gateway.openUrl(U, 'myapp://x?a=1&b=2');
    expect(await gateway.getContainerPath(U, 'com.example.app', 'groups')).toBe('/data/Containers/ABC');
    expect(runner.commandLines).toEqual([
      `xcrun simctl uninstall ${U} com.example.app`,
      `xcrun simctl terminate ${U} com.example.app`,
      `xcrun simctl openurl ${U} myapp://x?a=1&b=2`,
      `xcrun simctl get_app_container ${U} com.example.app groups`,
    ]);
  });
});

describe('SimctlMediaGateway', () => {
  /** A runner whose screenshot command really writes a file, as simctl would. */
  function capturingRunner(width = '  pixelWidth: 1179\n'): FakeCommandRunner {
    return new FakeCommandRunner()
      .on('xcrun simctl io', async (args) => {
        await writeFile(args.at(-1) ?? '', 'image-bytes');
        return '';
      })
      .on('sips -g', width);
  }

  it('captures to a temporary file that is removed afterwards', async () => {
    const runner = capturingRunner();
    const image = await new SimctlMediaGateway(mac(runner)).captureScreenshot(U, 'png');
    expect(Buffer.from(image.data).toString()).toBe('image-bytes');
    expect(image).toMatchObject({ format: 'png', savedPath: undefined, downscaled: false });

    const file = runner.calls[0]?.args.at(-1) ?? '';
    expect(runner.calls[0]?.args.slice(0, 5)).toEqual(['simctl', 'io', U, 'screenshot', '--type=png']);
    await expect(readFile(file)).rejects.toThrow();
  });

  it('keeps the image when an output path is given, creating its folder', async () => {
    const target = path.join(workspace, 'nested', 'deep', 'shot.jpeg');
    const image = await new SimctlMediaGateway(mac(capturingRunner())).captureScreenshot(U, 'jpeg', {
      outputPath: target,
    });
    expect(image.savedPath).toBe(target);
    expect((await readFile(target)).toString()).toBe('image-bytes');
  });

  it('shrinks the image to points with sips', async () => {
    const runner = capturingRunner();
    const image = await new SimctlMediaGateway(mac(runner)).captureScreenshot(U, 'jpeg', { downscaleBy: 3 });
    const file = runner.calls[0]?.args.at(-1);
    expect(image.downscaled).toBe(true);
    expect(runner.calls.slice(1).map((call) => call.args)).toEqual([
      ['-g', 'pixelWidth', file],
      ['--resampleWidth', '393', file],
    ]);
  });

  it('rounds the target width', async () => {
    const runner = capturingRunner('pixelWidth: 1290');
    await new SimctlMediaGateway(mac(runner)).captureScreenshot(U, 'jpeg', { downscaleBy: 3 });
    expect(runner.calls[2]?.args[1]).toBe('430');
    const odd = capturingRunner('pixelWidth: 1125');
    await new SimctlMediaGateway(mac(odd)).captureScreenshot(U, 'jpeg', { downscaleBy: 2 });
    expect(odd.calls[2]?.args[1]).toBe('563');
  });

  it.each([1, 0.5, undefined])('does not touch the image for a scale of %s', async (downscaleBy) => {
    const runner = capturingRunner();
    const image = await new SimctlMediaGateway(mac(runner)).captureScreenshot(U, 'png', { downscaleBy });
    expect(image.downscaled).toBe(false);
    expect(runner.matching('sips')).toEqual([]);
  });

  it('returns the original capture when sips cannot read the size', async () => {
    const runner = capturingRunner('garbage');
    const image = await new SimctlMediaGateway(mac(runner)).captureScreenshot(U, 'png', { downscaleBy: 3 });
    expect(image.downscaled).toBe(false);
    expect(Buffer.from(image.data).toString()).toBe('image-bytes');
    expect(runner.matching('sips --resampleWidth')).toEqual([]);
  });

  it('returns the original capture when sips fails', async () => {
    const runner = capturingRunner().fail('sips --resampleWidth', 'sips: cannot write');
    const image = await new SimctlMediaGateway(mac(runner)).captureScreenshot(U, 'png', { downscaleBy: 3 });
    expect(image.downscaled).toBe(false);
  });

  it('propagates a failing screenshot and still cleans up', async () => {
    const runner = new FakeCommandRunner().fail('xcrun simctl io', 'Invalid device');
    await expect(new SimctlMediaGateway(mac(runner)).captureScreenshot(U, 'png')).rejects.toBeInstanceOf(
      CommandFailedError,
    );
  });

  it('starts a recording and stops it by interrupting the process', async () => {
    const runner = new FakeCommandRunner();
    const target = path.join(workspace, 'videos', 'demo.mp4');
    const session = await new SimctlMediaGateway(mac(runner)).startRecording(U, target, 'hevc');
    expect(runner.calls[0]?.args).toEqual(['simctl', 'io', U, 'recordVideo', '--codec=hevc', '--force', target]);
    expect(session.outputPath).toBe(target);
    expect(runner.background[0]?.hasExited).toBe(false);
    await session.stop();
    expect(runner.background[0]?.hasExited).toBe(true);
  });

  it('adds existing media and rejects missing files before calling simctl', async () => {
    const runner = new FakeCommandRunner();
    const gateway = new SimctlMediaGateway(mac(runner));
    await gateway.addMedia(U, [existingFile]);
    expect(runner.commandLines).toEqual([`xcrun simctl addmedia ${U} ${existingFile}`]);

    runner.reset();
    await expect(gateway.addMedia(U, [existingFile, path.join(workspace, 'missing.png')])).rejects.toBeInstanceOf(
      PathNotFoundError,
    );
    expect(runner.calls).toEqual([]);
  });
});

describe('SimctlEnvironmentGateway', () => {
  it('builds the environment commands', async () => {
    const runner = new FakeCommandRunner();
    const gateway = new SimctlEnvironmentGateway(mac(runner));
    await gateway.setAppearance(U, 'dark');
    await gateway.setLocation(U, { latitude: 40.4168, longitude: -3.7038 });
    await gateway.clearLocation(U);
    await gateway.overrideStatusBar(U, { time: '9:41', operatorName: 'My Carrier' });
    await gateway.clearStatusBar(U);
    await gateway.changePermission(U, { action: 'grant', service: 'photos', bundleId: 'com.example.app' });
    await gateway.changePermission(U, { action: 'reset', service: 'all' });
    expect(runner.calls.map((call) => call.args.slice(1))).toEqual([
      ['ui', U, 'appearance', 'dark'],
      ['location', U, 'set', '40.4168,-3.7038'],
      ['location', U, 'clear'],
      ['status_bar', U, 'override', '--time', '9:41', '--operatorName', 'My Carrier'],
      ['status_bar', U, 'clear'],
      ['privacy', U, 'grant', 'photos', 'com.example.app'],
      ['privacy', U, 'reset', 'all'],
    ]);
  });

  it('sends the push payload through standard input', async () => {
    const runner = new FakeCommandRunner();
    await new SimctlEnvironmentGateway(mac(runner)).sendPushNotification(U, 'com.example.app', {
      aps: { alert: 'Señal' },
    });
    expect(runner.calls[0]?.args).toEqual(['simctl', 'push', U, 'com.example.app', '-']);
    expect(JSON.parse(runner.calls[0]?.stdin ?? '')).toEqual({ aps: { alert: 'Señal' } });
  });

  it('copies any text to the clipboard through standard input and reads it back verbatim', async () => {
    const runner = new FakeCommandRunner().on('xcrun simctl pbpaste', 'línea 1\nlínea 2 🎉');
    const gateway = new SimctlEnvironmentGateway(mac(runner));
    await gateway.setClipboard(U, 'Añadir "comillas" y $variables; rm -rf /');
    expect(runner.calls[0]).toMatchObject({
      commandLine: `xcrun simctl pbcopy ${U}`,
      stdin: 'Añadir "comillas" y $variables; rm -rf /',
    });
    expect(await gateway.getClipboard(U)).toBe('línea 1\nlínea 2 🎉');
  });
});

describe('SimctlEnvironmentGateway pasteboard retries', () => {
  const TIMEOUT = 'An error was encountered processing the command (domain=NSPOSIXErrorDomain, code=60):\nOperation timed out';

  /** A runner whose pasteboard commands time out a number of times before working. */
  function flakyRunner(failures: number): FakeCommandRunner {
    let remaining = failures;
    const runner = new FakeCommandRunner();
    const respond = (): string => {
      if (remaining > 0) {
        remaining -= 1;
        throw new CommandFailedError('xcrun simctl pb', 60, TIMEOUT);
      }
      return 'clipboard text';
    };
    return runner.on('xcrun simctl pbcopy', respond).on('xcrun simctl pbpaste', respond);
  }

  it('repeats a pasteboard command that times out', async () => {
    const runner = flakyRunner(2);
    await new SimctlEnvironmentGateway(mac(runner)).setClipboard(U, 'hola');
    expect(runner.matching('xcrun simctl pbcopy')).toHaveLength(3);
    expect(runner.calls.every((call) => call.stdin === 'hola')).toBe(true);
  });

  it('also retries reading', async () => {
    const runner = flakyRunner(1);
    expect(await new SimctlEnvironmentGateway(mac(runner)).getClipboard(U)).toBe('clipboard text');
    expect(runner.matching('xcrun simctl pbpaste')).toHaveLength(2);
  });

  it('gives up after three attempts', async () => {
    const runner = flakyRunner(5);
    await expect(new SimctlEnvironmentGateway(mac(runner)).setClipboard(U, 'hola')).rejects.toThrow('timed out');
    expect(runner.matching('xcrun simctl pbcopy')).toHaveLength(3);
  });

  it('does not retry other failures', async () => {
    const runner = new FakeCommandRunner().fail('xcrun simctl pbcopy', 'Invalid device');
    await expect(new SimctlEnvironmentGateway(mac(runner)).setClipboard(U, 'hola')).rejects.toThrow('Invalid device');
    expect(runner.matching('xcrun simctl pbcopy')).toHaveLength(1);
  });
});

describe('SimctlLogGateway', () => {
  it('runs log show inside the simulator', async () => {
    const runner = new FakeCommandRunner().on('xcrun simctl spawn', 'Timestamp Ty\nentry\n');
    const lines = await new SimctlLogGateway(mac(runner)).readRecent(U, { minutes: 3 });
    expect(lines).toEqual(['entry']);
    expect(runner.calls[0]?.args).toEqual(['simctl', 'spawn', U, 'log', 'show', '--style', 'compact', '--last', '3m']);
  });

  it('passes the predicate as a single argument', async () => {
    const runner = new FakeCommandRunner();
    await new SimctlLogGateway(mac(runner)).readRecent(U, { minutes: 1, predicate: 'process == "My App"' });
    expect(runner.calls[0]?.args.slice(-2)).toEqual(['--predicate', 'process == "My App"']);
  });
});

describe('IdbUiAutomationGateway', () => {
  it('builds the interaction commands', async () => {
    const runner = new FakeCommandRunner();
    const gateway = new IdbUiAutomationGateway(mac(runner));
    await gateway.tap(U, new Point(10, 20));
    await gateway.tap(U, new Point(10, 20), 1.5);
    await gateway.swipe(U, new Point(1, 2), new Point(3, 4));
    await gateway.swipe(U, new Point(1, 2), new Point(3, 4), { durationSeconds: 0.5, stepSize: 10 });
    await gateway.pressButton(U, 'HOME');
    await gateway.pressKey(U, 40);
    expect(runner.calls.map((call) => call.args.join(' '))).toEqual([
      `ui tap --udid ${U} 10 20`,
      `ui tap --udid ${U} --duration 1.5 10 20`,
      `ui swipe --udid ${U} 1 2 3 4`,
      `ui swipe --udid ${U} --duration 0.5 --delta 10 1 2 3 4`,
      `ui button --udid ${U} HOME`,
      `ui key --udid ${U} 40`,
    ]);
  });

  it('protects text that looks like an option', async () => {
    const runner = new FakeCommandRunner();
    await new IdbUiAutomationGateway(mac(runner)).typeText(U, '--help me');
    expect(runner.calls[0]?.args).toEqual(['ui', 'text', '--udid', U, '--', '--help me']);
  });

  it('uses the configured idb path', async () => {
    const runner = new FakeCommandRunner();
    await new IdbUiAutomationGateway(mac(runner), '/opt/bin/idb').pressButton(U, 'LOCK');
    expect(runner.commandLines[0]).toMatch(/^\/opt\/bin\/idb ui button/);
  });

  it('parses the described screen', async () => {
    const runner = new FakeCommandRunner().on(
      'idb ui describe-all',
      JSON.stringify([{ type: 'Button', AXLabel: 'OK', frame: { x: 0, y: 0, width: 10, height: 10 } }]),
    );
    const elements = await new IdbUiAutomationGateway(mac(runner)).describeScreen(U);
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ type: 'Button', label: 'OK' });
  });

  it.each(['not json', '{"an":"object"}'])('rejects the unexpected screen description %j', async (output) => {
    const runner = new FakeCommandRunner().on('idb ui describe-all', output);
    await expect(new IdbUiAutomationGateway(mac(runner)).describeScreen(U)).rejects.toBeInstanceOf(
      UnexpectedOutputError,
    );
  });

  it('describes a point, or nothing when idb prints nothing', async () => {
    const runner = new FakeCommandRunner().on('idb ui describe-point', '{"type":"Cell","AXLabel":"Row"}');
    const gateway = new IdbUiAutomationGateway(mac(runner));
    expect(await gateway.describePoint(U, new Point(5, 6))).toMatchObject({ type: 'Cell', label: 'Row' });
    expect(runner.calls[0]?.args).toEqual(['ui', 'describe-point', '--udid', U, '5', '6']);

    runner.on('idb ui describe-point', '  \n');
    expect(await gateway.describePoint(U, new Point(5, 6))).toBeUndefined();
    runner.on('idb ui describe-point', 'null');
    expect(await gateway.describePoint(U, new Point(5, 6))).toBeUndefined();
  });

  it('explains how to install idb when it is missing', async () => {
    const failure = new IdbUiAutomationGateway(mac(missingExecutables), 'idb').pressButton(U, 'HOME');
    await expect(failure).rejects.toBeInstanceOf(ExecutableNotFoundError);
    await expect(failure).rejects.toThrow(/idb-companion.*IOS_SIMULATOR_MCP_IDB_PATH/s);
  });

  it('reduces a Python traceback to its message', async () => {
    const runner = new FakeCommandRunner().fail(
      'idb ui text',
      'Traceback (most recent call last):\n  File "hid.py", line 1\nException: No keycode found for ñ\n',
    );
    const failure = new IdbUiAutomationGateway(mac(runner)).typeText(U, 'ñ');
    await expect(failure).rejects.toMatchObject({ stderr: 'Exception: No keycode found for ñ' });
    await expect(failure).rejects.not.toThrow(/Traceback/);
  });

  it('explains the failure caused by a closed Simulator window', async () => {
    const runner = new FakeCommandRunner().fail(
      'idb ui describe-all',
      'No translation object returned for simulator. This means you have likely specified a point onscreen that is invalid',
    );
    await expect(new IdbUiAutomationGateway(mac(runner)).describeScreen(U)).rejects.toThrow(
      /Hint: .*open_simulator_app/,
    );
  });
});
