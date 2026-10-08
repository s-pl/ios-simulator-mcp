import { describe, expect, it } from 'vitest';

import { UnexpectedOutputError } from '../../src/domain/errors.js';
import { Runtime } from '../../src/domain/Runtime.js';
import { toUiElement } from '../../src/infrastructure/idb/IdbUiAutomationGateway.js';
import { parseAppList, parseLaunchPid } from '../../src/infrastructure/simctl/SimctlAppGateway.js';
import { parseDeviceList } from '../../src/infrastructure/simctl/SimctlDeviceGateway.js';
import { statusBarArguments } from '../../src/infrastructure/simctl/SimctlEnvironmentGateway.js';
import { parseLogLines } from '../../src/infrastructure/simctl/SimctlLogGateway.js';
import { deviceListJson, UDID } from '../support/FakeCommandRunner.js';

describe('Runtime', () => {
  it.each([
    ['com.apple.CoreSimulator.SimRuntime.iOS-17-5', 'iOS', '17.5', 'iOS 17.5'],
    ['com.apple.CoreSimulator.SimRuntime.watchOS-10-0', 'watchOS', '10.0', 'watchOS 10.0'],
    ['com.apple.CoreSimulator.SimRuntime.iOS-16-4-1', 'iOS', '16.4.1', 'iOS 16.4.1'],
  ])('parses %s', (identifier, platform, version, displayName) => {
    const runtime = Runtime.fromIdentifier(identifier);
    expect(runtime).toMatchObject({ platform, version, displayName });
  });

  it('keeps an unrecognised identifier as its display name', () => {
    expect(Runtime.fromIdentifier('something odd').displayName).toBe('something odd');
  });
});

describe('parseDeviceList', () => {
  it('maps every device with its runtime and state', () => {
    const devices = parseDeviceList(deviceListJson([UDID.ipad]));
    expect(devices).toHaveLength(4);
    const ipad = devices.find((device) => device.udid === UDID.ipad);
    expect(ipad?.isBooted).toBe(true);
    expect(ipad?.toSnapshot()).toEqual({
      udid: UDID.ipad,
      name: 'iPad Air',
      state: 'Booted',
      runtime: 'iOS 17.5',
      isAvailable: true,
    });
  });

  it('rejects output that is not JSON', () => {
    expect(() => parseDeviceList('not json')).toThrow(UnexpectedOutputError);
  });
});

describe('parseLaunchPid', () => {
  it('reads the pid printed by simctl launch', () => {
    expect(parseLaunchPid('com.example.app: 4242\n')).toBe(4242);
  });

  it('returns undefined when no pid is printed', () => {
    expect(parseLaunchPid('')).toBeUndefined();
  });
});

describe('parseAppList', () => {
  it('maps bundle metadata and falls back to the bundle id for missing names', () => {
    const apps = parseAppList(
      JSON.stringify({
        'com.example.app': {
          CFBundleIdentifier: 'com.example.app',
          CFBundleDisplayName: 'Example',
          CFBundleShortVersionString: '1.2',
          ApplicationType: 'User',
          Path: '/path/Example.app',
        },
        'com.apple.thing': { ApplicationType: 'System' },
      }),
    );
    expect(apps).toEqual([
      { bundleId: 'com.example.app', name: 'Example', version: '1.2', type: 'User', bundlePath: '/path/Example.app' },
      { bundleId: 'com.apple.thing', name: 'com.apple.thing', version: undefined, type: 'System', bundlePath: undefined },
    ]);
  });
});

describe('statusBarArguments', () => {
  it('emits a flag only for the provided overrides', () => {
    expect(statusBarArguments({ time: '9:41', batteryLevel: 100, wifiBars: 0 })).toEqual([
      '--time', '9:41', '--wifiBars', '0', '--batteryLevel', '100',
    ]);
  });
});

describe('parseLogLines', () => {
  it('drops the header and blank lines', () => {
    expect(parseLogLines('Timestamp               Ty Process\n\nline one\nline two\n')).toEqual([
      'line one',
      'line two',
    ]);
  });
});

describe('toUiElement', () => {
  it('maps an idb accessibility node', () => {
    const element = toUiElement({
      type: 'Button',
      AXLabel: 'Sign in',
      AXValue: null,
      AXUniqueId: 'login.submit',
      enabled: true,
      frame: { x: 20, y: 700, width: 350, height: 50 },
    });
    expect(element).toMatchObject({ type: 'Button', label: 'Sign in', value: undefined, identifier: 'login.submit' });
    expect(element.frame.center).toMatchObject({ x: 195, y: 725 });
  });
});
