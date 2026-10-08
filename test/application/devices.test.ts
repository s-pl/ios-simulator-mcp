import { describe, expect, it } from 'vitest';

import { DeviceCatalog } from '../../src/application/DeviceCatalog.js';
import { DeviceService } from '../../src/application/DeviceService.js';
import {
  AmbiguousDeviceError,
  DeviceNotBootedError,
  DeviceNotFoundError,
  DeviceNotShutdownError,
  NoBootedDeviceError,
} from '../../src/domain/errors.js';
import { FakeClock } from '../support/FakeClock.js';
import { commandFailure, device, FakeDeviceGateway, resolverFor } from '../support/fakes.js';

const IPHONE = 'UDID-IPHONE';
const IPAD = 'UDID-IPAD';

function gatewayWith(states: { iphone?: 'Booted' | 'Shutdown'; ipad?: 'Booted' | 'Shutdown' } = {}): FakeDeviceGateway {
  return new FakeDeviceGateway([
    device('iPhone 15', IPHONE, states.iphone ?? 'Booted'),
    device('iPad Air', IPAD, states.ipad ?? 'Shutdown'),
  ]);
}

describe('DeviceCatalog', () => {
  it('has nothing cached before the first read', () => {
    const catalog = new DeviceCatalog(gatewayWith(), { ttlMs: 1000, clock: new FakeClock() });
    expect(catalog.cached()).toBeUndefined();
  });

  it('serves the list from cache until it expires', async () => {
    const gateway = gatewayWith();
    const clock = new FakeClock();
    const catalog = new DeviceCatalog(gateway, { ttlMs: 1000, clock });

    await catalog.refresh();
    clock.advance(999);
    expect(catalog.cached()).toHaveLength(2);
    clock.advance(1);
    expect(catalog.cached()).toBeUndefined();
    expect(gateway.listCount).toBe(1);
  });

  it('forgets the list when invalidated', async () => {
    const catalog = new DeviceCatalog(gatewayWith(), { ttlMs: 1000, clock: new FakeClock() });
    await catalog.refresh();
    catalog.invalidate();
    expect(catalog.cached()).toBeUndefined();
  });

  it('never caches when the TTL is zero', async () => {
    const catalog = new DeviceCatalog(gatewayWith(), { ttlMs: 0, clock: new FakeClock() });
    await catalog.refresh();
    expect(catalog.cached()).toBeUndefined();
  });
});

describe('DeviceResolver with a cache', () => {
  it('lists the devices once for a burst of resolutions', async () => {
    const gateway = gatewayWith();
    const { resolver } = resolverFor(gateway);
    await resolver.resolveBooted();
    await resolver.resolveBooted('iPhone 15');
    await resolver.resolve(IPAD);
    expect(gateway.listCount).toBe(1);
  });

  it('lists again once the cache has expired', async () => {
    const gateway = gatewayWith();
    const { resolver, clock } = resolverFor(gateway, 1000);
    await resolver.resolveBooted();
    clock.advance(1000);
    await resolver.resolveBooted();
    expect(gateway.listCount).toBe(2);
  });

  it('finds a simulator booted outside the server despite a stale cache', async () => {
    const gateway = gatewayWith({ iphone: 'Shutdown' });
    const { resolver } = resolverFor(gateway);
    await expect(resolver.resolveBooted()).rejects.toBeInstanceOf(NoBootedDeviceError);

    gateway.setState(IPHONE, 'Booted');
    expect((await resolver.resolveBooted()).udid).toBe(IPHONE);
  });

  it('notices a simulator created after the list was cached', async () => {
    const gateway = gatewayWith();
    const { resolver } = resolverFor(gateway);
    await resolver.resolveBooted();

    gateway.devices = [...gateway.devices, device('iPhone 16', 'UDID-NEW')];
    expect((await resolver.resolve('iPhone 16')).udid).toBe('UDID-NEW');
  });

  it('re-reads before reporting that a device is not booted', async () => {
    const gateway = gatewayWith();
    const { resolver } = resolverFor(gateway);
    await resolver.resolve(IPAD);

    gateway.setState(IPAD, 'Booted');
    expect((await resolver.resolveBooted(IPAD)).isBooted).toBe(true);
    expect(gateway.listCount).toBe(2);
  });

  it('reports the failure when fresh data confirms it', async () => {
    const gateway = gatewayWith();
    const { resolver } = resolverFor(gateway);
    await resolver.resolveBooted();
    await expect(resolver.resolve('Pixel 9')).rejects.toBeInstanceOf(DeviceNotFoundError);
    await expect(resolver.resolveBooted(IPAD)).rejects.toBeInstanceOf(DeviceNotBootedError);
  });

  it('reports ambiguity among booted simulators', async () => {
    const { resolver } = resolverFor(gatewayWith({ ipad: 'Booted' }));
    await expect(resolver.resolveBooted()).rejects.toBeInstanceOf(AmbiguousDeviceError);
  });
});

describe('DeviceService', () => {
  function serviceFor(gateway: FakeDeviceGateway) {
    const { catalog, resolver } = resolverFor(gateway);
    return { service: new DeviceService(gateway, catalog, resolver), resolver };
  }

  describe('list', () => {
    it('always reads the current state', async () => {
      const gateway = gatewayWith();
      const { service } = serviceFor(gateway);
      await service.list();
      await service.list();
      expect(gateway.listCount).toBe(2);
    });

    it('puts booted simulators first, then sorts by name', async () => {
      const gateway = new FakeDeviceGateway([
        device('iPhone 15', 'A'),
        device('iPad Air', 'B'),
        device('Apple Watch', 'C', 'Booted'),
      ]);
      const names = (await serviceFor(gateway).service.list()).map((entry) => entry.name);
      expect(names).toEqual(['Apple Watch', 'iPad Air', 'iPhone 15']);
    });

    it('filters by state and platform', async () => {
      const { service } = serviceFor(gatewayWith());
      expect(await service.list({ bootedOnly: true })).toHaveLength(1);
      expect(await service.list({ platform: 'ios' })).toHaveLength(2);
      expect(await service.list({ platform: 'watchOS' })).toHaveLength(0);
    });
  });

  describe('boot', () => {
    it('boots a stopped simulator and shows its window', async () => {
      const gateway = gatewayWith();
      const result = await serviceFor(gateway).service.boot('iPad Air');
      expect(result).toMatchObject({ alreadyBooted: false, warning: undefined });
      expect(gateway.calls).toEqual([`boot ${IPAD}`, `open ${IPAD}`]);
    });

    it('does not boot a running simulator again', async () => {
      const gateway = gatewayWith();
      const result = await serviceFor(gateway).service.boot(IPHONE, false);
      expect(result.alreadyBooted).toBe(true);
      expect(gateway.calls).toEqual([]);
    });

    it('makes later calls see the simulator as booted', async () => {
      const gateway = gatewayWith();
      const { service, resolver } = serviceFor(gateway);
      await service.boot(IPAD, false);
      expect((await resolver.resolveBooted(IPAD)).isBooted).toBe(true);
    });

    it('succeeds with a warning when only the window fails to open', async () => {
      const gateway = gatewayWith();
      gateway.windowError = commandFailure('Unable to find application named Simulator');
      const result = await serviceFor(gateway).service.boot('iPad Air');
      expect(result.alreadyBooted).toBe(false);
      expect(result.warning).toContain('could not be opened');
      expect(result.warning).toContain('open_simulator_app');
    });

    it('still fails when the boot itself fails', async () => {
      const gateway = gatewayWith();
      gateway.bootError = commandFailure('Unable to boot device');
      await expect(serviceFor(gateway).service.boot('iPad Air')).rejects.toThrow('Unable to boot device');
    });

    it('drops the cached list even when the boot fails midway', async () => {
      const gateway = gatewayWith();
      const { service, resolver } = serviceFor(gateway);
      gateway.bootError = commandFailure('timed out');
      await service.boot('iPad Air').catch(() => undefined);
      const before = gateway.listCount;
      await resolver.resolve(IPAD);
      expect(gateway.listCount).toBe(before + 1);
    });

    it('lets unexpected errors from opening the window through', async () => {
      const gateway = gatewayWith();
      gateway.windowError = new TypeError('bug');
      await expect(serviceFor(gateway).service.boot('iPad Air')).rejects.toBeInstanceOf(TypeError);
    });
  });

  describe('shutdown', () => {
    it('shuts down the booted simulator by default', async () => {
      const gateway = gatewayWith();
      await serviceFor(gateway).service.shutdown();
      expect(gateway.calls).toEqual([`shutdown ${IPHONE}`]);
    });

    it('does nothing for a simulator that is already stopped', async () => {
      const gateway = gatewayWith();
      await serviceFor(gateway).service.shutdown(IPAD);
      expect(gateway.calls).toEqual([]);
    });

    it('shuts everything down', async () => {
      const gateway = gatewayWith({ ipad: 'Booted' });
      const { service, resolver } = serviceFor(gateway);
      await service.shutdownAll();
      await expect(resolver.resolveBooted()).rejects.toBeInstanceOf(NoBootedDeviceError);
    });
  });

  describe('erase', () => {
    it('erases a stopped simulator', async () => {
      const gateway = gatewayWith();
      await serviceFor(gateway).service.erase(IPAD);
      expect(gateway.calls).toEqual([`erase ${IPAD}`]);
    });

    it('refuses to erase a running simulator and never shuts it down itself', async () => {
      const gateway = gatewayWith();
      await expect(serviceFor(gateway).service.erase(IPHONE)).rejects.toBeInstanceOf(DeviceNotShutdownError);
      expect(gateway.calls).toEqual([]);
    });
  });

  describe('openSimulatorApp', () => {
    it('opens the app without focusing a device when none is given', async () => {
      const gateway = gatewayWith();
      await serviceFor(gateway).service.openSimulatorApp();
      expect(gateway.calls).toEqual(['open']);
    });

    it('focuses the given device', async () => {
      const gateway = gatewayWith();
      await serviceFor(gateway).service.openSimulatorApp('ipad air');
      expect(gateway.calls).toEqual([`open ${IPAD}`]);
    });
  });
});
