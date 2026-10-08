/** Whether an app was installed by the user or ships with the runtime. */
export type AppType = 'User' | 'System' | 'Unknown';

/** Kinds of containers an installed app owns inside the simulator. */
export const APP_CONTAINER_KINDS = ['app', 'data', 'groups'] as const;

export type AppContainerKind = (typeof APP_CONTAINER_KINDS)[number];

/** An application installed in a simulator. */
export interface InstalledApp {
  readonly bundleId: string;
  readonly name: string;
  readonly version: string | undefined;
  readonly type: AppType;
  /** Path of the `.app` bundle on the host file system. */
  readonly bundlePath: string | undefined;
}

/** Options that tune how an app is launched. */
export interface LaunchOptions {
  /** Command line arguments forwarded to the app process. */
  readonly arguments?: readonly string[];
  /** Kill a running instance first so the app starts from scratch. */
  readonly terminateRunning?: boolean;
}

/** Outcome of launching an app. */
export interface LaunchResult {
  readonly bundleId: string;
  /** Process identifier, when the tooling reports it. */
  readonly pid: number | undefined;
}
