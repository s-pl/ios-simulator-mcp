import type { Appearance, GeoLocation, PermissionChange, StatusBarOverrides } from '../../domain/environment.js';
import { CommandFailedError } from '../../domain/errors.js';
import type { EnvironmentGateway } from '../../domain/ports/EnvironmentGateway.js';
import type { CommandResult } from '../process/CommandRunner.js';
import type { SimulatorHost } from '../host/SimulatorHost.js';

/** `simctl status_bar override` flag for each overridable field. */
const STATUS_BAR_FLAGS: Record<keyof StatusBarOverrides, string> = {
  time: '--time',
  dataNetwork: '--dataNetwork',
  wifiMode: '--wifiMode',
  wifiBars: '--wifiBars',
  cellularMode: '--cellularMode',
  cellularBars: '--cellularBars',
  operatorName: '--operatorName',
  batteryState: '--batteryState',
  batteryLevel: '--batteryLevel',
};

/** Attempts given to a pasteboard command before its timeout is reported. */
const PASTEBOARD_ATTEMPTS = 3;

/** {@link EnvironmentGateway} implemented with `xcrun simctl`. */
export class SimctlEnvironmentGateway implements EnvironmentGateway {
  constructor(private readonly host: SimulatorHost) {}

  async setAppearance(udid: string, appearance: Appearance): Promise<void> {
    await this.host.simctl(['ui', udid, 'appearance', appearance]);
  }

  async setLocation(udid: string, location: GeoLocation): Promise<void> {
    await this.host.simctl(['location', udid, 'set', `${location.latitude},${location.longitude}`]);
  }

  async clearLocation(udid: string): Promise<void> {
    await this.host.simctl(['location', udid, 'clear']);
  }

  async overrideStatusBar(udid: string, overrides: StatusBarOverrides): Promise<void> {
    await this.host.simctl(['status_bar', udid, 'override', ...statusBarArguments(overrides)]);
  }

  async clearStatusBar(udid: string): Promise<void> {
    await this.host.simctl(['status_bar', udid, 'clear']);
  }

  async changePermission(udid: string, change: PermissionChange): Promise<void> {
    const target = change.bundleId ? [change.bundleId] : [];
    await this.host.simctl(['privacy', udid, change.action, change.service, ...target]);
  }

  async setClipboard(udid: string, text: string): Promise<void> {
    await this.pasteboard(() => this.host.simctl(['pbcopy', udid], { stdin: text }));
  }

  async getClipboard(udid: string): Promise<string> {
    const { stdout } = await this.pasteboard(() => this.host.simctl(['pbpaste', udid]));
    return stdout;
  }

  /**
   * The simulator's pasteboard service intermittently answers "Operation
   * timed out", typically right after another operation restarted a system
   * service. The same command succeeds when repeated, so it is retried.
   */
  private async pasteboard(command: () => Promise<CommandResult>): Promise<CommandResult> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await command();
      } catch (error) {
        const transient = error instanceof CommandFailedError && /timed out/i.test(error.stderr);
        if (!transient || attempt >= PASTEBOARD_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  async sendPushNotification(udid: string, bundleId: string, payload: Record<string, unknown>): Promise<void> {
    // "-" makes simctl read the payload from standard input, avoiding a temp file.
    await this.host.simctl(['push', udid, bundleId, '-'], { stdin: JSON.stringify(payload) });
  }
}

/** Translates overrides into `simctl status_bar override` arguments. */
export function statusBarArguments(overrides: StatusBarOverrides): string[] {
  const args: string[] = [];
  for (const [field, flag] of Object.entries(STATUS_BAR_FLAGS) as [keyof StatusBarOverrides, string][]) {
    const value = overrides[field];
    if (value !== undefined) {
      args.push(flag, String(value));
    }
  }
  return args;
}
