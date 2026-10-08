import { CommandFailedError, UnexpectedOutputError } from '../../domain/errors.js';
import type {
  AppContainerKind,
  AppType,
  InstalledApp,
  LaunchOptions,
  LaunchResult,
} from '../../domain/InstalledApp.js';
import type { AppGateway } from '../../domain/ports/AppGateway.js';
import { existingPath } from '../host/paths.js';
import type { SimulatorHost } from '../host/SimulatorHost.js';

/** Installing copies the whole bundle into the simulator, which can be slow for big apps. */
const INSTALL_TIMEOUT_MS = 300_000;

/** Subset of the per-app dictionary printed by `simctl listapps`. */
interface SimctlAppEntry {
  readonly CFBundleIdentifier?: string;
  readonly CFBundleDisplayName?: string;
  readonly CFBundleName?: string;
  readonly CFBundleShortVersionString?: string;
  readonly CFBundleVersion?: string;
  readonly ApplicationType?: string;
  readonly Path?: string;
}

/** {@link AppGateway} implemented with `xcrun simctl`. */
export class SimctlAppGateway implements AppGateway {
  constructor(private readonly host: SimulatorHost) {}

  async install(udid: string, appPath: string): Promise<void> {
    await this.host.simctl(['install', udid, await existingPath(appPath)], { timeoutMs: INSTALL_TIMEOUT_MS });
  }

  async uninstall(udid: string, bundleId: string): Promise<void> {
    await this.host.simctl(['uninstall', udid, bundleId]);
  }

  async launch(udid: string, bundleId: string, options: LaunchOptions = {}): Promise<LaunchResult> {
    const flags = options.terminateRunning ? ['--terminate-running-process'] : [];
    const { stdout } = await this.host.simctl(['launch', ...flags, udid, bundleId, ...(options.arguments ?? [])]);
    return { bundleId, pid: parseLaunchPid(stdout) };
  }

  async terminate(udid: string, bundleId: string): Promise<void> {
    await this.host.simctl(['terminate', udid, bundleId]);
  }

  async isInstalled(udid: string, bundleId: string): Promise<boolean> {
    // Much cheaper than listing every app: simctl fails when the bundle id is unknown.
    try {
      await this.host.simctl(['get_app_container', udid, bundleId, 'app']);
      return true;
    } catch (error) {
      if (error instanceof CommandFailedError) {
        return false;
      }
      throw error;
    }
  }

  async listInstalled(udid: string): Promise<InstalledApp[]> {
    // `listapps` prints an old-style property list; plutil turns it into JSON.
    const plist = await this.host.simctlRepeatable(['listapps', udid]);
    const { stdout } = await this.host.run('plutil', ['-convert', 'json', '-o', '-', '-'], {
      stdin: plist.stdout,
    });
    return parseAppList(stdout);
  }

  async openUrl(udid: string, url: string): Promise<void> {
    await this.host.simctlRepeatable(['openurl', udid, url]);
  }

  async getContainerPath(udid: string, bundleId: string, kind: AppContainerKind): Promise<string> {
    const { stdout } = await this.host.simctlRepeatable(['get_app_container', udid, bundleId, kind]);
    return stdout.trim();
  }
}

/** Extracts the PID from the `<bundle id>: <pid>` line printed by `simctl launch`. */
export function parseLaunchPid(output: string): number | undefined {
  const match = /:\s*(\d+)\s*$/m.exec(output);
  return match?.[1] ? Number(match[1]) : undefined;
}

/** Parses the output of `simctl listapps` once converted to JSON. */
export function parseAppList(json: string): InstalledApp[] {
  let parsed: Record<string, SimctlAppEntry>;
  try {
    parsed = JSON.parse(json) as Record<string, SimctlAppEntry>;
  } catch (error) {
    throw new UnexpectedOutputError('simctl listapps', 'the output is not valid JSON', { cause: error });
  }

  return Object.entries(parsed).map(([key, entry]) => {
    const bundleId = entry.CFBundleIdentifier ?? key;
    return {
      bundleId,
      name: entry.CFBundleDisplayName || entry.CFBundleName || bundleId,
      version: entry.CFBundleShortVersionString ?? entry.CFBundleVersion,
      type: parseAppType(entry.ApplicationType),
      bundlePath: entry.Path,
    };
  });
}

function parseAppType(raw: string | undefined): AppType {
  return raw === 'User' || raw === 'System' ? raw : 'Unknown';
}
