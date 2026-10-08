import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';
import { ElementQuery } from '../../src/domain/ElementQuery.js';
import { DeviceNotFoundError } from '../../src/domain/errors.js';
import { Point } from '../../src/domain/geometry.js';
import type { Screenshot } from '../../src/domain/media.js';
import {
  describeScreenshot,
  describeStep,
  formatApps,
  formatElements,
  formatRun,
  formatScreen,
} from '../../src/mcp/presenters.js';
import { errorResponse, failure, formatError, image, json, text } from '../../src/mcp/responses.js';
import { element } from '../support/elements.js';
import { device } from '../support/fakes.js';

const phone = device('iPhone 15', 'UDID', 'Booted');
const button = element('Button', 'OK', [0, 0, 100, 40]);

describe('responses', () => {
  it('builds text and JSON responses', () => {
    expect(text('hi')).toEqual({ content: [{ type: 'text', text: 'hi' }] });
    expect(json({ a: 1 })).toEqual({ content: [{ type: 'text', text: '{\n  "a": 1\n}' }] });
  });

  it('builds an image response with an optional caption', () => {
    const data = new Uint8Array([104, 105]);
    expect(image(data, 'image/png')).toEqual({ content: [{ type: 'image', data: 'aGk=', mimeType: 'image/png' }] });
    expect(image(data, 'image/png', 'caption').content[0]).toEqual({ type: 'text', text: 'caption' });
  });

  it('flags failures as errors', () => {
    expect(failure('nope')).toEqual({ isError: true, content: [{ type: 'text', text: 'nope' }] });
  });

  it('formats domain errors with their code', () => {
    expect(formatError(new DeviceNotFoundError('X'))).toMatch(/^\[DEVICE_NOT_FOUND\] /);
    expect(errorResponse(new DeviceNotFoundError('X')).isError).toBe(true);
  });

  it('formats anything else as unexpected', () => {
    expect(formatError(new TypeError('boom'))).toBe('[UNEXPECTED_ERROR] boom');
    expect(formatError('just a string')).toBe('[UNEXPECTED_ERROR] just a string');
    expect(formatError(undefined)).toBe('[UNEXPECTED_ERROR] undefined');
  });
});

describe('presenters', () => {
  it('formats elements one per line', () => {
    expect(formatElements([button, element('StaticText', 'Hi', [0, 50, 100, 20])])).toBe(
      'Button "OK" @(50,20) 100x40\nStaticText "Hi" @(50,60) 100x20',
    );
    expect(formatElements([])).toBe('(no labeled elements)');
  });

  it('heads a screen with the device and a legend', () => {
    const lines = formatScreen(phone, [button]).split('\n');
    expect(lines[0]).toBe('Screen of iPhone 15 (iOS 17.5, UDID): 1 element(s).');
    expect(lines[1]).toMatch(/^Format: /);
    expect(lines).toHaveLength(3);
  });

  it.each([
    [{ kind: 'tap', point: new Point(1, 2) }, 'tap (1, 2)'],
    [{ kind: 'tap', point: new Point(1, 2), durationSeconds: 2 }, 'tap (1, 2) for 2s'],
    [{ kind: 'swipe', from: new Point(1, 2), to: new Point(3, 4) }, 'swipe (1, 2) to (3, 4)'],
    [{ kind: 'typeText', text: 'secret' }, 'type_text (6 characters)'],
    [{ kind: 'pressButton', button: 'HOME' }, 'press_button HOME'],
    [{ kind: 'pressKey', keyCode: 40 }, 'press_key 40'],
    [{ kind: 'wait', seconds: 0.5 }, 'wait 0.5s'],
    [{ kind: 'tapElement', query: new ElementQuery({ label: 'OK' }) }, 'tap_element label "ok"'],
    [{ kind: 'waitForElement', query: new ElementQuery({ type: 'Button' }) }, 'wait_for_element type "button"'],
  ] as const)('describes the step %j', (step, expected) => {
    expect(describeStep(step)).toBe(expected);
  });

  it('adds the located element to a step description', () => {
    expect(describeStep({ kind: 'tapElement', query: new ElementQuery({ label: 'OK' }) }, button)).toBe(
      'tap_element label "ok" -> Button "OK" @(50,20) 100x40',
    );
  });

  describe('formatRun', () => {
    const tap = { step: { kind: 'tap', point: new Point(1, 2) } } as const;

    it('reports a single successful step on one line', () => {
      expect(formatRun(phone, { outcomes: [tap] }, 1)).toBe('Done on iPhone 15 (iOS 17.5, UDID): tap (1, 2).');
    });

    it('numbers the steps of a sequence', () => {
      expect(formatRun(phone, { outcomes: [tap, tap] }, 2)).toBe(
        'Ran 2 of 2 step(s) on iPhone 15 (iOS 17.5, UDID).\n1. tap (1, 2)\n2. tap (1, 2)',
      );
    });

    it('reports a failure with its position, even for a single step', () => {
      const report = formatRun(phone, { outcomes: [], failure: { index: 0, error: new Error('nope') } }, 1);
      expect(report).toBe('Ran 0 of 1 step(s) on iPhone 15 (iOS 17.5, UDID).\nStep 1 failed: [UNEXPECTED_ERROR] nope');
    });

    it('appends the screen when there is one', () => {
      expect(formatRun(phone, { outcomes: [tap], screen: [button] }, 1)).toMatch(
        /\n\nScreen now \(1 element\(s\)\):\nButton "OK"/,
      );
      expect(formatRun(phone, { outcomes: [tap], screen: [] }, 1)).toContain('(no labeled elements)');
    });
  });

  it('formats apps without their host paths', () => {
    const report = formatApps(phone, [
      { bundleId: 'com.a', name: 'A', version: '1.0', type: 'User', bundlePath: '/very/long/path/A.app' },
      { bundleId: 'com.b', name: 'B', version: undefined, type: 'System', bundlePath: undefined },
    ]);
    expect(report).toBe('2 app(s) on iPhone 15 (iOS 17.5, UDID).\ncom.a  A  1.0\ncom.b  B  [system]');
  });

  describe('describeScreenshot', () => {
    const shot = (overrides: Partial<Screenshot>): Screenshot => ({
      data: new Uint8Array(),
      format: 'jpeg',
      savedPath: undefined,
      downscaled: true,
      coordinateSpace: 'points',
      deviceScale: 3,
      ...overrides,
    });

    it('says when image positions are UI coordinates', () => {
      expect(describeScreenshot(phone, shot({}))).toContain('The image is in points');
    });

    it('gives the divisor for a native capture', () => {
      expect(describeScreenshot(phone, shot({ coordinateSpace: 'pixels', deviceScale: 2 }))).toContain(
        'in pixels at 2x: divide positions by 2',
      );
    });

    it('points to ui_describe_screen when the scale is unknown', () => {
      expect(describeScreenshot(phone, shot({ coordinateSpace: 'pixels', deviceScale: undefined }))).toContain(
        'use ui_describe_screen',
      );
    });

    it('mentions where the image was saved', () => {
      expect(describeScreenshot(phone, shot({ savedPath: '/tmp/a.png' }))).toContain('Saved to /tmp/a.png.');
    });
  });
});

describe('loadConfig', () => {
  it('has working defaults', () => {
    expect(loadConfig({})).toMatchObject({
      name: 'ios-simulator',
      xcrunPath: 'xcrun',
      idbPath: 'idb',
      outputDirectory: path.join(os.tmpdir(), 'ios-simulator-mcp'),
      deviceCacheTtlMs: 10_000,
    });
  });

  it('reads overrides from the environment, trimming them', () => {
    expect(
      loadConfig({
        IOS_SIMULATOR_MCP_XCRUN_PATH: ' /usr/bin/xcrun ',
        IOS_SIMULATOR_MCP_IDB_PATH: '/opt/idb',
        IOS_SIMULATOR_MCP_OUTPUT_DIR: '/tmp/out',
        IOS_SIMULATOR_MCP_DEVICE_CACHE_MS: '0',
      }),
    ).toMatchObject({ xcrunPath: '/usr/bin/xcrun', idbPath: '/opt/idb', outputDirectory: '/tmp/out', deviceCacheTtlMs: 0 });
  });

  it.each(['', '   ', 'soon', '-5', '1.5', '10s'])('ignores the invalid cache duration %j', (value) => {
    expect(loadConfig({ IOS_SIMULATOR_MCP_DEVICE_CACHE_MS: value }).deviceCacheTtlMs).toBe(10_000);
  });

  it('treats blank values as unset', () => {
    expect(loadConfig({ IOS_SIMULATOR_MCP_IDB_PATH: '   ' }).idbPath).toBe('idb');
  });
});
