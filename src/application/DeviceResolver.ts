import type { Device } from '../domain/Device.js';
import {
  AmbiguousDeviceError,
  DeviceNotBootedError,
  DeviceNotFoundError,
  NoBootedDeviceError,
  SimulatorError,
} from '../domain/errors.js';
import type { DeviceCatalog } from './DeviceCatalog.js';

/**
 * Turns the loose device reference a client provides (a UDID, a name, or
 * nothing at all) into exactly one {@link Device}.
 *
 * Resolution rules:
 * 1. No reference: the only booted simulator.
 * 2. A reference matching a UDID: that device.
 * 3. A reference matching a name: that device; when several runtimes share
 *    the name, the single booted one wins.
 *
 * Anything else fails with an error that tells the client how to disambiguate.
 *
 * The cached device list is used when it yields an answer. A failure is never
 * reported from cached data: the list is read again first, so a simulator
 * booted outside the server is always found.
 */
export class DeviceResolver {
  constructor(private readonly catalog: DeviceCatalog) {}

  /** Resolves a reference to a device in any state. */
  resolve(reference?: string): Promise<Device> {
    return this.find(reference, false);
  }

  /** Resolves a reference and guarantees the device is running. */
  resolveBooted(reference?: string): Promise<Device> {
    return this.find(reference, true);
  }

  private async find(reference: string | undefined, mustBeBooted: boolean): Promise<Device> {
    const cached = this.catalog.cached();
    if (cached) {
      try {
        return pick(cached, reference, mustBeBooted);
      } catch (error) {
        if (!(error instanceof SimulatorError)) {
          throw error;
        }
        // The cache may be stale; decide on fresh data below.
      }
    }
    return pick(await this.catalog.refresh(), reference, mustBeBooted);
  }
}

function pick(devices: readonly Device[], reference: string | undefined, mustBeBooted: boolean): Device {
  const available = devices.filter((device) => device.isAvailable);
  const trimmed = reference?.trim();
  const device = trimmed ? findByReference(available, trimmed) : findOnlyBooted(available);
  if (mustBeBooted && !device.isBooted) {
    throw new DeviceNotBootedError(device.label, device.state);
  }
  return device;
}

function findOnlyBooted(devices: readonly Device[]): Device {
  const booted = devices.filter((device) => device.isBooted);
  const [first] = booted;
  if (!first) {
    throw new NoBootedDeviceError();
  }
  if (booted.length > 1) {
    throw new AmbiguousDeviceError('Several simulators are booted.', booted.map((device) => device.label));
  }
  return first;
}

function findByReference(devices: readonly Device[], reference: string): Device {
  const byUdid = devices.find((device) => device.hasUdid(reference));
  if (byUdid) {
    return byUdid;
  }

  const byName = devices.filter((device) => device.hasName(reference));
  const [first] = byName;
  if (!first) {
    throw new DeviceNotFoundError(reference);
  }
  if (byName.length === 1) {
    return first;
  }

  const booted = byName.filter((device) => device.isBooted);
  const [onlyBooted] = booted;
  if (onlyBooted && booted.length === 1) {
    return onlyBooted;
  }
  throw new AmbiguousDeviceError(
    `Several simulators are named "${reference}".`,
    byName.map((device) => device.label),
  );
}
