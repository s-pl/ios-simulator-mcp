import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { deviceListJson, deviceTypesJson, UDID } from '../support/FakeCommandRunner.js';
import { Harness } from '../support/Harness.js';

const DEVICE = `iPhone 15 (iOS 17.5, ${UDID.iphone15})`;

let harness: Harness;
let workspace: string;

beforeAll(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'ios-simulator-mcp-media-'));
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

afterEach(async () => {
  await harness.stop();
});

/** A harness on which screenshots work as on a 3x iPhone with sips available. */
async function withScreenshots(options: { scale?: string; width?: string } = {}): Promise<Harness> {
  harness = await Harness.start();
  harness.runner
    .on('xcrun simctl list devicetypes', deviceTypesJson())
    .on('plutil -extract', options.scale ?? '3\n')
    .on('xcrun simctl io', async (args) => {
      await writeFile(args.at(-1) ?? '', 'fake-image-bytes');
      return '';
    })
    .on('sips -g', options.width ?? '  pixelWidth: 1179\n');
  return harness;
}

describe('screenshot', () => {
  it('returns a small JPEG in points by default', async () => {
    await withScreenshots();
    const result = await harness.ok('screenshot');
    const picture = result.content.find((item) => item.type === 'image');
    expect(picture?.mimeType).toBe('image/jpeg');
    expect(Buffer.from(picture?.data ?? '', 'base64').toString()).toBe('fake-image-bytes');
    expect(result.text).toBe(
      `Screenshot of ${DEVICE}. The image is in points: positions in it are the coordinates ui_tap and ui_swipe expect.`,
    );
    expect(harness.runner.matching('xcrun simctl io')[0]).toContain('screenshot --type=jpeg');
    expect(harness.runner.matching('sips --resampleWidth')[0]).toMatch(/^sips --resampleWidth 393 /);
  });

  it('returns native pixels on request and says how to convert them', async () => {
    await withScreenshots();
    const result = await harness.ok('screenshot', { resolution: 'full', format: 'png' });
    expect(result.content.find((item) => item.type === 'image')?.mimeType).toBe('image/png');
    expect(result.text).toContain('in pixels at 3x: divide positions by 3');
    expect(harness.runner.matching('sips')).toEqual([]);
  });

  it('falls back to pixels, and says so, when the image cannot be resized', async () => {
    await withScreenshots({ width: 'sips: unreadable' });
    const result = await harness.ok('screenshot');
    expect(result.text).toContain('in pixels at 3x');
  });

  it('falls back to pixels when the device scale is unknown', async () => {
    await withScreenshots({ scale: '' });
    const result = await harness.ok('screenshot');
    expect(result.text).toContain('The image is in pixels, not points: use ui_describe_screen');
    expect(harness.runner.matching('sips')).toEqual([]);
  });

  it('still captures when the scale lookup fails outright', async () => {
    await withScreenshots();
    harness.runner.fail('xcrun simctl list devicetypes', 'simctl exploded');
    const result = await harness.ok('screenshot');
    expect(result.content.some((item) => item.type === 'image')).toBe(true);
  });

  it('looks the device scale up only once', async () => {
    await withScreenshots();
    await harness.ok('screenshot');
    await harness.ok('screenshot');
    expect(harness.runner.matching('plutil -extract')).toHaveLength(1);
  });

  it('saves the image when given a path', async () => {
    await withScreenshots();
    const target = path.join(workspace, 'shots', 'home.jpeg');
    const result = await harness.ok('screenshot', { outputPath: target });
    expect(result.text).toContain(`Saved to ${target}.`);
    expect((await readFile(target)).toString()).toBe('fake-image-bytes');
  });

  it('reports a failing capture', async () => {
    await withScreenshots();
    harness.runner.fail('xcrun simctl io', 'Timeout waiting for screen surfaces');
    const result = await harness.call('screenshot');
    expect(result.text).toMatch(/^\[COMMAND_FAILED\]/);
    expect(result.text).toContain('Timeout waiting for screen surfaces');
  });

  it('warns that a black screen means the app is still loading', async () => {
    await withScreenshots();
    const tool = (await harness.tools()).find((entry) => entry.name === 'screenshot');
    expect(tool?.description).toMatch(/black.*still loading/);
  });
});

describe('screen recording', () => {
  it('records until stopped, one recording per device', async () => {
    harness = await Harness.start();
    const started = await harness.ok('start_recording', { codec: 'hevc' });
    expect(started.text).toMatch(/recording-iPhone_15-.*\.mp4/);
    expect(harness.runner.commandLines.at(-1)).toMatch(
      new RegExp(`^xcrun simctl io ${UDID.iphone15} recordVideo --codec=hevc --force .*\\.mp4$`),
    );

    expect((await harness.call('start_recording')).text).toMatch(/^\[RECORDING_ALREADY_ACTIVE\]/);

    const stopped = await harness.ok('stop_recording');
    expect(stopped.text).toContain('saved to');
    expect(harness.runner.background[0]?.hasExited).toBe(true);

    expect((await harness.call('stop_recording')).text).toMatch(/^\[NO_ACTIVE_RECORDING\]/);
  });

  it('records to the given path', async () => {
    harness = await Harness.start();
    const target = path.join(workspace, 'videos', 'demo.mp4');
    expect((await harness.ok('start_recording', { outputPath: target })).text).toContain(target);
    expect((await harness.ok('stop_recording')).text).toContain(target);
  });

  it('asks which recording to stop when two devices are being recorded', async () => {
    harness = await Harness.start();
    harness.runner.on('xcrun simctl list devices', deviceListJson([UDID.iphone15, UDID.ipad]));
    await harness.ok('start_recording', { device: 'iPhone 15' });
    await harness.ok('start_recording', { device: 'iPad Air' });
    expect((await harness.call('stop_recording')).text).toMatch(/^\[AMBIGUOUS_DEVICE\] Several recordings are active/);
    await harness.ok('stop_recording', { device: 'iPad Air' });
    expect(harness.runner.background.map((process) => process.hasExited)).toEqual([false, true]);
  });

  it('finishes pending recordings when the server shuts down', async () => {
    harness = await Harness.start();
    await harness.ok('start_recording');
    const recorder = harness.runner.background[0];
    await harness.stop();
    expect(recorder?.hasExited).toBe(true);
    harness = await Harness.start();
  });
});

describe('add_media', () => {
  it('adds existing files', async () => {
    harness = await Harness.start();
    const photo = path.join(workspace, 'photo.png');
    await writeFile(photo, 'png');
    const result = await harness.ok('add_media', { paths: [photo] });
    expect(result.text).toContain('Added 1 file(s)');
    expect(harness.runner.commandLines.at(-1)).toBe(`xcrun simctl addmedia ${UDID.iphone15} ${photo}`);
  });

  it('names the file that does not exist', async () => {
    harness = await Harness.start();
    const result = await harness.call('add_media', { paths: [path.join(workspace, 'ghost.png')] });
    expect(result.text).toMatch(/^\[PATH_NOT_FOUND\] ".*ghost\.png"/);
    expect(harness.runner.matching('xcrun simctl addmedia')).toEqual([]);
  });
});

describe('environment tools', () => {
  it('switches appearance', async () => {
    harness = await Harness.start();
    expect((await harness.ok('set_appearance', { appearance: 'dark' })).text).toBe(
      `${DEVICE} now uses the dark appearance.`,
    );
    expect(harness.runner.commandLines.at(-1)).toBe(`xcrun simctl ui ${UDID.iphone15} appearance dark`);
  });

  it('sets and clears the location', async () => {
    harness = await Harness.start();
    await harness.ok('set_location', { latitude: 40.4168, longitude: -3.7038 });
    await harness.ok('set_location', { clear: true });
    expect(harness.runner.matching('xcrun simctl location')).toEqual([
      `xcrun simctl location ${UDID.iphone15} set 40.4168,-3.7038`,
      `xcrun simctl location ${UDID.iphone15} clear`,
    ]);
  });

  it('accepts the equator and the prime meridian', async () => {
    harness = await Harness.start();
    await harness.ok('set_location', { latitude: 0, longitude: 0 });
    expect(harness.runner.commandLines.at(-1)).toContain('set 0,0');
  });

  it.each([{}, { latitude: 10 }, { longitude: 10 }])('needs both coordinates (%j)', async (args) => {
    harness = await Harness.start();
    const result = await harness.call('set_location', args);
    expect(result.text).toMatch(/^\[INVALID_ARGUMENT\] Provide both latitude and longitude/);
    expect(harness.runner.calls).toEqual([]);
  });

  it('overrides and clears the status bar', async () => {
    harness = await Harness.start();
    await harness.ok('set_status_bar', {
      time: '9:41',
      dataNetwork: 'wifi',
      wifiBars: 3,
      batteryState: 'charged',
      batteryLevel: 100,
    });
    await harness.ok('set_status_bar', { clear: true });
    expect(harness.runner.matching('xcrun simctl status_bar')).toEqual([
      `xcrun simctl status_bar ${UDID.iphone15} override --time 9:41 --dataNetwork wifi --wifiBars 3 --batteryState charged --batteryLevel 100`,
      `xcrun simctl status_bar ${UDID.iphone15} clear`,
    ]);
  });

  it('needs at least one status bar value', async () => {
    harness = await Harness.start();
    expect((await harness.call('set_status_bar', {})).text).toMatch(/^\[INVALID_ARGUMENT\]/);
  });

  it('changes permissions', async () => {
    harness = await Harness.start();
    const granted = await harness.ok('set_permission', {
      action: 'grant',
      service: 'photos',
      bundleId: 'com.example.app',
    });
    expect(granted.text).toBe(`Permission "photos" granted for com.example.app on ${DEVICE}.`);
    expect((await harness.ok('set_permission', { action: 'reset', service: 'all' })).text).toBe(
      `Permission "all" reset on ${DEVICE}.`,
    );
    expect(harness.runner.matching('xcrun simctl privacy')).toEqual([
      `xcrun simctl privacy ${UDID.iphone15} grant photos com.example.app`,
      `xcrun simctl privacy ${UDID.iphone15} reset all`,
    ]);
  });

  it('requires a bundle id to grant or revoke', async () => {
    harness = await Harness.start();
    for (const action of ['grant', 'revoke']) {
      expect((await harness.call('set_permission', { action, service: 'photos' })).text).toMatch(
        /^\[INVALID_ARGUMENT\] A bundleId is required/,
      );
    }
  });
});

describe('push notifications', () => {
  it('sends the payload through standard input, custom keys included', async () => {
    harness = await Harness.start();
    const payload = { aps: { alert: { title: 'Hola', body: 'Señal recibida' }, badge: 1 }, orderId: 42 };
    await harness.ok('send_push_notification', { bundleId: 'com.example.app', payload });
    const push = harness.runner.calls.at(-1);
    expect(push?.commandLine).toBe(`xcrun simctl push ${UDID.iphone15} com.example.app -`);
    expect(JSON.parse(push?.stdin ?? '')).toEqual(payload);
  });

  it('explains what "not authorized" means', async () => {
    harness = await Harness.start();
    harness.runner.fail('xcrun simctl push', 'Source is not authorized');
    const result = await harness.call('send_push_notification', {
      bundleId: 'com.example.app',
      payload: { aps: { alert: 'Hi' } },
    });
    expect(result.text).toContain('Source is not authorized');
    expect(result.text).toContain('Hint: com.example.app is not allowed to show notifications');
    expect(result.text).toContain('request notification permission');
  });
});

describe('clipboard', () => {
  it('copies text the keyboard cannot type', async () => {
    harness = await Harness.start();
    const result = await harness.ok('set_clipboard', { text: 'Añadir canción 🎵' });
    expect(result.text).toBe(`Copied 16 character(s) to the clipboard of ${DEVICE}.`);
    expect(harness.runner.calls.at(-1)).toMatchObject({
      commandLine: `xcrun simctl pbcopy ${UDID.iphone15}`,
      stdin: 'Añadir canción 🎵',
    });
  });

  it('reads the clipboard back', async () => {
    harness = await Harness.start();
    harness.runner.on('xcrun simctl pbpaste', 'copiado');
    expect((await harness.ok('get_clipboard')).text).toBe('copiado');
  });

  it('says so when the clipboard is empty', async () => {
    harness = await Harness.start();
    expect((await harness.ok('get_clipboard')).text).toBe('(the clipboard is empty)');
  });

  it('can clear the clipboard with an empty string', async () => {
    harness = await Harness.start();
    await harness.ok('set_clipboard', { text: '' });
    expect(harness.runner.calls.at(-1)?.stdin).toBe('');
  });
});

describe('logs', () => {
  it('builds a predicate from the filters and keeps the most recent lines', async () => {
    harness = await Harness.start();
    harness.runner.on('xcrun simctl spawn', 'Timestamp Ty Process\none\ntwo\nthree\n');
    const result = await harness.ok('get_logs', { processName: 'MyApp', messageContains: 'err"or', maxLines: 2 });
    expect(result.text).toBe('(1 older line(s) omitted)\ntwo\nthree');
    expect(harness.runner.calls.at(-1)?.args).toEqual([
      'simctl', 'spawn', UDID.iphone15, 'log', 'show', '--style', 'compact', '--last', '1m',
      '--predicate', 'process == "MyApp" AND eventMessage CONTAINS[c] "err\\"or"',
    ]);
  });

  it('returns everything when it fits', async () => {
    harness = await Harness.start();
    harness.runner.on('xcrun simctl spawn', 'one\ntwo\n');
    expect((await harness.ok('get_logs', { minutes: 5 })).text).toBe('one\ntwo');
    expect(harness.runner.calls.at(-1)?.args).toContain('5m');
  });

  it('says when nothing matched', async () => {
    harness = await Harness.start();
    expect((await harness.ok('get_logs')).text).toBe(`No log entries matched on ${DEVICE}.`);
  });
});
