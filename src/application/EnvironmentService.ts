import type { Device } from '../domain/Device.js';
import type {
  Appearance,
  GeoLocation,
  PermissionChange,
  StatusBarOverrides,
} from '../domain/environment.js';
import { InvalidArgumentError } from '../domain/errors.js';
import type { EnvironmentGateway } from '../domain/ports/EnvironmentGateway.js';
import type { DeviceResolver } from './DeviceResolver.js';

/** Use cases to shape the simulated environment of a booted device. */
export class EnvironmentService {
  constructor(
    private readonly environment: EnvironmentGateway,
    private readonly resolver: DeviceResolver,
  ) {}

  async setAppearance(appearance: Appearance, reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.environment.setAppearance(device.udid, appearance);
    return device;
  }

  async setLocation(location: GeoLocation, reference?: string): Promise<Device> {
    if (Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) {
      throw new InvalidArgumentError(
        `Invalid coordinates (${location.latitude}, ${location.longitude}): latitude must be within ±90 and longitude within ±180.`,
      );
    }
    const device = await this.resolver.resolveBooted(reference);
    await this.environment.setLocation(device.udid, location);
    return device;
  }

  async clearLocation(reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.environment.clearLocation(device.udid);
    return device;
  }

  async overrideStatusBar(overrides: StatusBarOverrides, reference?: string): Promise<Device> {
    if (Object.values(overrides).every((value) => value === undefined)) {
      throw new InvalidArgumentError('Provide at least one status bar value to override.');
    }
    const device = await this.resolver.resolveBooted(reference);
    await this.environment.overrideStatusBar(device.udid, overrides);
    return device;
  }

  async clearStatusBar(reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.environment.clearStatusBar(device.udid);
    return device;
  }

  async changePermission(change: PermissionChange, reference?: string): Promise<Device> {
    if (change.action !== 'reset' && !change.bundleId) {
      throw new InvalidArgumentError(`A bundleId is required to ${change.action} a permission.`);
    }
    const device = await this.resolver.resolveBooted(reference);
    await this.environment.changePermission(device.udid, change);
    return device;
  }

  async sendPushNotification(
    bundleId: string,
    payload: Record<string, unknown>,
    reference?: string,
  ): Promise<Device> {
    if (typeof payload['aps'] !== 'object' || payload['aps'] === null) {
      throw new InvalidArgumentError('A push payload must contain an "aps" object.');
    }
    const device = await this.resolver.resolveBooted(reference);
    await this.environment.sendPushNotification(device.udid, bundleId, payload);
    return device;
  }
}
