import { describe, expect, it } from 'vitest';

import { DeviceResolver } from '../../src/application/DeviceResolver.js';
import {
  AmbiguousDeviceError,
  DeviceNotBootedError,
  DeviceNotFoundError,
  NoBootedDeviceError,
} from '../../src/domain/errors.js';
import { SimulatorHost } from '../../src/infrastructure/host/SimulatorHost.js';
import { SimctlDeviceGateway } from '../../src/infrastructure/simctl/SimctlDeviceGateway.js';
import { deviceListJson, FakeCommandRunner, UDID } from '../support/FakeCommandRunner.js';

function resolverWith(booted: readonly string[]): DeviceResolver {
  const runner = new FakeCommandRunner().on('xcrun simctl list devices', deviceListJson(booted));
  return new DeviceResolver(new SimctlDeviceGateway(new SimulatorHost(runner, { platform: 'darwin' })));
}

describe('DeviceResolver', () => {
  it('defaults to the only booted simulator', async () => {
    const device = await resolverWith([UDID.ipad]).resolve();
    expect(device.udid).toBe(UDID.ipad);
  });

  it('fails without a reference when nothing is booted', async () => {
    await expect(resolverWith([]).resolve()).rejects.toBeInstanceOf(NoBootedDeviceError);
  });

  it('fails without a reference when several simulators are booted', async () => {
    await expect(resolverWith([UDID.iphone15, UDID.ipad]).resolve()).rejects.toBeInstanceOf(
      AmbiguousDeviceError,
    );
  });

  it('resolves a UDID regardless of case', async () => {
    const device = await resolverWith([]).resolve(UDID.ipad.toLowerCase());
    expect(device.name).toBe('iPad Air');
  });

  it('resolves a unique name regardless of case', async () => {
    const device = await resolverWith([]).resolve('ipad air');
    expect(device.udid).toBe(UDID.ipad);
  });

  it('prefers the booted simulator when a name is shared by several runtimes', async () => {
    const device = await resolverWith([UDID.iphone15OnIos18]).resolve('iPhone 15');
    expect(device.udid).toBe(UDID.iphone15OnIos18);
    expect(device.runtime.displayName).toBe('iOS 18.0');
  });

  it('reports ambiguity when a shared name cannot be narrowed down', async () => {
    await expect(resolverWith([]).resolve('iPhone 15')).rejects.toBeInstanceOf(AmbiguousDeviceError);
  });

  it('ignores unavailable simulators', async () => {
    await expect(resolverWith([]).resolve('iPhone 8')).rejects.toBeInstanceOf(DeviceNotFoundError);
  });

  it('rejects a shut down simulator when a booted one is required', async () => {
    await expect(resolverWith([]).resolveBooted('iPad Air')).rejects.toBeInstanceOf(DeviceNotBootedError);
  });
});
