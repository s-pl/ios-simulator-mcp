import { describe, expect, it } from 'vitest';

import { UiService } from '../../src/application/UiService.js';
import { ElementQuery } from '../../src/domain/ElementQuery.js';
import {
  AmbiguousElementError,
  DeviceNotBootedError,
  ElementNotFoundError,
  PasteUnavailableError,
  UnsupportedTextError,
} from '../../src/domain/errors.js';
import { Point } from '../../src/domain/geometry.js';
import type { UiStep } from '../../src/domain/ui.js';
import { element } from '../support/elements.js';
import { FakeClock } from '../support/FakeClock.js';
import {
  commandFailure,
  device,
  FakeDeviceGateway,
  FakeEnvironmentGateway,
  FakeUiGateway,
  resolverFor,
} from '../support/fakes.js';

const container = element('Application', undefined, [0, 0, 390, 844]);
const email = element('TextField', 'Email', [20, 280, 350, 40]);
const signIn = element('Button', 'Sign in', [20, 700, 350, 50]);
const dashboard = element('StaticText', 'Dashboard', [20, 100, 350, 40]);
const login = [container, email, signIn];
const home = [container, dashboard];

function setUp(booted = true) {
  const devices = new FakeDeviceGateway([device('iPhone 15', 'UDID', booted ? 'Booted' : 'Shutdown')]);
  const ui = new FakeUiGateway();
  ui.screens = [login];
  const clock = new FakeClock();
  const clipboard = new FakeEnvironmentGateway();
  const service = new UiService(ui, clipboard, resolverFor(devices).resolver, clock);
  return { service, ui, clock, devices, clipboard };
}

const tapSignIn: UiStep = { kind: 'tapElement', query: new ElementQuery({ label: 'Sign in' }) };

describe('UiService', () => {
  describe('single steps', () => {
    it('taps at whole points', async () => {
      const { service, ui } = setUp();
      await service.perform({ kind: 'tap', point: new Point(10.6, 20.2), durationSeconds: 2 });
      expect(ui.calls).toEqual(['tap 11,20 2s']);
    });

    it('swipes at whole points', async () => {
      const { service, ui } = setUp();
      await service.perform({ kind: 'swipe', from: new Point(1.5, 2.5), to: new Point(3.4, 4.4) });
      expect(ui.calls).toEqual(['swipe 2,3 3,4']);
    });

    it('presses buttons and keys', async () => {
      const { service, ui } = setUp();
      await service.perform({ kind: 'pressButton', button: 'HOME' });
      await service.perform({ kind: 'pressKey', keyCode: 42 });
      expect(ui.calls).toEqual(['button HOME', 'key 42']);
    });

    it('waits without touching the device', async () => {
      const { service, ui, clock } = setUp();
      await service.perform({ kind: 'wait', seconds: 1.5 });
      expect(clock.sleeps).toEqual([1500]);
      expect(ui.calls).toEqual([]);
    });

    it('requires a booted simulator', async () => {
      const { service } = setUp(false);
      await expect(service.perform({ kind: 'pressButton', button: 'HOME' }, {}, 'UDID')).rejects.toBeInstanceOf(
        DeviceNotBootedError,
      );
    });

    it('throws the failure of a single step', async () => {
      const { service, ui } = setUp();
      ui.failOn = { call: 'button', error: commandFailure('idb exploded') };
      await expect(service.perform({ kind: 'pressButton', button: 'HOME' })).rejects.toThrow('idb exploded');
    });
  });

  describe('tapping an element', () => {
    it('taps the centre of the matching element and reports it', async () => {
      const { service, ui } = setUp();
      const { value } = await service.perform(tapSignIn);
      expect(ui.calls).toEqual(['tap 195,725']);
      expect(value.outcomes[0]?.element).toBe(signIn);
    });

    it('reads the screen once when the element is already there', async () => {
      const { service, ui, clock } = setUp();
      await service.perform(tapSignIn);
      expect(ui.describeCount).toBe(1);
      expect(clock.sleeps).toEqual([]);
    });

    it('waits for an element that appears after a transition', async () => {
      const { service, ui, clock } = setUp();
      ui.screens = [[container], [container], login];
      await service.perform(tapSignIn);
      expect(ui.describeCount).toBe(3);
      expect(clock.sleeps).toEqual([400, 400]);
      expect(ui.calls).toEqual(['tap 195,725']);
    });

    it('gives up after the timeout, listing what is on screen', async () => {
      const { service, ui } = setUp();
      const failure = service.perform({
        kind: 'tapElement',
        query: new ElementQuery({ label: 'Register' }),
        timeoutSeconds: 2,
      });
      await expect(failure).rejects.toBeInstanceOf(ElementNotFoundError);
      await expect(failure).rejects.toThrow(/TextField "Email".*\n.*Button "Sign in"/);
      // 2 s at 400 ms per poll: 6 reads, the last one at the deadline.
      expect(ui.describeCount).toBe(6);
      expect(ui.calls).toEqual([]);
    });

    it('checks exactly once when the timeout is zero', async () => {
      const { service, ui, clock } = setUp();
      await expect(
        service.perform({ kind: 'tapElement', query: new ElementQuery({ label: 'Register' }), timeoutSeconds: 0 }),
      ).rejects.toBeInstanceOf(ElementNotFoundError);
      expect(ui.describeCount).toBe(1);
      expect(clock.sleeps).toEqual([]);
    });

    it('does not list unlabeled containers among the elements on screen', async () => {
      const { service } = setUp();
      const error = await service
        .perform({ kind: 'tapElement', query: new ElementQuery({ label: 'Register' }), timeoutSeconds: 0 })
        .catch((reason: unknown) => reason as ElementNotFoundError);
      expect((error as ElementNotFoundError).visible).toHaveLength(2);
    });

    it('fails at once on an ambiguous query instead of waiting', async () => {
      const { service, ui, clock } = setUp();
      ui.screens = [[signIn, element('Button', 'Sign in', [20, 400, 350, 50])]];
      await expect(service.perform(tapSignIn)).rejects.toBeInstanceOf(AmbiguousElementError);
      expect(clock.sleeps).toEqual([]);
      expect(ui.calls).toEqual([]);
    });

    it('waits up to ten seconds by default when only waiting for an element', async () => {
      const { service, ui } = setUp();
      await expect(
        service.perform({ kind: 'waitForElement', query: new ElementQuery({ label: 'Register' }) }),
      ).rejects.toBeInstanceOf(ElementNotFoundError);
      expect(ui.describeCount).toBe(26);
    });

    it('keeps waiting through reads that fail while an app is launching', async () => {
      const { service, ui, clock } = setUp();
      ui.failingReads = 3;
      await service.perform(tapSignIn);
      expect(clock.sleeps).toEqual([400, 400, 400]);
      expect(ui.calls).toEqual(['tap 195,725']);
    });

    it('reports the read failure, not a missing element, when the screen never becomes readable', async () => {
      const { service, ui } = setUp();
      ui.failOn = { call: 'describe', error: commandFailure('No translation object returned') };
      const failure = service.perform({ ...tapSignIn, timeoutSeconds: 2 });
      await expect(failure).rejects.toThrow('No translation object returned');
      await expect(failure).rejects.not.toBeInstanceOf(ElementNotFoundError);
    });

    it('does not retry errors that are not command failures', async () => {
      const { service, ui, clock } = setUp();
      ui.failOn = { call: 'describe', error: new TypeError('bug') };
      await expect(service.perform(tapSignIn)).rejects.toBeInstanceOf(TypeError);
      expect(clock.sleeps).toEqual([]);
    });

    it('returns the element it waited for without tapping', async () => {
      const { service, ui } = setUp();
      ui.screens = [login, home];
      const { value } = await service.perform({
        kind: 'waitForElement',
        query: new ElementQuery({ label: 'Dashboard' }),
      });
      expect(value.outcomes[0]?.element).toBe(dashboard);
      expect(ui.calls).toEqual([]);
    });
  });

  describe('typing text', () => {
    it('types plain text in one go', async () => {
      const { service, ui } = setUp();
      await service.perform({ kind: 'typeText', text: 'Hello, World! 123 @#~' });
      expect(ui.calls).toEqual(['type Hello, World! 123 @#~']);
    });

    it('sends line breaks and tabs as key presses', async () => {
      const { service, ui } = setUp();
      await service.perform({ kind: 'typeText', text: 'user\tpass\r\nnext\n' });
      expect(ui.calls).toEqual(['type user', 'key 43', 'type pass', 'key 40', 'type next', 'key 40']);
    });

    it.each([
      ['España', ['ñ']],
      ['canción número', ['ó', 'ú']],
      ['ok 👍', ['👍']],
      ['日本', ['日', '本']],
    ])('refuses %j before typing anything', async (text, characters) => {
      const { service, ui } = setUp();
      const failure = service.perform({ kind: 'typeText', text });
      await expect(failure).rejects.toBeInstanceOf(UnsupportedTextError);
      await expect(failure).rejects.toMatchObject({ characters });
      expect(ui.calls).toEqual([]);
    });
  });

  describe('pasting text', () => {
    const nameField = element('TextField', 'Name', [20, 200, 350, 40]);
    const pasteItem = element('MenuItem', 'Paste', [60, 150, 70, 36]);
    const form = [container, nameField];
    const formWithMenu = [container, nameField, pasteItem];
    const paste: UiStep = { kind: 'pasteText', text: 'Añadir canción 🎵', query: new ElementQuery({ label: 'Name' }) };

    it('copies the text, long-presses the field and taps Paste', async () => {
      const { service, ui, clipboard } = setUp();
      ui.screens = [form, formWithMenu];
      const { value } = await service.perform(paste);
      expect(clipboard.clipboard).toBe('Añadir canción 🎵');
      expect(ui.calls).toEqual(['tap 195,220 1s', 'tap 95,168']);
      expect(value.outcomes[0]?.element).toBe(nameField);
    });

    it('accepts text the keyboard could never type', async () => {
      const { service, ui, clipboard } = setUp();
      ui.screens = [form, formWithMenu];
      await service.perform({ ...paste, text: '日本語 ñ á 👍' });
      expect(clipboard.clipboard).toBe('日本語 ñ á 👍');
      expect(ui.calls).not.toContain(expect.stringMatching(/^type /));
    });

    it.each(['Pegar', 'COLLER', ' Einfügen ', 'Incolla'])('recognises the menu item "%s"', async (label) => {
      const { service, ui } = setUp();
      ui.screens = [form, [container, nameField, element('MenuItem', label, [60, 150, 70, 36])]];
      await service.perform(paste);
      expect(ui.calls.at(-1)).toBe('tap 95,168');
    });

    it('waits for the menu to appear', async () => {
      const { service, ui, clock } = setUp();
      ui.screens = [form, form, form, formWithMenu];
      await service.perform(paste);
      expect(clock.sleeps).toEqual([400, 400]);
      expect(ui.calls).toEqual(['tap 195,220 1s', 'tap 95,168']);
    });

    it('focuses the field and presses again when the first long press shows no menu', async () => {
      const { service, ui } = setUp();
      // 1 read to find the field, 7 without a menu (2.4 s of polling), then the menu.
      ui.screens = [...Array<typeof form>(8).fill(form), formWithMenu];
      await service.perform(paste);
      expect(ui.calls).toEqual(['tap 195,220 1s', 'tap 195,220', 'tap 195,220 1s', 'tap 95,168']);
    });

    it('explains what happened when no Paste option ever appears', async () => {
      const { service, ui, clipboard } = setUp();
      ui.screens = [form];
      const failure = service.perform(paste);
      await expect(failure).rejects.toBeInstanceOf(PasteUnavailableError);
      await expect(failure).rejects.toThrow(/copied to the clipboard.*label "name".*TextField "Name"/s);
      expect(clipboard.clipboard).toBe('Añadir canción 🎵');
      expect(ui.calls.filter((call) => call.startsWith('tap 95'))).toEqual([]);
    });

    it('fails without touching the clipboard target when the field does not exist', async () => {
      const { service, ui } = setUp();
      ui.screens = [[container]];
      await expect(service.perform({ ...paste, timeoutSeconds: 0 })).rejects.toBeInstanceOf(ElementNotFoundError);
      expect(ui.calls).toEqual([]);
    });
  });

  describe('scrolling to an element', () => {
    const row = (index: number, y: number) => element('Cell', `Row ${index}`, [0, y, 390, 44]);
    const page = (first: number) => [container, ...[0, 1, 2].map((offset) => row(first + offset, 100 + offset * 200))];
    const scrollToRow = (index: number, extra: Partial<Extract<UiStep, { kind: 'scrollTo' }>> = {}): UiStep => ({
      kind: 'scrollTo',
      query: new ElementQuery({ label: `Row ${index}` }),
      ...extra,
    });

    it('does not swipe when the element is already on screen', async () => {
      const { service, ui } = setUp();
      ui.screens = [page(1)];
      const { value } = await service.perform(scrollToRow(2));
      expect(ui.calls).toEqual([]);
      expect(value.outcomes[0]?.element?.label).toBe('Row 2');
    });

    it('swipes up to reveal content further down until the element appears', async () => {
      const { service, ui, clock } = setUp();
      ui.screens = [page(1), page(4), page(7)];
      const { value } = await service.perform(scrollToRow(8));
      // 40% of an 844-point screen, centred: from y=591 to y=253.
      expect(ui.calls).toEqual(['swipe 195,591 195,253', 'swipe 195,591 195,253']);
      expect(clock.sleeps).toEqual([600, 600]);
      expect(value.outcomes[0]?.element?.label).toBe('Row 8');
    });

    it('swipes the other way to go back up', async () => {
      const { service, ui } = setUp();
      ui.screens = [page(7), page(4)];
      await service.perform(scrollToRow(4, { direction: 'up' }));
      expect(ui.calls).toEqual(['swipe 195,253 195,591']);
    });

    it('keeps scrolling when the element exists but lies outside the screen', async () => {
      const { service, ui } = setUp();
      const below = element('Cell', 'Row 9', [0, 900, 390, 44]);
      ui.screens = [[...page(1), below], page(7).concat(row(9, 500))];
      const { value } = await service.perform(scrollToRow(9));
      expect(ui.calls).toHaveLength(1);
      expect(value.outcomes[0]?.element?.frame.y).toBe(500);
    });

    it('stops as soon as a swipe changes nothing: the end of the content', async () => {
      const { service, ui } = setUp();
      ui.screens = [page(1), page(4), page(4)];
      const failure = service.perform(scrollToRow(99));
      await expect(failure).rejects.toBeInstanceOf(ElementNotFoundError);
      await expect(failure).rejects.toThrow(/Cell "Row 4"/);
      expect(ui.calls).toHaveLength(2);
    });

    it('gives up after the allowed number of swipes', async () => {
      const { service, ui } = setUp();
      ui.screens = Array.from({ length: 30 }, (_, index) => page(index * 3 + 1));
      await expect(service.perform(scrollToRow(999, { maxSwipes: 4 }))).rejects.toBeInstanceOf(ElementNotFoundError);
      expect(ui.calls).toHaveLength(4);
    });

    it('swipes ten times at most by default', async () => {
      const { service, ui } = setUp();
      ui.screens = Array.from({ length: 30 }, (_, index) => page(index * 3 + 1));
      await expect(service.perform(scrollToRow(999))).rejects.toBeInstanceOf(ElementNotFoundError);
      expect(ui.calls).toHaveLength(10);
    });

    it('does not swipe blindly on an empty screen', async () => {
      const { service, ui } = setUp();
      ui.screens = [[]];
      await expect(service.perform(scrollToRow(1))).rejects.toBeInstanceOf(ElementNotFoundError);
      expect(ui.calls).toEqual([]);
    });
  });

  describe('sequences', () => {
    const fillAndSubmit: UiStep[] = [
      { kind: 'tapElement', query: new ElementQuery({ label: 'Email' }) },
      { kind: 'typeText', text: 'ana@example.com' },
      tapSignIn,
    ];

    it('runs every step in order', async () => {
      const { service, ui } = setUp();
      const { value } = await service.run(fillAndSubmit);
      expect(ui.calls).toEqual(['tap 195,300', 'type ana@example.com', 'tap 195,725']);
      expect(value.outcomes).toHaveLength(3);
      expect(value.failure).toBeUndefined();
      expect(value.screen).toBeUndefined();
    });

    it('resolves the device a single time', async () => {
      const { service, devices } = setUp();
      await service.run(fillAndSubmit);
      expect(devices.listCount).toBe(1);
    });

    it('stops at the first failure and reports progress and the screen', async () => {
      const { service, ui } = setUp();
      ui.failOn = { call: 'type', error: commandFailure('keyboard not visible') };
      const { value } = await service.run(fillAndSubmit);
      expect(value.outcomes).toHaveLength(1);
      expect(value.failure?.index).toBe(1);
      expect(String(value.failure?.error)).toContain('keyboard not visible');
      expect(value.screen).toEqual([email, signIn]);
      expect(ui.calls).toEqual(['tap 195,300', 'type ana@example.com']);
    });

    it('still reports a failure when the screen cannot be read afterwards', async () => {
      const { service, ui } = setUp();
      ui.failOn = { call: 'describe', error: commandFailure('idb is gone') };
      const { value } = await service.run([tapSignIn]);
      expect(value.failure?.index).toBe(0);
      expect(value.screen).toBeUndefined();
    });

    it('returns the settled screen when asked', async () => {
      const { service, ui, clock } = setUp();
      ui.screens = [login, home];
      const { value } = await service.run([tapSignIn], { describeAfter: true });
      expect(clock.sleeps).toEqual([600]);
      expect(value.screen).toEqual([dashboard]);
    });

    it('handles an empty sequence', async () => {
      const { service } = setUp();
      expect((await service.run([])).value.outcomes).toEqual([]);
    });
  });

  describe('describing the screen', () => {
    it('returns everything by default', async () => {
      const { service } = setUp();
      expect((await service.describeScreen()).value).toEqual(login);
    });

    it('can drop unlabeled elements', async () => {
      const { service } = setUp();
      expect((await service.describeScreen({ meaningfulOnly: true })).value).toEqual([email, signIn]);
    });

    it('filters by text in label, value or identifier, ignoring case', async () => {
      const { service, ui } = setUp();
      const tagged = element('Button', undefined, [0, 0, 10, 10], { identifier: 'nav.SIGN-out' });
      ui.screens = [[...login, tagged]];
      expect((await service.describeScreen({ containing: 'sign' })).value).toEqual([signIn, tagged]);
      expect((await service.describeScreen({ containing: 'nothing' })).value).toEqual([]);
    });

    it('retries a read that fails transiently', async () => {
      const { service, ui, clock } = setUp();
      ui.failingReads = 2;
      expect((await service.describeScreen()).value).toEqual(login);
      expect(clock.sleeps).toEqual([400, 400]);
    });

    it('gives up on a screen that stays unreadable after a few seconds', async () => {
      const { service, ui, clock } = setUp();
      ui.failOn = { call: 'describe', error: commandFailure('No translation object returned') };
      await expect(service.describeScreen()).rejects.toThrow('No translation object returned');
      expect(clock.now()).toBe(3200);
    });

    it('is patient when reading the screen after an action', async () => {
      const { service, ui } = setUp();
      ui.screens = [home];
      ui.failingReads = 1;
      const { value } = await service.perform({ kind: 'pressButton', button: 'HOME' }, { describeAfter: true });
      expect(value.screen).toEqual([dashboard]);
    });

    it('describes the element at a point', async () => {
      const { service, ui } = setUp();
      ui.screens = [[signIn]];
      expect((await service.describePoint(new Point(100.2, 710.7))).value).toBe(signIn);
      expect((await service.describePoint(new Point(1, 1))).value).toBeUndefined();
      expect(ui.calls[0]).toBe('describePoint 100,711');
    });
  });
});
