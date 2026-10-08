import type { Device } from '../domain/Device.js';
import {
  AmbiguousDeviceError,
  DeviceNotBootedError,
  DeviceNotFoundError,
  NoBootedDeviceError,
} from '../domain/errors.js';
import type { DeviceGateway } from '../domain/ports/DeviceGateway.js';

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
 */
export class DeviceResolver {
  constructor(private readonly devices: DeviceGateway) {}

  /** Resolves a reference to a device in any state. */
  async resolve(reference?: string): Promise<Device> {
    const available = (await this.devices.list()).filter((device) => device.isAvailable);
    const trimmed = reference?.trim();
    return trimmed ? this.findByReference(available, trimmed) : this.findOnlyBooted(available);
  }

  /** Resolves a reference and guarantees the device is running. */
  async resolveBooted(reference?: string): Promise<Device> {
    const device = await this.resolve(reference);
    if (!device.isBooted) {
      throw new DeviceNotBootedError(device.label, device.state);
    }
    return device;
  }

  private findOnlyBooted(devices: readonly Device[]): Device {
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

  private findByReference(devices: readonly Device[], reference: string): Device {
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
}
