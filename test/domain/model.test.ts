import { describe, expect, it } from 'vitest';

import { Device, parseDeviceState } from '../../src/domain/Device.js';
import {
  AmbiguousElementError,
  AppNotInstalledError,
  CommandFailedError,
  ElementNotFoundError,
  InvalidArgumentError,
  SimulatorError,
  UnsupportedTextError,
} from '../../src/domain/errors.js';
import { Point, Rect } from '../../src/domain/geometry.js';
import { mimeTypeOf } from '../../src/domain/media.js';
import { Runtime } from '../../src/domain/Runtime.js';
import { describeElement, isLabeled } from '../../src/domain/ui.js';
import { element } from '../support/elements.js';

describe('Runtime', () => {
  it.each([
    ['com.apple.CoreSimulator.SimRuntime.iOS-17-5', 'iOS', '17.5', 'iOS 17.5'],
    ['com.apple.CoreSimulator.SimRuntime.watchOS-10-0', 'watchOS', '10.0', 'watchOS 10.0'],
    ['com.apple.CoreSimulator.SimRuntime.tvOS-18-2', 'tvOS', '18.2', 'tvOS 18.2'],
    ['com.apple.CoreSimulator.SimRuntime.xrOS-2-0', 'xrOS', '2.0', 'xrOS 2.0'],
    ['com.apple.CoreSimulator.SimRuntime.iOS-16-4-1', 'iOS', '16.4.1', 'iOS 16.4.1'],
    ['iOS-26-0', 'iOS', '26.0', 'iOS 26.0'],
  ])('parses %s', (identifier, platform, version, displayName) => {
    expect(Runtime.fromIdentifier(identifier)).toMatchObject({ identifier, platform, version, displayName });
  });

  it.each(['something odd', '', 'com.apple.CoreSimulator.SimRuntime.'])(
    'keeps the unrecognised identifier %j as its display name',
    (identifier) => {
      const runtime = Runtime.fromIdentifier(identifier);
      expect(runtime.platform).toBe('Unknown');
      expect(runtime.displayName).toBe(identifier);
    },
  );
});

describe('Device', () => {
  const device = new Device({
    udid: 'ABCD-1234',
    name: 'iPhone 15',
    state: 'Booted',
    runtime: Runtime.fromIdentifier('com.apple.CoreSimulator.SimRuntime.iOS-17-5'),
    isAvailable: true,
  });

  it('exposes its state', () => {
    expect(device.isBooted).toBe(true);
    expect(device.isShutdown).toBe(false);
  });

  it('builds an unambiguous label', () => {
    expect(device.label).toBe('iPhone 15 (iOS 17.5, ABCD-1234)');
  });

  it('compares UDIDs and names ignoring case and spaces', () => {
    expect(device.hasUdid(' abcd-1234 ')).toBe(true);
    expect(device.hasUdid('ABCD')).toBe(false);
    expect(device.hasName('IPHONE 15 ')).toBe(true);
    expect(device.hasName('iPhone')).toBe(false);
  });

  it.each([
    ['Booted', 'Booted'],
    ['Shutdown', 'Shutdown'],
    ['Shutting Down', 'ShuttingDown'],
    ['Booting', 'Booting'],
    ['Creating', 'Creating'],
    ['', 'Unknown'],
    ['Exploded', 'Unknown'],
  ])('normalises the state %j to %s', (raw, expected) => {
    expect(parseDeviceState(raw)).toBe(expected);
  });
});

describe('Point', () => {
  it.each([
    [-1, 0],
    [0, -1],
    [Number.NaN, 0],
    [0, Number.POSITIVE_INFINITY],
  ])('rejects (%s, %s)', (x, y) => {
    expect(() => new Point(x, y)).toThrow(InvalidArgumentError);
  });

  it('rounds to whole points', () => {
    expect(new Point(10.4, 20.5).rounded()).toMatchObject({ x: 10, y: 21 });
  });

  it('prints as a coordinate pair', () => {
    expect(String(new Point(3, 4))).toBe('(3, 4)');
  });
});

describe('Rect', () => {
  const rect = new Rect(10, 20, 100, 50);

  it('computes its centre and area', () => {
    expect(rect.center).toMatchObject({ x: 60, y: 45 });
    expect(rect.area).toBe(5000);
  });

  it('knows which points it contains, edges included', () => {
    expect(rect.contains(new Point(10, 20))).toBe(true);
    expect(rect.contains(new Point(110, 70))).toBe(true);
    expect(rect.contains(new Point(111, 45))).toBe(false);
    expect(rect.contains(new Point(60, 19))).toBe(false);
  });

  it('keeps the centre of a partly off-screen frame on screen', () => {
    expect(new Rect(-300, -300, 100, 100).center).toMatchObject({ x: 0, y: 0 });
  });
});

describe('describeElement', () => {
  it('prints type, label, tap point and size', () => {
    expect(describeElement(element('Button', 'Sign in', [20, 700, 350, 50]))).toBe(
      'Button "Sign in" @(195,725) 350x50',
    );
  });

  it('includes value, identifier and the disabled state when present', () => {
    const field = element('TextField', 'Email', [0, 0, 100, 40], {
      value: 'a@b.co',
      identifier: 'login.email',
      enabled: false,
    });
    expect(describeElement(field)).toBe('TextField "Email" value="a@b.co" id=login.email @(50,20) 100x40 [disabled]');
  });

  it('escapes quotes and line breaks in text', () => {
    expect(describeElement(element('StaticText', 'say "hi"\nnow'))).toContain('"say \\"hi\\"\\nnow"');
  });

  it('tells labeled elements from layout containers', () => {
    expect(isLabeled(element('Other', undefined))).toBe(false);
    expect(isLabeled(element('Other', undefined, [0, 0, 1, 1], { identifier: 'root' }))).toBe(true);
    expect(isLabeled(element('TextField', undefined, [0, 0, 1, 1], { value: 'x' }))).toBe(true);
  });
});

describe('errors', () => {
  it('are named after their class and carry a stable code', () => {
    const error = new AppNotInstalledError('com.example.app', 'iPhone 15');
    expect(error).toBeInstanceOf(SimulatorError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppNotInstalledError');
    expect(error.code).toBe('APP_NOT_INSTALLED');
    expect(error.message).toContain('com.example.app');
  });

  it('CommandFailedError reports the command, exit code and output', () => {
    const error = new CommandFailedError('xcrun simctl boot X', 164, 'Unable to boot\n');
    expect(error.message).toBe('Command failed (exit code 164): xcrun simctl boot X\nUnable to boot');
  });

  it('CommandFailedError handles a missing exit code and empty output', () => {
    expect(new CommandFailedError('idb', null, '  ').message).toBe(
      'Command failed (exit code unknown): idb\nno error output',
    );
  });

  it('CommandFailedError can be explained and cleaned without losing its identity', () => {
    const original = new CommandFailedError('idb ui text', 1, 'Traceback...\nValueError: nope');
    const cleaned = original.withOutput('ValueError: nope').withHint('Use the clipboard.');
    expect(cleaned).toBeInstanceOf(CommandFailedError);
    expect(cleaned).toMatchObject({ commandLine: 'idb ui text', exitCode: 1, stderr: 'ValueError: nope' });
    expect(cleaned.message).toBe(
      'Command failed (exit code 1): idb ui text\nValueError: nope\nHint: Use the clipboard.',
    );
    expect(original.hint).toBeUndefined();
  });

  it('ElementNotFoundError lists what is on screen', () => {
    expect(new ElementNotFoundError('label "x"', ['Button "A" @(1,1) 2x2']).message).toBe(
      'No element on screen matches label "x". Elements on screen:\nButton "A" @(1,1) 2x2',
    );
    expect(new ElementNotFoundError('label "x"', []).message).toContain('no labeled elements');
  });

  it('AmbiguousElementError numbers the candidates', () => {
    expect(new AmbiguousElementError('type "button"', ['A', 'B']).message).toContain('0: A\n1: B');
  });

  it('UnsupportedTextError names the characters and the workaround', () => {
    const error = new UnsupportedTextError(['ñ', 'á']);
    expect(error.message).toContain('"ñ", "á"');
    expect(error.message).toContain('set_clipboard');
  });
});

describe('mimeTypeOf', () => {
  it('maps image formats to MIME types', () => {
    expect(mimeTypeOf('png')).toBe('image/png');
    expect(mimeTypeOf('jpeg')).toBe('image/jpeg');
  });
});
