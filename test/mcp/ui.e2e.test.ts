import { afterEach, describe, expect, it } from 'vitest';

import { HOME_SCREEN, idbNode, LOGIN_SCREEN } from '../support/elements.js';
import { UDID } from '../support/FakeCommandRunner.js';
import { Harness } from '../support/Harness.js';

const DEVICE = `iPhone 15 (iOS 17.5, ${UDID.iphone15})`;
const IDB = `--udid ${UDID.iphone15}`;

let harness: Harness;

afterEach(async () => {
  await harness.stop();
});

/** Starts a harness whose screen reads return the given screens in turn (the last one repeats). */
async function withScreens(...screens: unknown[][]): Promise<Harness> {
  harness = await Harness.start();
  let reads = 0;
  harness.runner.on('idb ui describe-all', () => {
    const screen = screens[Math.min(reads, screens.length - 1)];
    reads += 1;
    return JSON.stringify(screen);
  });
  return harness;
}

const idbCalls = (): string[] => harness.runner.matching('idb').map((line) => line.replace(`${IDB} `, ''));

describe('reading the screen', () => {
  it('lists labeled elements one per line with their tap point', async () => {
    await withScreens(LOGIN_SCREEN);
    const result = await harness.ok('ui_describe_screen');
    expect(result.text).toBe(
      [
        `Screen of ${DEVICE}: 4 element(s).`,
        'Format: Type "label" value="…" id=identifier @(x,y to tap) WIDTHxHEIGHT, in points.',
        'StaticText "Welcome" @(195,120) 350x40',
        'TextField "Email" id=login.email @(195,300) 350x40',
        'SecureTextField "Password" id=login.password @(195,360) 350x40',
        'Button "Sign in" id=login.submit @(195,725) 350x50',
      ].join('\n'),
    );
  });

  it('is far smaller than the JSON it replaces', async () => {
    await withScreens(LOGIN_SCREEN);
    const compact = (await harness.ok('ui_describe_screen')).text.length;
    expect(compact).toBeLessThan(JSON.stringify(LOGIN_SCREEN, null, 2).length / 2);
  });

  it('can include unlabeled containers', async () => {
    await withScreens(LOGIN_SCREEN);
    const result = await harness.ok('ui_describe_screen', { includeUnlabeled: true });
    expect(result.text).toContain('5 element(s)');
    expect(result.text).toContain('Application @(195,422) 390x844');
  });

  it('filters by text', async () => {
    await withScreens(LOGIN_SCREEN);
    const result = await harness.ok('ui_describe_screen', { containing: 'LOGIN.' });
    expect(result.text).toContain('3 element(s)');
    expect(result.text).not.toContain('Welcome');
  });

  it('reports an empty screen explicitly', async () => {
    await withScreens([]);
    expect((await harness.ok('ui_describe_screen')).text).toContain('(no labeled elements)');
  });

  it('describes the element at a point', async () => {
    harness = await Harness.start();
    harness.runner.on('idb ui describe-point', JSON.stringify(idbNode('Button', 'Sign in', [20, 700, 350, 50])));
    expect((await harness.ok('ui_describe_point', { x: 100, y: 710 })).text).toBe('Button "Sign in" @(195,725) 350x50');
    harness.runner.on('idb ui describe-point', '');
    expect((await harness.ok('ui_describe_point', { x: 1, y: 1 })).text).toBe('No accessibility element at (1, 1).');
  });

  it('explains what to do when idb cannot read a windowless simulator', async () => {
    harness = await Harness.start();
    harness.runner.fail('idb ui describe-all', 'No translation object returned for simulator.');
    const result = await harness.call('ui_describe_screen');
    expect(result.text).toMatch(/^\[COMMAND_FAILED\]/);
    expect(result.text).toContain('Hint: idb reads the screen through the Simulator app');
  });
});

describe('tapping by text', () => {
  it('finds and taps an element in a single call', async () => {
    await withScreens(LOGIN_SCREEN);
    const result = await harness.ok('ui_tap_element', { label: 'sign in' });
    expect(result.text).toBe(
      `Done on ${DEVICE}: tap_element label "sign in" -> Button "Sign in" id=login.submit @(195,725) 350x50.`,
    );
    expect(idbCalls()).toEqual(['idb ui describe-all --udid ' + UDID.iphone15, 'idb ui tap 195 725']);
  });

  it('accepts an identifier, a type and an index', async () => {
    await withScreens(LOGIN_SCREEN);
    await harness.ok('ui_tap_element', { identifier: 'login.email' });
    await harness.ok('ui_tap_element', { type: 'SecureTextField' });
    await harness.ok('ui_tap_element', { label: 'e', index: 1 });
    expect(harness.runner.matching('idb ui tap')).toEqual([
      `idb ui tap ${IDB} 195 300`,
      `idb ui tap ${IDB} 195 360`,
      `idb ui tap ${IDB} 195 300`,
    ]);
  });

  it('long-presses when given a duration', async () => {
    await withScreens(LOGIN_SCREEN);
    await harness.ok('ui_tap_element', { label: 'Email', durationSeconds: 1 });
    expect(harness.runner.matching('idb ui tap')).toEqual([`idb ui tap ${IDB} --duration 1 195 300`]);
  });

  it('waits for the element to appear', async () => {
    await withScreens(LOGIN_SCREEN, LOGIN_SCREEN, HOME_SCREEN);
    await harness.ok('ui_tap_element', { label: 'Log out' });
    expect(harness.runner.matching('idb ui describe-all')).toHaveLength(3);
    expect(harness.clock.sleeps).toEqual([400, 400]);
    expect(harness.runner.matching('idb ui tap')).toEqual([`idb ui tap ${IDB} 195 725`]);
  });

  it('reports what is on screen when the element never appears', async () => {
    await withScreens(LOGIN_SCREEN);
    const result = await harness.call('ui_tap_element', { label: 'Register', timeoutSeconds: 1 });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/^\[ELEMENT_NOT_FOUND\] No element on screen matches label "register"/);
    expect(result.text).toContain('Button "Sign in" id=login.submit @(195,725) 350x50');
    expect(harness.runner.matching('idb ui tap')).toEqual([]);
  });

  it('lists the candidates of an ambiguous query so the next call can pick one', async () => {
    await withScreens([...LOGIN_SCREEN, idbNode('Button', 'Sign in', [20, 780, 350, 50])]);
    const result = await harness.call('ui_tap_element', { label: 'Sign in' });
    expect(result.text).toMatch(/^\[AMBIGUOUS_ELEMENT\] 2 elements match/);
    expect(result.text).toContain('0: Button "Sign in" id=login.submit @(195,725) 350x50');
    expect(result.text).toContain('1: Button "Sign in" @(195,805) 350x50');
    expect((await harness.ok('ui_tap_element', { label: 'Sign in', index: 1 })).text).toContain('@(195,805)');
  });

  it('requires some description of the element', async () => {
    await withScreens(LOGIN_SCREEN);
    const result = await harness.call('ui_tap_element', {});
    expect(result.text).toMatch(/^\[INVALID_ARGUMENT\] Describe the element/);
    expect(harness.runner.calls).toEqual([]);
  });

  it('waits for an element without tapping it', async () => {
    await withScreens(LOGIN_SCREEN, HOME_SCREEN);
    const result = await harness.ok('ui_wait_for_element', { label: 'Dashboard', timeoutSeconds: 5 });
    expect(result.text).toContain('wait_for_element label "dashboard" -> StaticText "Dashboard" @(195,120) 350x40');
    expect(harness.runner.matching('idb ui tap')).toEqual([]);
  });
});

describe('getting the resulting screen back', () => {
  it('appends the screen after the action when asked', async () => {
    await withScreens(LOGIN_SCREEN, HOME_SCREEN);
    const result = await harness.ok('ui_tap_element', { label: 'Sign in', describeAfter: true });
    expect(result.text).toBe(
      [
        `Done on ${DEVICE}: tap_element label "sign in" -> Button "Sign in" id=login.submit @(195,725) 350x50.`,
        '',
        'Screen now (2 element(s)):',
        'StaticText "Dashboard" @(195,120) 350x40',
        'Button "Log out" @(195,725) 350x50',
      ].join('\n'),
    );
    expect(harness.clock.sleeps).toEqual([600]);
  });

  it.each([
    ['ui_tap', { x: 10, y: 20 }],
    ['ui_swipe', { fromX: 1, fromY: 2, toX: 3, toY: 4 }],
    ['ui_type_text', { text: 'hello' }],
    ['ui_press_button', { button: 'HOME' }],
    ['ui_press_key', { keyCode: 40 }],
  ])('is supported by %s', async (name, args) => {
    await withScreens(HOME_SCREEN);
    const result = await harness.ok(name, { ...args, describeAfter: true });
    expect(result.text).toContain('Screen now (2 element(s)):');
  });

  it('is off by default, costing no extra read', async () => {
    await withScreens(HOME_SCREEN);
    const result = await harness.ok('ui_tap', { x: 10, y: 20 });
    expect(result.text).toBe(`Done on ${DEVICE}: tap (10, 20).`);
    expect(harness.runner.matching('idb ui describe-all')).toEqual([]);
  });
});

describe('basic gestures', () => {
  it('taps at whole points', async () => {
    harness = await Harness.start();
    await harness.ok('ui_tap', { x: 100.4, y: 200.6, durationSeconds: 1 });
    expect(idbCalls()).toEqual(['idb ui tap --duration 1 100 201']);
  });

  it('swipes with its tuning options', async () => {
    harness = await Harness.start();
    const result = await harness.ok('ui_swipe', {
      fromX: 200,
      fromY: 600,
      toX: 200,
      toY: 300,
      durationSeconds: 0.3,
      stepSize: 5,
    });
    expect(result.text).toContain('swipe (200, 600) to (200, 300)');
    expect(idbCalls()).toEqual(['idb ui swipe --duration 0.3 --delta 5 200 600 200 300']);
  });

  it('presses buttons and keys', async () => {
    harness = await Harness.start();
    await harness.ok('ui_press_button', { button: 'HOME' });
    await harness.ok('ui_press_key', { keyCode: 42 });
    expect(idbCalls()).toEqual(['idb ui button HOME', 'idb ui key 42']);
  });

  it('documents that edge swipes do not trigger system gestures', async () => {
    harness = await Harness.start();
    const swipe = (await harness.tools()).find((tool) => tool.name === 'ui_swipe');
    expect(swipe?.description).toMatch(/edge.*Notification Center/s);
  });
});

describe('typing', () => {
  it('types plain text', async () => {
    harness = await Harness.start();
    const result = await harness.ok('ui_type_text', { text: 'ana@example.com' });
    expect(result.text).toContain('type_text (15 characters)');
    expect(harness.runner.calls.at(-1)?.args).toEqual(['ui', 'text', '--udid', UDID.iphone15, '--', 'ana@example.com']);
  });

  it('does not echo what was typed, which may be a password', async () => {
    harness = await Harness.start();
    expect((await harness.ok('ui_type_text', { text: 'hunter2' })).text).not.toContain('hunter2');
  });

  it('turns line breaks into Return presses', async () => {
    harness = await Harness.start();
    await harness.ok('ui_type_text', { text: 'first\nsecond' });
    expect(idbCalls()).toEqual(['idb ui text -- first', 'idb ui key 40', 'idb ui text -- second']);
  });

  it.each(['España', 'canción', 'ok 👍'])('refuses %j with a workaround instead of a traceback', async (text) => {
    harness = await Harness.start();
    const result = await harness.call('ui_type_text', { text });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/^\[UNSUPPORTED_TEXT\] Cannot type/);
    expect(result.text).toContain('set_clipboard');
    expect(result.text).not.toContain('Traceback');
    expect(harness.runner.matching('idb')).toEqual([]);
  });

  it('strips the Python traceback from any other idb failure', async () => {
    harness = await Harness.start();
    harness.runner.fail(
      'idb ui text',
      'Traceback (most recent call last):\n  File "/opt/idb/cli.py", line 10, in main\n    run()\nRuntimeError: no keyboard focus\n',
    );
    const result = await harness.call('ui_type_text', { text: 'hello' });
    expect(result.text).toContain('RuntimeError: no keyboard focus');
    expect(result.text).not.toContain('Traceback');
    expect(result.text).not.toContain('cli.py');
  });

  it('warns about the limitation in the tool description', async () => {
    harness = await Harness.start();
    const tool = (await harness.tools()).find((entry) => entry.name === 'ui_type_text');
    expect(tool?.description).toMatch(/only unaccented Latin.*set_clipboard/s);
  });
});

describe('sequences', () => {
  const signIn = [
    { action: 'tap_element', label: 'Email' },
    { action: 'type_text', text: 'ana@example.com' },
    { action: 'tap_element', identifier: 'login.password' },
    { action: 'type_text', text: 'secret' },
    { action: 'tap_element', label: 'Sign in' },
    { action: 'wait_for_element', label: 'Dashboard' },
  ];

  it('runs a whole login flow in one call', async () => {
    await withScreens(LOGIN_SCREEN, LOGIN_SCREEN, LOGIN_SCREEN, HOME_SCREEN);
    const result = await harness.ok('ui_sequence', { steps: signIn });
    expect(result.text).toBe(
      [
        `Ran 6 of 6 step(s) on ${DEVICE}.`,
        '1. tap_element label "email" -> TextField "Email" id=login.email @(195,300) 350x40',
        '2. type_text (15 characters)',
        '3. tap_element identifier "login.password" -> SecureTextField "Password" id=login.password @(195,360) 350x40',
        '4. type_text (6 characters)',
        '5. tap_element label "sign in" -> Button "Sign in" id=login.submit @(195,725) 350x50',
        '6. wait_for_element label "dashboard" -> StaticText "Dashboard" @(195,120) 350x40',
      ].join('\n'),
    );
    expect(harness.runner.matching('idb').filter((line) => !line.includes('describe-all'))).toEqual([
      `idb ui tap ${IDB} 195 300`,
      `idb ui text ${IDB} -- ana@example.com`,
      `idb ui tap ${IDB} 195 360`,
      `idb ui text ${IDB} -- secret`,
      `idb ui tap ${IDB} 195 725`,
    ]);
  });

  it('resolves the device once for the whole sequence', async () => {
    await withScreens(LOGIN_SCREEN, LOGIN_SCREEN, LOGIN_SCREEN, HOME_SCREEN);
    await harness.ok('ui_sequence', { steps: signIn });
    expect(harness.runner.matching('xcrun simctl list devices')).toHaveLength(1);
  });

  it('supports every kind of step', async () => {
    await withScreens(LOGIN_SCREEN);
    const result = await harness.ok('ui_sequence', {
      steps: [
        { action: 'tap', x: 10, y: 20 },
        { action: 'swipe', fromX: 1, fromY: 2, toX: 3, toY: 4, durationSeconds: 0.5 },
        { action: 'press_button', button: 'HOME' },
        { action: 'press_key', keyCode: 40 },
        { action: 'wait', seconds: 2 },
      ],
    });
    expect(result.text).toContain('1. tap (10, 20)\n2. swipe (1, 2) to (3, 4)\n3. press_button HOME\n4. press_key 40\n5. wait 2s');
    expect(harness.clock.sleeps).toEqual([2000]);
    expect(idbCalls()).toEqual([
      'idb ui tap 10 20',
      'idb ui swipe --duration 0.5 1 2 3 4',
      'idb ui button HOME',
      'idb ui key 40',
    ]);
  });

  it('stops at the failing step and reports progress, the error and the screen', async () => {
    await withScreens(LOGIN_SCREEN);
    const result = await harness.call('ui_sequence', {
      steps: [
        { action: 'tap_element', label: 'Email' },
        { action: 'tap_element', label: 'Continue', timeoutSeconds: 0 },
        { action: 'type_text', text: 'never typed' },
      ],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain(`Ran 1 of 3 step(s) on ${DEVICE}.`);
    expect(result.text).toContain('1. tap_element label "email"');
    expect(result.text).toContain('Step 2 failed: [ELEMENT_NOT_FOUND]');
    expect(result.text).toContain('Screen now (4 element(s)):');
    expect(harness.runner.matching('idb ui text')).toEqual([]);
  });

  it('refuses untypeable text at the step that needs it, having run the previous ones', async () => {
    await withScreens(LOGIN_SCREEN);
    const result = await harness.call('ui_sequence', {
      steps: [
        { action: 'tap_element', label: 'Email' },
        { action: 'type_text', text: 'señor' },
      ],
    });
    expect(result.text).toContain('Step 2 failed: [UNSUPPORTED_TEXT]');
    expect(harness.runner.matching('idb ui tap')).toHaveLength(1);
  });

  it('returns the final screen on request', async () => {
    await withScreens(LOGIN_SCREEN, HOME_SCREEN);
    const result = await harness.ok('ui_sequence', {
      steps: [{ action: 'tap_element', label: 'Sign in' }],
      describeAfter: true,
    });
    expect(result.text).toContain('Screen now (2 element(s)):\nStaticText "Dashboard"');
  });

  it('rejects a step that describes no element before running anything', async () => {
    await withScreens(LOGIN_SCREEN);
    const result = await harness.call('ui_sequence', {
      steps: [{ action: 'tap', x: 1, y: 1 }, { action: 'tap_element' }],
    });
    expect(result.text).toMatch(/^\[INVALID_ARGUMENT\]/);
    expect(harness.runner.calls).toEqual([]);
  });

  it('accepts up to fifty steps', async () => {
    harness = await Harness.start();
    const step = { action: 'press_key', keyCode: 42 };
    expect((await harness.ok('ui_sequence', { steps: Array(50).fill(step) })).text).toContain('Ran 50 of 50');
    expect((await harness.call('ui_sequence', { steps: Array(51).fill(step) })).isError).toBe(true);
  });
});
