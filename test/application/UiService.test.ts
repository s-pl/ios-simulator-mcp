import { describe, expect, it } from 'vitest';

import { UiService } from '../../src/application/UiService.js';
import { ElementQuery } from '../../src/domain/ElementQuery.js';
import {
  AmbiguousElementError,
  DeviceNotBootedError,
  ElementNotFoundError,
  UnsupportedTextError,
} from '../../src/domain/errors.js';
import { Point } from '../../src/domain/geometry.js';
import type { UiStep } from '../../src/domain/ui.js';
import { element } from '../support/elements.js';
import { FakeClock } from '../support/FakeClock.js';
import { commandFailure, device, FakeDeviceGateway, FakeUiGateway, resolverFor } from '../support/fakes.js';

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
  const service = new UiService(ui, resolverFor(devices).resolver, clock);
  return { service, ui, clock, devices };
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
      const failure = service.perform({ ...tapSignIn, timeoutSeconds: 2 } as UiStep);
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
