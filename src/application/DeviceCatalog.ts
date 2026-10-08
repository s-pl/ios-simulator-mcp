import type { Device } from '../domain/Device.js';
import type { DeviceGateway } from '../domain/ports/DeviceGateway.js';
import { SystemClock, type Clock } from './Clock.js';

export interface DeviceCatalogOptions {
  /** How long a device list stays valid, in milliseconds. `0` disables caching. */
  readonly ttlMs: number;
  readonly clock?: Clock;
}

interface Snapshot {
  readonly devices: readonly Device[];
  readonly takenAt: number;
}

/**
 * Short-lived cache of the simulators known to the host.
 *
 * Nearly every tool call has to resolve a device, and asking the host for the
 * list is one of the slowest things the server does. The catalog lets a burst
 * of calls share one listing.
 *
 * Simulators can change behind the server's back (the user boots one from
 * Xcode), so the cache is only ever trusted for a *positive* answer:
 * {@link DeviceResolver} retries against a fresh list before reporting that a
 * device is missing or not booted, and every operation that changes a
 * simulator's state must call {@link invalidate}.
 */
export class DeviceCatalog {
  private readonly ttlMs: number;
  private readonly clock: Clock;
  private snapshot: Snapshot | undefined;

  constructor(
    private readonly gateway: DeviceGateway,
    options: DeviceCatalogOptions,
  ) {
    this.ttlMs = options.ttlMs;
    this.clock = options.clock ?? new SystemClock();
  }

  /** The cached list while it is still valid, otherwise `undefined`. */
  cached(): readonly Device[] | undefined {
    if (!this.snapshot || this.clock.now() - this.snapshot.takenAt >= this.ttlMs) {
      return undefined;
    }
    return this.snapshot.devices;
  }

  /** Reads the list from the host and caches it. */
  async refresh(): Promise<readonly Device[]> {
    const devices = await this.gateway.list();
    this.snapshot = { devices, takenAt: this.clock.now() };
    return devices;
  }

  /** Forgets the cached list; call it after changing the state of any simulator. */
  invalidate(): void {
    this.snapshot = undefined;
  }
}
