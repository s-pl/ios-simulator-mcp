import type { Device } from '../domain/Device.js';
import { AppNotInstalledError, CommandFailedError, InvalidArgumentError } from '../domain/errors.js';
import type { AppContainerKind, AppType, InstalledApp, LaunchOptions, LaunchResult } from '../domain/InstalledApp.js';
import type { AppGateway } from '../domain/ports/AppGateway.js';
import type { DeviceResolver } from './DeviceResolver.js';
import type { OnDevice } from './OnDevice.js';

/** A URL is a scheme (`https:`, `myapp:`) followed by something other than just slashes. */
const URL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/*[^\s/]\S*$/;

/** Use cases around the apps installed in a booted simulator. */
export class AppService {
  constructor(
    private readonly apps: AppGateway,
    private readonly resolver: DeviceResolver,
  ) {}

  async install(appPath: string, reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.apps.install(device.udid, appPath);
    return device;
  }

  /** @throws AppNotInstalledError rather than silently "uninstalling" an app that is not there. */
  async uninstall(bundleId: string, reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    if (!(await this.apps.isInstalled(device.udid, bundleId))) {
      throw new AppNotInstalledError(bundleId, device.label);
    }
    await this.apps.uninstall(device.udid, bundleId);
    return device;
  }

  async launch(bundleId: string, options: LaunchOptions = {}, reference?: string): Promise<OnDevice<LaunchResult>> {
    const device = await this.resolver.resolveBooted(reference);
    const value = await this.explainingMissingApp(device, bundleId, () =>
      this.apps.launch(device.udid, bundleId, options),
    );
    return { device, value };
  }

  async terminate(bundleId: string, reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.explainingMissingApp(device, bundleId, () => this.apps.terminate(device.udid, bundleId));
    return device;
  }

  /**
   * Lists installed apps sorted by name.
   * @param type Restrict the list to user-installed or system apps.
   */
  async list(type?: AppType, reference?: string): Promise<OnDevice<InstalledApp[]>> {
    const device = await this.resolver.resolveBooted(reference);
    const installed = await this.apps.listInstalled(device.udid);
    const value = installed.filter((app) => !type || app.type === type).sort((a, b) => a.name.localeCompare(b.name));
    return { device, value };
  }

  async openUrl(url: string, reference?: string): Promise<Device> {
    const trimmed = url.trim();
    if (!URL_PATTERN.test(trimmed)) {
      throw new InvalidArgumentError(
        `"${url}" is not a URL. Include the scheme, e.g. https://example.com or myapp://path.`,
      );
    }
    const device = await this.resolver.resolveBooted(reference);
    await this.apps.openUrl(device.udid, trimmed);
    return device;
  }

  async getContainerPath(
    bundleId: string,
    kind: AppContainerKind = 'data',
    reference?: string,
  ): Promise<OnDevice<string>> {
    const device = await this.resolver.resolveBooted(reference);
    const value = await this.explainingMissingApp(device, bundleId, () =>
      this.apps.getContainerPath(device.udid, bundleId, kind),
    );
    return { device, value };
  }

  /**
   * Runs an operation on an app and, if the underlying command fails, checks
   * whether the real cause is simply that the app is not installed. The check
   * only happens on failure, so the common path costs nothing extra.
   */
  private async explainingMissingApp<T>(device: Device, bundleId: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CommandFailedError && !(await this.isInstalledSafely(device, bundleId))) {
        throw new AppNotInstalledError(bundleId, device.label);
      }
      throw error;
    }
  }

  private async isInstalledSafely(device: Device, bundleId: string): Promise<boolean> {
    try {
      return await this.apps.isInstalled(device.udid, bundleId);
    } catch {
      // Could not tell: assume it is installed so the original error is reported.
      return true;
    }
  }
}
