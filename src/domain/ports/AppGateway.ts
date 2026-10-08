import type { AppContainerKind, InstalledApp, LaunchOptions, LaunchResult } from '../InstalledApp.js';

/** Management of the applications installed in a booted simulator. */
export interface AppGateway {
  /**
   * Installs a `.app` bundle (or `.ipa` built for the simulator) from the host.
   * @throws PathNotFoundError when the bundle does not exist.
   */
  install(udid: string, appPath: string): Promise<void>;

  uninstall(udid: string, bundleId: string): Promise<void>;

  launch(udid: string, bundleId: string, options?: LaunchOptions): Promise<LaunchResult>;

  terminate(udid: string, bundleId: string): Promise<void>;

  isInstalled(udid: string, bundleId: string): Promise<boolean>;

  listInstalled(udid: string): Promise<InstalledApp[]>;

  /** Opens a URL, which may be a web address or a custom scheme / universal link. */
  openUrl(udid: string, url: string): Promise<void>;

  /** Host path of one of the containers owned by an installed app. */
  getContainerPath(udid: string, bundleId: string, kind: AppContainerKind): Promise<string>;
}
