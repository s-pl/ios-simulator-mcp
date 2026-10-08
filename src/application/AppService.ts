import type { Device } from '../domain/Device.js';
import type {
  AppContainerKind,
  AppType,
  InstalledApp,
  LaunchOptions,
  LaunchResult,
} from '../domain/InstalledApp.js';
import type { AppGateway } from '../domain/ports/AppGateway.js';
import type { DeviceResolver } from './DeviceResolver.js';
import type { OnDevice } from './OnDevice.js';

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

  async uninstall(bundleId: string, reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.apps.uninstall(device.udid, bundleId);
    return device;
  }

  async launch(bundleId: string, options: LaunchOptions = {}, reference?: string): Promise<OnDevice<LaunchResult>> {
    const device = await this.resolver.resolveBooted(reference);
    const value = await this.apps.launch(device.udid, bundleId, options);
    return { device, value };
  }

  async terminate(bundleId: string, reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.apps.terminate(device.udid, bundleId);
    return device;
  }

  /**
   * Lists installed apps sorted by name.
   * @param type Restrict the list to user-installed or system apps.
   */
  async list(type?: AppType, reference?: string): Promise<OnDevice<InstalledApp[]>> {
    const device = await this.resolver.resolveBooted(reference);
    const installed = await this.apps.listInstalled(device.udid);
    const value = installed
      .filter((app) => !type || app.type === type)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { device, value };
  }

  async openUrl(url: string, reference?: string): Promise<Device> {
    const device = await this.resolver.resolveBooted(reference);
    await this.apps.openUrl(device.udid, url);
    return device;
  }

  async getContainerPath(
    bundleId: string,
    kind: AppContainerKind = 'data',
    reference?: string,
  ): Promise<OnDevice<string>> {
    const device = await this.resolver.resolveBooted(reference);
    const value = await this.apps.getContainerPath(device.udid, bundleId, kind);
    return { device, value };
  }
}
