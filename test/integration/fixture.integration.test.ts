import { mkdir, writeFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hasIdb, isMac, Session, sleep, type Outcome } from './support.js';

/**
 * Exercises the server against an app we control (test/fixtures/app), built
 * by the CI job and passed in through FIXTURE_APP. Unlike Apple's apps, its
 * layout does not change between iOS versions, so these tests can assert on
 * what the app shows after each interaction.
 *
 * This file sorts before the generic simulator suite, which is the one that
 * shuts the simulator down at the end.
 */
const fixtureApp = process.env['FIXTURE_APP'];
const BUNDLE_ID = 'dev.spl.mcpfixture';
const canRun = isMac && hasIdb && Boolean(fixtureApp);

describe.skipIf(!canRun)('fixture app on a real simulator', () => {
  const session = new Session();

  /** Brings the app to a known state: freshly launched, at the top, empty field. */
  async function relaunch(): Promise<void> {
    await session.ok('launch_app', { bundleId: BUNDLE_ID, terminateRunning: true });
    await session.ok('ui_wait_for_element', { identifier: 'name.field', timeoutSeconds: 60 });
  }

  beforeAll(async () => {
    await session.start();
    await session.ok('open_simulator_app');
    await sleep(10_000);
    await session.ok('install_app', { appPath: fixtureApp });
    try {
      await relaunch();
    } catch (error) {
      await session.attempt('screenshot', { format: 'png', outputPath: 'artifacts/fixture-setup-failure.png' });
      throw error;
    }
  });

  afterAll(async () => {
    await session.stop();
  });

  it('shows up among the user apps once installed', async () => {
    const { text } = await session.ok('list_apps', { type: 'User' });
    expect(text).toContain(`${BUNDLE_ID}  MCP Fixture`);
  });

  it('describes its screen with labels and identifiers', async () => {
    const { text } = await session.ok('ui_describe_screen');
    console.log(`FIXTURE SCREEN:\n${text}`);
    expect(text).toMatch(/id=name\.field/);
    expect(text).toMatch(/Button "Increment" id=increment\.button @\(\d+,\d+\)/);
  });

  it('types plain text into a field', async () => {
    const { text } = await session.ok('ui_sequence', {
      steps: [
        { action: 'tap_element', identifier: 'name.field' },
        { action: 'type_text', text: 'hello world' },
        { action: 'wait_for_element', label: 'Echo: hello world', timeoutSeconds: 10 },
      ],
    });
    expect(text).toContain('Ran 3 of 3 step(s)');
  });

  it('pastes text the keyboard cannot type', async () => {
    await relaunch();
    const text = 'Añadir canción 🎵';
    const result = await session.attempt('ui_paste_text', { text, identifier: 'name.field', describeAfter: true });
    console.log(`PASTE RESULT (${result.isError ? 'error' : 'ok'}):\n${result.text}`);
    if (result.isError) {
      await session.attempt('screenshot', { format: 'png', outputPath: 'artifacts/paste-failure.png' });
    }
    expect(result.isError).toBe(false);
    await session.ok('ui_wait_for_element', { label: `Echo: ${text}`, timeoutSeconds: 10 });
  });

  it('pastes as a step of a sequence', async () => {
    await relaunch();
    const { text } = await session.ok('ui_sequence', {
      steps: [
        { action: 'paste_text', text: 'José Muñoz', identifier: 'name.field' },
        { action: 'wait_for_element', label: 'Echo: José Muñoz', timeoutSeconds: 10 },
      ],
    });
    expect(text).toContain('Ran 2 of 2 step(s)');
  });

  it('taps elements by text and sees the result in the same call', async () => {
    await relaunch();
    const { text } = await session.ok('ui_sequence', {
      steps: [
        { action: 'tap_element', label: 'Increment' },
        { action: 'tap_element', label: 'Increment' },
        { action: 'tap_element', identifier: 'increment.button' },
      ],
      describeAfter: true,
    });
    expect(text).toContain('"Taps: 3"');
  });

  it('scrolls to an element far down a list, and back up', async () => {
    await relaunch();
    const down = await session.ok('ui_scroll_to_element', { label: 'Row 55', maxSwipes: 30 });
    console.log(`SCROLL DOWN: ${down.text} (${Math.round(down.ms)} ms)`);
    expect(down.text).toContain('-> ');
    expect(down.text).toContain('"Row 55"');

    const up = await session.ok('ui_scroll_to_element', { identifier: 'name.field', direction: 'up', maxSwipes: 30 });
    expect(up.text).toContain('id=name.field');
  });

  it('gives up cleanly on an element that is not in the list', async () => {
    await relaunch();
    const result = await session.attempt('ui_scroll_to_element', { label: 'Row 999', maxSwipes: 40 });
    expect(result.text).toMatch(/^\[ELEMENT_NOT_FOUND\]/);
    expect(result.text).toContain('Row 60');
  });

  it('opens a deep link handled by the app', async () => {
    await relaunch();
    await session.ok('open_url', { url: 'mcpfixture://hello/42' });
    const result = await session.attempt('ui_wait_for_element', {
      label: 'URL: mcpfixture://hello/42',
      timeoutSeconds: 15,
    });
    console.log(`DEEP LINK (${result.isError ? 'not confirmed' : 'ok'}): ${result.text.split('\n')[0]}`);
    if (result.isError) {
      // Some iOS versions ask the user to confirm opening another app.
      await session.attempt('ui_tap_element', { label: 'Open', timeoutSeconds: 5 });
      await session.ok('ui_wait_for_element', { label: 'URL: mcpfixture://hello/42', timeoutSeconds: 15 });
    }
  });

  it('grants a permission and delivers a push notification', async () => {
    await relaunch();
    await session.ok('set_permission', { action: 'grant', service: 'photos', bundleId: BUNDLE_ID });
    await relaunch();

    const before = await session.attempt('send_push_notification', {
      bundleId: BUNDLE_ID,
      payload: { aps: { alert: { title: 'Hola', body: 'Señal de prueba' } } },
    });
    console.log(`PUSH BEFORE PERMISSION (${before.isError ? 'error' : 'ok'}): ${before.text}`);

    await session.ok('ui_tap_element', { identifier: 'notifications.button' });
    const allowed = await session.attempt('ui_tap_element', { label: 'Allow', timeoutSeconds: 10 });
    console.log(`ALLOW PROMPT (${allowed.isError ? 'not found' : 'tapped'}): ${allowed.text.split('\n')[0]}`);

    const state = await session.attempt('ui_wait_for_element', {
      label: 'Notifications: granted',
      timeoutSeconds: 10,
    });
    const after = await session.attempt('send_push_notification', {
      bundleId: BUNDLE_ID,
      payload: { aps: { alert: { title: 'Hola', body: 'Señal de prueba' }, badge: 1 } },
    });
    console.log(`PUSH AFTER PERMISSION (${after.isError ? 'error' : 'ok'}): ${after.text}`);

    // With permission granted the push must be delivered; without it, the error must explain why.
    if (!state.isError) {
      expect(after.isError).toBe(false);
    } else if (after.isError) {
      expect(after.text).toContain('Hint:');
    }
  });

  it('measures what the speed features save', async () => {
    await relaunch();
    const rows: string[] = [];
    const average = async (times: number, action: () => Promise<Outcome>): Promise<number> => {
      let total = 0;
      for (let index = 0; index < times; index += 1) {
        total += (await action()).ms;
      }
      return Math.round(total / times);
    };

    // The same job done three ways: press "Increment" three times.
    const tapPoint = /Button "Increment".*@\((\d+),(\d+)\)/.exec((await session.ok('ui_describe_screen')).text);
    const [x, y] = [Number(tapPoint?.[1]), Number(tapPoint?.[2])];

    let started = performance.now();
    for (let index = 0; index < 3; index += 1) {
      await session.ok('ui_describe_screen');
      await session.ok('ui_tap', { x, y });
    }
    rows.push(`| describe + tap by coordinates | 6 | ${Math.round(performance.now() - started)} |`);

    started = performance.now();
    for (let index = 0; index < 3; index += 1) {
      await session.ok('ui_tap_element', { label: 'Increment' });
    }
    rows.push(`| ui_tap_element | 3 | ${Math.round(performance.now() - started)} |`);

    started = performance.now();
    await session.ok('ui_sequence', {
      steps: Array.from({ length: 3 }, () => ({ action: 'tap_element', label: 'Increment' })),
    });
    rows.push(`| ui_sequence | 1 | ${Math.round(performance.now() - started)} |`);

    // Cost of the individual operations.
    const describeMs = await average(5, () => session.ok('ui_describe_screen'));
    const tapMs = await average(5, () => session.ok('ui_tap', { x, y }));
    const listMs = await average(3, () => session.call('list_devices'));
    const cheapMs = await average(5, () => session.ok('get_clipboard'));

    // Size of what is sent back to the model.
    const screen = await session.ok('ui_describe_screen');
    const full = await session.ok('screenshot', { resolution: 'full' });
    const points = await session.ok('screenshot');
    const bytes = (shot: Outcome): number =>
      Buffer.from(shot.content.find((item) => item.type === 'image')?.data ?? '', 'base64').length;

    const report = [
      `# Measurements on ${session.deviceName}`,
      '',
      '## Pressing a button three times',
      '',
      '| Approach | Tool calls | Server time (ms) |',
      '| --- | --- | --- |',
      ...rows,
      '',
      '## Single operations (average, ms)',
      '',
      '| Operation | ms |',
      '| --- | --- |',
      `| ui_describe_screen (one idb call) | ${describeMs} |`,
      `| ui_tap (one idb call) | ${tapMs} |`,
      `| list_devices (what the device cache saves per call) | ${listMs} |`,
      `| get_clipboard (one simctl call, device cached) | ${cheapMs} |`,
      '',
      '## Response sizes',
      '',
      '| Response | Size |',
      '| --- | --- |',
      `| ui_describe_screen | ${screen.text.length} characters |`,
      `| screenshot, full resolution (JPEG) | ${bytes(full)} bytes |`,
      `| screenshot, points (JPEG) | ${bytes(points)} bytes |`,
      '',
    ].join('\n');

    console.log(`BENCHMARK START\n${report}\nBENCHMARK END`);
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/benchmark.md', report);
    expect(bytes(points)).toBeLessThan(bytes(full));
  });

  it('can be uninstalled, after which launching it is explained', async () => {
    await session.ok('uninstall_app', { bundleId: BUNDLE_ID });
    const result = await session.attempt('launch_app', { bundleId: BUNDLE_ID });
    expect(result.text).toMatch(/^\[APP_NOT_INSTALLED\]/);
  });
});
