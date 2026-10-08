import type { Device } from '../domain/Device.js';
import { DeviceNotShutdownError } from '../domain/errors.js';
import type { DeviceGateway } from '../domain/ports/DeviceGateway.js';
import type { DeviceResolver } from './DeviceResolver.js';

/** Criteria to narrow down the list of simulators. */
export interface DeviceFilter {
  /** Only running simulators. */
  readonly bootedOnly?: boolean;
  /** Only simulators of a platform, e.g. `iOS` (case-insensitive). */
  readonly platform?: string;
}

/** Outcome of a boot request. */
export interface BootResult {
  readonly device: Device;
  /** `true` when the device was already running and nothing had to be done. */
  readonly alreadyBooted: boolean;
}

/** Use cases around the lifecycle of simulators. */
export class DeviceService {
  constructor(
    private readonly devices: DeviceGateway,
    private readonly resolver: DeviceResolver,
  ) {}

  /** Lists usable simulators, booted ones first. */
  async list(filter: DeviceFilter = {}): Promise<Device[]> {
    const platform = filter.platform?.trim().toLowerCase();
    const all = await this.devices.list();
    return all
      .filter((device) => device.isAvailable)
      .filter((device) => !filter.bootedOnly || device.isBooted)
      .filter((device) => !platform || device.runtime.platform.toLowerCase() === platform)
      .sort((a, b) => Number(b.isBooted) - Number(a.isBooted) || a.name.localeCompare(b.name));
  }

  /**
   * Boots a simulator. Booting a running device is a no-op.
   * @param showWindow Also bring the Simulator window to the foreground.
   */
  async boot(reference: string, showWindow = true): Promise<BootResult> {
    const device = await this.resolver.resolve(reference);
    const alreadyBooted = device.isBooted;
    if (!alreadyBooted) {
      await this.devices.boot(device.udid);
    }
    if (showWindow) {
      await this.devices.openSimulatorApp(device.udid);
    }
    return { device, alreadyBooted };
  }

  /** Shuts down a simulator. Shutting down a stopped device is a no-op. */
  async shutdown(reference?: string): Promise<Device> {
    const device = await this.resolver.resolve(reference);
    if (!device.isShutdown) {
      await this.devices.shutdown(device.udid);
    }
    return device;
  }

  async shutdownAll(): Promise<void> {
    await this.devices.shutdownAll();
  }

  /**
   * Wipes a simulator back to factory settings.
   * The device must be shut down: erasing is destructive, so it is never
   * combined with an implicit shutdown.
   */
  async erase(reference: string): Promise<Device> {
    const device = await this.resolver.resolve(reference);
    if (!device.isShutdown) {
      throw new DeviceNotShutdownError(device.label, device.state);
    }
    await this.devices.erase(device.udid);
    return device;
  }

  async openSimulatorApp(reference?: string): Promise<void> {
    const udid = reference?.trim() ? (await this.resolver.resolve(reference)).udid : undefined;
    await this.devices.openSimulatorApp(udid);
  }
}
