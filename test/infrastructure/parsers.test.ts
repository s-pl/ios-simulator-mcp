import { describe, expect, it } from 'vitest';

import { UnexpectedOutputError } from '../../src/domain/errors.js';
import { summariseIdbError, toUiElement } from '../../src/infrastructure/idb/IdbUiAutomationGateway.js';
import { parseAppList, parseLaunchPid } from '../../src/infrastructure/simctl/SimctlAppGateway.js';
import { parseDeviceList, parseDeviceTypeBundlePath } from '../../src/infrastructure/simctl/SimctlDeviceGateway.js';
import { statusBarArguments } from '../../src/infrastructure/simctl/SimctlEnvironmentGateway.js';
import { parseLogLines } from '../../src/infrastructure/simctl/SimctlLogGateway.js';
import { parsePixelWidth } from '../../src/infrastructure/simctl/SimctlMediaGateway.js';
import { deviceListJson, deviceTypesJson, IPHONE_15_TYPE, UDID } from '../support/FakeCommandRunner.js';

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

  it('keeps the device type, needed to look up the screen scale', () => {
    const iphone = parseDeviceList(deviceListJson()).find((device) => device.udid === UDID.iphone15);
    expect(iphone?.deviceTypeIdentifier).toBe(IPHONE_15_TYPE);
  });

  it('skips entries without a UDID or a name', () => {
    const json = JSON.stringify({
      devices: { 'iOS-17-0': [{ name: 'Nameless' }, { udid: 'X' }, { udid: 'Y', name: 'Ok' }] },
    });
    expect(parseDeviceList(json).map((device) => device.udid)).toEqual(['Y']);
  });

  it('treats missing availability and state conservatively', () => {
    const [device] = parseDeviceList(JSON.stringify({ devices: { 'iOS-17-0': [{ udid: 'X', name: 'Bare' }] } }));
    expect(device).toMatchObject({ isAvailable: false, state: 'Unknown' });
  });

  it('accepts output with no devices at all', () => {
    expect(parseDeviceList('{}')).toEqual([]);
    expect(parseDeviceList('{"devices":{}}')).toEqual([]);
  });

  it('rejects output that is not JSON', () => {
    expect(() => parseDeviceList('not json')).toThrow(UnexpectedOutputError);
  });
});

describe('parseDeviceTypeBundlePath', () => {
  it('finds the bundle of a device type', () => {
    expect(parseDeviceTypeBundlePath(deviceTypesJson(), IPHONE_15_TYPE)).toBe('/Types/iPhone 15.simdevicetype');
  });

  it('returns undefined for an unknown type or an empty list', () => {
    expect(parseDeviceTypeBundlePath(deviceTypesJson(), 'unknown')).toBeUndefined();
    expect(parseDeviceTypeBundlePath('{}', IPHONE_15_TYPE)).toBeUndefined();
  });

  it('rejects output that is not JSON', () => {
    expect(() => parseDeviceTypeBundlePath('<plist>', IPHONE_15_TYPE)).toThrow(UnexpectedOutputError);
  });
});

describe('parseLaunchPid', () => {
  it.each([
    ['com.example.app: 4242\n', 4242],
    ['com.example.app: 1', 1],
    ['warning: something\ncom.example.app: 77\n', 77],
  ])('reads the pid from %j', (output, pid) => {
    expect(parseLaunchPid(output)).toBe(pid);
  });

  it.each(['', 'com.example.app launched', 'com.example.app: not-a-number'])('returns undefined for %j', (output) => {
    expect(parseLaunchPid(output)).toBeUndefined();
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
      {
        bundleId: 'com.apple.thing',
        name: 'com.apple.thing',
        version: undefined,
        type: 'System',
        bundlePath: undefined,
      },
    ]);
  });

  it('prefers the display name, then the bundle name', () => {
    const [app] = parseAppList(JSON.stringify({ a: { CFBundleDisplayName: '', CFBundleName: 'Fallback' } }));
    expect(app?.name).toBe('Fallback');
  });

  it('falls back to the build number as version and flags unknown app types', () => {
    const [app] = parseAppList(JSON.stringify({ a: { CFBundleVersion: '77', ApplicationType: 'Internal' } }));
    expect(app).toMatchObject({ version: '77', type: 'Unknown' });
  });

  it('rejects output that is not JSON', () => {
    expect(() => parseAppList('{ plist = "old style"; }')).toThrow(UnexpectedOutputError);
  });
});

describe('statusBarArguments', () => {
  it('emits a flag only for the provided overrides', () => {
    expect(statusBarArguments({ time: '9:41', batteryLevel: 100, wifiBars: 0 })).toEqual([
      '--time',
      '9:41',
      '--wifiBars',
      '0',
      '--batteryLevel',
      '100',
    ]);
  });

  it('supports every field', () => {
    expect(
      statusBarArguments({
        time: '9:41',
        dataNetwork: '5g',
        wifiMode: 'active',
        wifiBars: 3,
        cellularMode: 'active',
        cellularBars: 4,
        operatorName: 'Carrier',
        batteryState: 'charged',
        batteryLevel: 100,
      }),
    ).toEqual([
      '--time',
      '9:41',
      '--dataNetwork',
      '5g',
      '--wifiMode',
      'active',
      '--wifiBars',
      '3',
      '--cellularMode',
      'active',
      '--cellularBars',
      '4',
      '--operatorName',
      'Carrier',
      '--batteryState',
      'charged',
      '--batteryLevel',
      '100',
    ]);
  });

  it('emits nothing for no overrides', () => {
    expect(statusBarArguments({})).toEqual([]);
  });
});

describe('parseLogLines', () => {
  it('drops the header and blank lines', () => {
    expect(parseLogLines('Timestamp               Ty Process\n\nline one\r\nline two\n')).toEqual([
      'line one',
      'line two',
    ]);
  });

  it('returns nothing for empty output', () => {
    expect(parseLogLines('')).toEqual([]);
  });
});

describe('parsePixelWidth', () => {
  it('reads the width printed by sips', () => {
    expect(parsePixelWidth('/tmp/shot.png\n  pixelWidth: 1179\n')).toBe(1179);
  });

  it.each(['', '/tmp/shot.png\n  pixelWidth: <nil>\n', 'Error: cannot open'])('returns undefined for %j', (output) => {
    expect(parsePixelWidth(output)).toBeUndefined();
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

  it('tolerates a node with no information', () => {
    const element = toUiElement({});
    expect(element).toMatchObject({ type: 'Unknown', label: undefined, enabled: true });
    expect(element.frame).toMatchObject({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('treats empty strings as absent', () => {
    expect(toUiElement({ AXLabel: '', AXValue: '', AXUniqueId: '' })).toMatchObject({
      label: undefined,
      value: undefined,
      identifier: undefined,
    });
  });
});

describe('summariseIdbError', () => {
  const traceback = [
    'Traceback (most recent call last):',
    '  File "/opt/homebrew/bin/idb", line 8, in <module>',
    '    sys.exit(main())',
    '  File "/lib/python3.12/site-packages/idb/common/hid.py", line 120, in text_to_events',
    '    raise Exception(f"No keycode found for {character}")',
    'Exception: No keycode found for ñ',
    '',
  ].join('\n');

  it('keeps only the exception message of a Python traceback', () => {
    expect(summariseIdbError(traceback)).toBe('Exception: No keycode found for ñ');
  });

  it('leaves ordinary error output alone', () => {
    expect(summariseIdbError('  No translation object returned for simulator.\n')).toBe(
      'No translation object returned for simulator.',
    );
  });

  it('handles empty output', () => {
    expect(summariseIdbError('')).toBe('');
  });
});
