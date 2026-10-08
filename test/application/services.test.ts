import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AppService } from '../../src/application/AppService.js';
import { EnvironmentService } from '../../src/application/EnvironmentService.js';
import { LogService } from '../../src/application/LogService.js';
import { MediaService } from '../../src/application/MediaService.js';
import {
  AmbiguousDeviceError,
  AppNotInstalledError,
  CommandFailedError,
  DeviceNotBootedError,
  InvalidArgumentError,
  NoActiveRecordingError,
  RecordingAlreadyActiveError,
} from '../../src/domain/errors.js';
import {
  commandFailure,
  device,
  FakeAppGateway,
  FakeDeviceGateway,
  FakeEnvironmentGateway,
  FakeLogGateway,
  FakeMediaGateway,
  resolverFor,
} from '../support/fakes.js';

const IPHONE = 'UDID-IPHONE';
const IPAD = 'UDID-IPAD';
const TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-15';

function devices(ipadBooted = false): FakeDeviceGateway {
  return new FakeDeviceGateway([
    device('iPhone 15', IPHONE, 'Booted', TYPE),
    device('iPad Air', IPAD, ipadBooted ? 'Booted' : 'Shutdown'),
  ]);
}

describe('AppService', () => {
  function setUp() {
    const apps = new FakeAppGateway();
    return { apps, service: new AppService(apps, resolverFor(devices()).resolver) };
  }

  it('requires a booted simulator', async () => {
    const { service } = setUp();
    await expect(service.launch('com.example.app', {}, IPAD)).rejects.toBeInstanceOf(DeviceNotBootedError);
  });

  describe('uninstall', () => {
    it('uninstalls an installed app', async () => {
      const { service, apps } = setUp();
      await service.uninstall('com.example.app');
      expect(apps.calls).toEqual(['isInstalled com.example.app', 'uninstall com.example.app']);
    });

    it('refuses to report success for an app that is not installed', async () => {
      const { service, apps } = setUp();
      await expect(service.uninstall('com.noexiste.app')).rejects.toBeInstanceOf(AppNotInstalledError);
      expect(apps.calls).not.toContain('uninstall com.noexiste.app');
    });
  });

  describe('launch', () => {
    it('launches without any extra check when it works', async () => {
      const { service, apps } = setUp();
      const { value } = await service.launch('com.example.app', { terminateRunning: true });
      expect(value.pid).toBe(42);
      expect(apps.calls).toEqual(['launch com.example.app fresh']);
    });

    it('explains a failure caused by a missing app', async () => {
      const { service, apps } = setUp();
      apps.failures.launch = commandFailure('FBSOpenApplicationServiceErrorDomain, code=1');
      await expect(service.launch('com.missing.app')).rejects.toBeInstanceOf(AppNotInstalledError);
    });

    it('keeps the original error when the app is installed', async () => {
      const { service, apps } = setUp();
      apps.failures.launch = commandFailure('The app crashed on launch');
      await expect(service.launch('com.example.app')).rejects.toThrow('The app crashed on launch');
    });

    it('keeps the original error when it cannot tell whether the app is installed', async () => {
      const { service, apps } = setUp();
      apps.failures.launch = commandFailure('launch failed');
      apps.failures.isInstalled = commandFailure('simulator went away');
      await expect(service.launch('com.missing.app')).rejects.toThrow('launch failed');
    });

    it('does not mistake unexpected errors for a missing app', async () => {
      const { service, apps } = setUp();
      apps.failures.launch = new TypeError('bug');
      await expect(service.launch('com.missing.app')).rejects.toBeInstanceOf(TypeError);
      expect(apps.calls).not.toContain('isInstalled com.missing.app');
    });
  });

  it('explains terminate and container lookups on a missing app', async () => {
    const { service, apps } = setUp();
    apps.failures.terminate = commandFailure('found nothing to terminate');
    apps.failures.container = commandFailure('No such file or directory');
    await expect(service.terminate('com.missing.app')).rejects.toBeInstanceOf(AppNotInstalledError);
    await expect(service.getContainerPath('com.missing.app')).rejects.toBeInstanceOf(AppNotInstalledError);
  });

  it('returns the data container by default', async () => {
    const { service } = setUp();
    expect((await service.getContainerPath('com.example.app')).value).toBe('/containers/com.example.app/data');
  });

  describe('openUrl', () => {
    it.each([
      'https://example.com/a?b=1',
      'myapp://profile/42',
      'mailto:ana@example.com',
      'tel:+34600000000',
      'file:///tmp/a.html',
    ])('accepts %s', async (url) => {
      const { service, apps } = setUp();
      await service.openUrl(url);
      expect(apps.calls).toEqual([`openUrl ${url}`]);
    });

    it('trims surrounding spaces', async () => {
      const { service, apps } = setUp();
      await service.openUrl('  https://example.com ');
      expect(apps.calls).toEqual(['openUrl https://example.com']);
    });

    it.each(['example.com', 'esto no es una url', 'https://', '://missing-scheme', '', '1https://x', 'https://a b'])(
      'rejects %j before running anything',
      async (url) => {
        const { service, apps } = setUp();
        await expect(service.openUrl(url)).rejects.toBeInstanceOf(InvalidArgumentError);
        expect(apps.calls).toEqual([]);
      },
    );
  });

  it('lists apps sorted by name and filtered by type', async () => {
    const { service, apps } = setUp();
    apps.apps = [
      { bundleId: 'b', name: 'Zeta', version: '1', type: 'User', bundlePath: undefined },
      { bundleId: 'a', name: 'Alpha', version: '2', type: 'System', bundlePath: undefined },
      { bundleId: 'c', name: 'Beta', version: undefined, type: 'User', bundlePath: undefined },
    ];
    expect((await service.list()).value.map((app) => app.name)).toEqual(['Alpha', 'Beta', 'Zeta']);
    expect((await service.list('User')).value.map((app) => app.name)).toEqual(['Beta', 'Zeta']);
  });
});

describe('MediaService', () => {
  function setUp(gateway = devices()) {
    const media = new FakeMediaGateway();
    const service = new MediaService(media, gateway, resolverFor(gateway).resolver, {
      outputDirectory: '/out',
      now: () => new Date('2026-01-02T03:04:05.678Z'),
    });
    return { media, service, gateway };
  }

  describe('screenshot', () => {
    it('defaults to a JPEG reduced to points', async () => {
      const { service, media } = setUp();
      const { value } = await service.screenshot();
      expect(media.captures).toEqual([{ format: 'jpeg', options: { outputPath: undefined, downscaleBy: 3 } }]);
      expect(value).toMatchObject({ coordinateSpace: 'points', deviceScale: 3, downscaled: true });
    });

    it('keeps native pixels when full resolution is requested', async () => {
      const { service, media } = setUp();
      const { value } = await service.screenshot({ resolution: 'full', format: 'png' });
      expect(media.captures[0]).toEqual({ format: 'png', options: { outputPath: undefined, downscaleBy: undefined } });
      expect(value).toMatchObject({ coordinateSpace: 'pixels', deviceScale: 3 });
    });

    it('reports pixels when the image could not be resized', async () => {
      const { service, media } = setUp();
      media.canDownscale = false;
      expect((await service.screenshot()).value).toMatchObject({ coordinateSpace: 'pixels', deviceScale: 3 });
    });

    it('reports pixels when the scale of the device is unknown', async () => {
      const gateway = devices();
      gateway.scale = undefined;
      const { service, media } = setUp(gateway);
      const { value } = await service.screenshot();
      expect(media.captures[0]?.options.downscaleBy).toBeUndefined();
      expect(value).toMatchObject({ coordinateSpace: 'pixels', deviceScale: undefined });
    });

    it('treats a 1x device as already being in points', async () => {
      const gateway = devices();
      gateway.scale = 1;
      const { service, media } = setUp(gateway);
      const { value } = await service.screenshot();
      expect(media.captures[0]?.options.downscaleBy).toBeUndefined();
      expect(value.coordinateSpace).toBe('points');
    });

    it('does not look up the scale of a device without a known type', async () => {
      const gateway = devices(true);
      const { service } = setUp(gateway);
      const { value } = await service.screenshot({}, IPAD);
      expect(gateway.calls).toEqual([]);
      expect(value.coordinateSpace).toBe('pixels');
    });

    it('passes the output path through', async () => {
      const { service } = setUp();
      expect((await service.screenshot({ outputPath: '/tmp/a.png' })).value.savedPath).toBe('/tmp/a.png');
    });
  });

  describe('recording', () => {
    it('names the file after the device and the time by default', async () => {
      const { service } = setUp();
      const { value } = await service.startRecording();
      expect(value).toBe(path.join('/out', 'recording-iPhone_15-2026-01-02T03-04-05-678Z.mp4'));
    });

    it('uses the given path and codec', async () => {
      const { service, media } = setUp();
      await service.startRecording({ outputPath: '/tmp/demo.mp4', codec: 'hevc' });
      expect(media.sessions[0]).toMatchObject({ outputPath: '/tmp/demo.mp4', codec: 'hevc' });
    });

    it('allows one recording per device', async () => {
      const { service } = setUp();
      await service.startRecording();
      await expect(service.startRecording()).rejects.toBeInstanceOf(RecordingAlreadyActiveError);
    });

    it('stops the only recording without naming the device', async () => {
      const { service, media } = setUp();
      await service.startRecording();
      await service.stopRecording();
      expect(media.sessions[0]?.stopped).toBe(true);
      await expect(service.stopRecording()).rejects.toBeInstanceOf(NoActiveRecordingError);
    });

    it('asks which recording to stop when several are active', async () => {
      const { service, media } = setUp(devices(true));
      await service.startRecording({}, IPHONE);
      await service.startRecording({}, IPAD);
      await expect(service.stopRecording()).rejects.toBeInstanceOf(AmbiguousDeviceError);
      await service.stopRecording('iPad Air');
      expect(media.sessions.map((session) => session.stopped)).toEqual([false, true]);
    });

    it('reports a device that is not being recorded', async () => {
      const { service } = setUp();
      await expect(service.stopRecording(IPAD)).rejects.toBeInstanceOf(NoActiveRecordingError);
    });

    it('can record again after stopping', async () => {
      const { service, media } = setUp();
      await service.startRecording();
      await service.stopRecording();
      await service.startRecording();
      expect(media.sessions).toHaveLength(2);
    });

    it('finishes every recording when disposed', async () => {
      const { service, media } = setUp(devices(true));
      await service.startRecording({}, IPHONE);
      await service.startRecording({}, IPAD);
      await service.dispose();
      expect(media.sessions.every((session) => session.stopped)).toBe(true);
      await expect(service.stopRecording()).rejects.toBeInstanceOf(NoActiveRecordingError);
    });
  });

  it('adds media to the booted device', async () => {
    const { service, media } = setUp();
    await service.addMedia(['/a.png', '/b.mov']);
    expect(media.media).toEqual([['/a.png', '/b.mov']]);
  });
});

describe('EnvironmentService', () => {
  function setUp() {
    const environment = new FakeEnvironmentGateway();
    return { environment, service: new EnvironmentService(environment, resolverFor(devices()).resolver) };
  }

  it.each([
    [90.1, 0],
    [-91, 0],
    [0, 180.5],
    [0, -181],
  ])('rejects the location (%s, %s)', async (latitude, longitude) => {
    const { service, environment } = setUp();
    await expect(service.setLocation({ latitude, longitude })).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(environment.calls).toEqual([]);
  });

  it('accepts locations at the limits', async () => {
    const { service, environment } = setUp();
    await service.setLocation({ latitude: -90, longitude: 180 });
    expect(environment.calls).toEqual(['location -90,180']);
  });

  it('requires at least one status bar value', async () => {
    const { service } = setUp();
    await expect(service.overrideStatusBar({})).rejects.toBeInstanceOf(InvalidArgumentError);
    await expect(service.overrideStatusBar({ time: undefined })).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('accepts a status bar value of zero', async () => {
    const { service, environment } = setUp();
    await service.overrideStatusBar({ wifiBars: 0 });
    expect(environment.calls).toEqual(['statusBar {"wifiBars":0}']);
  });

  it.each(['grant', 'revoke'] as const)('requires a bundle id to %s a permission', async (action) => {
    const { service } = setUp();
    await expect(service.changePermission({ action, service: 'photos' })).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('resets a permission for every app when no bundle id is given', async () => {
    const { service, environment } = setUp();
    await service.changePermission({ action: 'reset', service: 'all' });
    expect(environment.calls).toEqual(['permission reset all *']);
  });

  describe('push notifications', () => {
    it.each([{}, { aps: null }, { aps: 'text' }, { alert: 'no aps' }])('rejects the payload %j', async (payload) => {
      const { service, environment } = setUp();
      await expect(service.sendPushNotification('com.example.app', payload)).rejects.toBeInstanceOf(
        InvalidArgumentError,
      );
      expect(environment.calls).toEqual([]);
    });

    it('sends a valid payload', async () => {
      const { service, environment } = setUp();
      await service.sendPushNotification('com.example.app', { aps: { alert: 'Hi' } });
      expect(environment.calls).toEqual(['push com.example.app']);
    });

    it('explains the "not authorized" failure', async () => {
      const { service, environment } = setUp();
      environment.pushError = commandFailure('Source is not authorized');
      const failure = service.sendPushNotification('com.example.app', { aps: {} });
      await expect(failure).rejects.toBeInstanceOf(CommandFailedError);
      await expect(failure).rejects.toThrow(/Source is not authorized\nHint: com\.example\.app is not allowed/);
    });

    it('leaves other failures untouched', async () => {
      const { service, environment } = setUp();
      environment.pushError = commandFailure('Invalid device');
      await expect(service.sendPushNotification('com.example.app', { aps: {} })).rejects.not.toThrow(/Hint/);
    });
  });

  it('round-trips the clipboard, including text the keyboard cannot type', async () => {
    const { service } = setUp();
    await service.setClipboard('Añadir canción 🎵');
    expect((await service.getClipboard()).value).toBe('Añadir canción 🎵');
  });
});

describe('LogService', () => {
  function setUp(lines: string[] = []) {
    const logs = new FakeLogGateway();
    logs.lines = lines;
    return { logs, service: new LogService(logs, resolverFor(devices()).resolver) };
  }

  it('looks one minute back with no filter by default', async () => {
    const { service, logs } = setUp();
    await service.readRecent();
    expect(logs.queries).toEqual([{ minutes: 1, predicate: undefined }]);
  });

  it('combines the filters into one predicate', async () => {
    const { service, logs } = setUp();
    await service.readRecent({
      minutes: 5,
      processName: 'MyApp',
      messageContains: 'failed',
      predicate: ' subsystem == "com.example" OR category == "net" ',
    });
    expect(logs.queries[0]).toEqual({
      minutes: 5,
      predicate:
        'process == "MyApp" AND eventMessage CONTAINS[c] "failed" AND (subsystem == "com.example" OR category == "net")',
    });
  });

  it('escapes quotes and backslashes so a filter cannot alter the predicate', async () => {
    const { service, logs } = setUp();
    await service.readRecent({ processName: 'a" OR "1" == "1', messageContains: 'back\\slash' });
    expect(logs.queries[0]?.predicate).toBe(
      'process == "a\\" OR \\"1\\" == \\"1" AND eventMessage CONTAINS[c] "back\\\\slash"',
    );
  });

  it('keeps the most recent lines and counts the rest', async () => {
    const lines = Array.from({ length: 250 }, (_, index) => `line ${index}`);
    const { value } = await setUp(lines).service.readRecent();
    expect(value.lines).toHaveLength(200);
    expect(value.lines.at(-1)).toBe('line 249');
    expect(value.omitted).toBe(50);
  });

  it('honours a custom line limit', async () => {
    const { value } = await setUp(['a', 'b', 'c']).service.readRecent({ maxLines: 2 });
    expect(value).toEqual({ lines: ['b', 'c'], omitted: 1 });
  });
});
