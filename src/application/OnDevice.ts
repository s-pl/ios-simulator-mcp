import type { Device } from '../domain/Device.js';

/**
 * Result of an operation together with the device it ran on.
 *
 * Clients may omit the device, so use cases report which simulator was
 * actually resolved alongside their result.
 */
export interface OnDevice<T> {
  readonly device: Device;
  readonly value: T;
}
