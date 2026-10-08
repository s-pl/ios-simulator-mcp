import type { Runtime } from './Runtime.js';

/** Lifecycle states reported by CoreSimulator. */
export const DEVICE_STATES = ['Booted', 'Shutdown', 'Booting', 'ShuttingDown', 'Creating'] as const;

export type DeviceState = (typeof DEVICE_STATES)[number] | 'Unknown';

/** Normalises a raw state string coming from the simulator tooling. */
export function parseDeviceState(raw: string): DeviceState {
  const normalised = raw.replaceAll(' ', '');
  return (DEVICE_STATES as readonly string[]).includes(normalised)
    ? (normalised as DeviceState)
    : 'Unknown';
}

export interface DeviceProps {
  readonly udid: string;
  readonly name: string;
  readonly state: DeviceState;
  readonly runtime: Runtime;
  readonly isAvailable: boolean;
  readonly deviceTypeIdentifier?: string;
}

/** Plain representation of a {@link Device}, suitable for serialisation. */
export interface DeviceSnapshot {
  readonly udid: string;
  readonly name: string;
  readonly state: DeviceState;
  readonly runtime: string;
  readonly isAvailable: boolean;
}

/**
 * A simulated device as known by CoreSimulator.
 *
 * Instances are immutable snapshots: the state reflects the moment the device
 * list was read.
 */
export class Device {
  readonly udid: string;
  readonly name: string;
  readonly state: DeviceState;
  readonly runtime: Runtime;
  readonly isAvailable: boolean;
  readonly deviceTypeIdentifier: string | undefined;

  constructor(props: DeviceProps) {
    this.udid = props.udid;
    this.name = props.name;
    this.state = props.state;
    this.runtime = props.runtime;
    this.isAvailable = props.isAvailable;
    this.deviceTypeIdentifier = props.deviceTypeIdentifier;
  }

  get isBooted(): boolean {
    return this.state === 'Booted';
  }

  get isShutdown(): boolean {
    return this.state === 'Shutdown';
  }

  /** Unambiguous label for messages, e.g. `iPhone 15 (iOS 17.5, 1A2B…)`. */
  get label(): string {
    return `${this.name} (${this.runtime.displayName}, ${this.udid})`;
  }

  hasUdid(udid: string): boolean {
    return this.udid.toLowerCase() === udid.trim().toLowerCase();
  }

  hasName(name: string): boolean {
    return this.name.toLowerCase() === name.trim().toLowerCase();
  }

  toSnapshot(): DeviceSnapshot {
    return {
      udid: this.udid,
      name: this.name,
      state: this.state,
      runtime: this.runtime.displayName,
      isAvailable: this.isAvailable,
    };
  }
}
