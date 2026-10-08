import type { Device } from '../Device.js';

/** Access to the simulators registered on the host and their lifecycle. */
export interface DeviceGateway {
  /** Every simulator known to the host, in any state. */
  list(): Promise<Device[]>;

  /** Boots a device and resolves once the system has finished starting up. */
  boot(udid: string): Promise<void>;

  shutdown(udid: string): Promise<void>;

  shutdownAll(): Promise<void>;

  /** Restores a device to factory settings, deleting its apps and data. */
  erase(udid: string): Promise<void>;

  /**
   * Number of pixels per point on the screen of a device type (2 or 3 on
   * current hardware), or `undefined` when it cannot be determined.
   */
  screenScale(deviceTypeIdentifier: string): Promise<number | undefined>;

  /** Brings the Simulator window to the foreground, focused on the device when given. */
  openSimulatorApp(udid?: string): Promise<void>;
}
