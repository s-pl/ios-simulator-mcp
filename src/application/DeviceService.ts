import type { Device } from '../domain/Device.js';
import { DeviceNotShutdownError, SimulatorError } from '../domain/errors.js';
import type { DeviceGateway } from '../domain/ports/DeviceGateway.js';
import type { DeviceCatalog } from './DeviceCatalog.js';
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
  /** A non-fatal problem the client should know about, e.g. the window did not open. */
  readonly warning: string | undefined;
}

function firstLine(message: string): string {
  return message.split('\n').find((line) => line.trim().length > 0) ?? message;
}

/**
 * Use cases around the lifecycle of simulators.
 *
 * Every operation that changes the state of a simulator invalidates the
 * {@link DeviceCatalog}, so later calls never act on a stale device list.
 */
export class DeviceService {
  constructor(
    private readonly devices: DeviceGateway,
    private readonly catalog: DeviceCatalog,
    private readonly resolver: DeviceResolver,
  ) {}

  /** Lists usable simulators, booted ones first. Always reads the current state. */
  async list(filter: DeviceFilter = {}): Promise<Device[]> {
    const platform = filter.platform?.trim().toLowerCase();
    const all = await this.catalog.refresh();
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
      await this.changingState(() => this.devices.boot(device.udid));
    }
    return { device, alreadyBooted, warning: showWindow ? await this.showWindow(device) : undefined };
  }

  /**
   * Opens the Simulator window. Failing to do so does not undo the boot, so
   * it is reported as a warning instead of failing the whole operation.
   */
  private async showWindow(device: Device): Promise<string | undefined> {
    try {
      await this.devices.openSimulatorApp(device.udid);
      return undefined;
    } catch (error) {
      if (!(error instanceof SimulatorError)) {
        throw error;
      }
      return (
        `The Simulator window could not be opened (${firstLine(error.message)}). The simulator is running, ` +
        'but UI inspection needs the window: retry with open_simulator_app.'
      );
    }
  }

  /** Shuts down a simulator. Shutting down a stopped device is a no-op. */
  async shutdown(reference?: string): Promise<Device> {
    const device = await this.resolver.resolve(reference);
    if (!device.isShutdown) {
      await this.changingState(() => this.devices.shutdown(device.udid));
    }
    return device;
  }

  async shutdownAll(): Promise<void> {
    await this.changingState(() => this.devices.shutdownAll());
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
    await this.changingState(() => this.devices.erase(device.udid));
    return device;
  }

  async openSimulatorApp(reference?: string): Promise<void> {
    const udid = reference?.trim() ? (await this.resolver.resolve(reference)).udid : undefined;
    await this.devices.openSimulatorApp(udid);
  }

  /** Runs an operation that alters simulators; the catalog is dropped even if it fails midway. */
  private async changingState(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } finally {
      this.catalog.invalidate();
    }
  }
}
