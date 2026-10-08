import path from 'node:path';

import { Device, parseDeviceState } from '../../domain/Device.js';
import { SimulatorError, UnexpectedOutputError } from '../../domain/errors.js';
import type { DeviceGateway } from '../../domain/ports/DeviceGateway.js';
import { Runtime } from '../../domain/Runtime.js';
import type { SimulatorHost } from '../host/SimulatorHost.js';

/** Booting a cold simulator can take minutes on a busy machine. */
const BOOT_TIMEOUT_MS = 180_000;

/** Shape of `simctl list devices --json`. */
interface SimctlDeviceList {
  readonly devices?: Record<string, readonly SimctlDevice[]>;
}

interface SimctlDevice {
  readonly udid?: string;
  readonly name?: string;
  readonly state?: string;
  readonly isAvailable?: boolean;
  readonly deviceTypeIdentifier?: string;
}

/** Shape of `simctl list devicetypes --json`. */
interface SimctlDeviceTypeList {
  readonly devicetypes?: readonly { readonly identifier?: string; readonly bundlePath?: string }[];
}

/** {@link DeviceGateway} implemented with `xcrun simctl`. */
export class SimctlDeviceGateway implements DeviceGateway {
  /** Screen scales already looked up; a device type never changes its scale. */
  private readonly screenScales = new Map<string, number>();

  constructor(private readonly host: SimulatorHost) {}

  async list(): Promise<Device[]> {
    const { stdout } = await this.host.simctl(['list', 'devices', '--json']);
    return parseDeviceList(stdout);
  }

  async boot(udid: string): Promise<void> {
    await this.host.simctl(['boot', udid]);
    // `boot` returns as soon as the boot is initiated; `bootstatus -b` blocks
    // until the system is actually usable.
    await this.host.simctl(['bootstatus', udid, '-b'], { timeoutMs: BOOT_TIMEOUT_MS });
  }

  async shutdown(udid: string): Promise<void> {
    await this.host.simctl(['shutdown', udid]);
  }

  async shutdownAll(): Promise<void> {
    await this.host.simctl(['shutdown', 'all']);
  }

  async erase(udid: string): Promise<void> {
    await this.host.simctl(['erase', udid]);
  }

  async screenScale(deviceTypeIdentifier: string): Promise<number | undefined> {
    const known = this.screenScales.get(deviceTypeIdentifier);
    if (known !== undefined) {
      return known;
    }
    try {
      const scale = await this.readScreenScale(deviceTypeIdentifier);
      if (scale !== undefined) {
        this.screenScales.set(deviceTypeIdentifier, scale);
      }
      return scale;
    } catch (error) {
      if (error instanceof SimulatorError) {
        // The scale is an optimisation aid; not knowing it must never break a capture.
        return undefined;
      }
      throw error;
    }
  }

  /**
   * simctl does not report the scale, but every device type bundle ships a
   * `profile.plist` describing its screen.
   */
  private async readScreenScale(deviceTypeIdentifier: string): Promise<number | undefined> {
    const { stdout } = await this.host.simctl(['list', 'devicetypes', '--json']);
    const bundlePath = parseDeviceTypeBundlePath(stdout, deviceTypeIdentifier);
    if (!bundlePath) {
      return undefined;
    }
    const profile = path.posix.join(bundlePath, 'Contents', 'Resources', 'profile.plist');
    const result = await this.host.run('plutil', ['-extract', 'mainScreenScale', 'raw', '-o', '-', profile]);
    const scale = Number.parseFloat(result.stdout);
    return Number.isFinite(scale) && scale >= 1 ? scale : undefined;
  }

  async openSimulatorApp(udid?: string): Promise<void> {
    const focus = udid ? ['--args', '-CurrentDeviceUDID', udid] : [];
    await this.host.run('open', ['-a', 'Simulator', ...focus]);
  }
}

/** Finds the bundle of a device type in the output of `simctl list devicetypes --json`. */
export function parseDeviceTypeBundlePath(json: string, deviceTypeIdentifier: string): string | undefined {
  let parsed: SimctlDeviceTypeList;
  try {
    parsed = JSON.parse(json) as SimctlDeviceTypeList;
  } catch (error) {
    throw new UnexpectedOutputError('simctl list devicetypes', 'the output is not valid JSON', { cause: error });
  }
  return parsed.devicetypes?.find((type) => type.identifier === deviceTypeIdentifier)?.bundlePath;
}

/** Parses the JSON printed by `simctl list devices --json`. */
export function parseDeviceList(json: string): Device[] {
  let parsed: SimctlDeviceList;
  try {
    parsed = JSON.parse(json) as SimctlDeviceList;
  } catch (error) {
    throw new UnexpectedOutputError('simctl list devices', 'the output is not valid JSON', { cause: error });
  }

  const devices: Device[] = [];
  for (const [runtimeIdentifier, entries] of Object.entries(parsed.devices ?? {})) {
    const runtime = Runtime.fromIdentifier(runtimeIdentifier);
    for (const entry of entries) {
      if (!entry.udid || !entry.name) {
        continue;
      }
      devices.push(
        new Device({
          udid: entry.udid,
          name: entry.name,
          state: parseDeviceState(entry.state ?? ''),
          runtime,
          isAvailable: entry.isAvailable ?? false,
          deviceTypeIdentifier: entry.deviceTypeIdentifier,
        }),
      );
    }
  }
  return devices;
}
