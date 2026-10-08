import { DeviceCatalog } from '../../src/application/DeviceCatalog.js';
import { DeviceResolver } from '../../src/application/DeviceResolver.js';
import { Device, type DeviceState } from '../../src/domain/Device.js';
import type { PermissionChange, StatusBarOverrides } from '../../src/domain/environment.js';
import { CommandFailedError } from '../../src/domain/errors.js';
import type { Point } from '../../src/domain/geometry.js';
import type { AppContainerKind, InstalledApp, LaunchOptions, LaunchResult } from '../../src/domain/InstalledApp.js';
import type { CaptureOptions, CapturedImage, ImageFormat, RecordingSession } from '../../src/domain/media.js';
import type { AppGateway } from '../../src/domain/ports/AppGateway.js';
import type { DeviceGateway } from '../../src/domain/ports/DeviceGateway.js';
import type { EnvironmentGateway } from '../../src/domain/ports/EnvironmentGateway.js';
import type { LogGateway, LogQuery } from '../../src/domain/ports/LogGateway.js';
import type { MediaGateway } from '../../src/domain/ports/MediaGateway.js';
import type { UiAutomationGateway } from '../../src/domain/ports/UiAutomationGateway.js';
import { Runtime } from '../../src/domain/Runtime.js';
import type { UiElement } from '../../src/domain/ui.js';
import { FakeClock } from './FakeClock.js';

/** In-memory implementations of the domain ports, for testing the application layer alone. */

const IOS_17 = Runtime.fromIdentifier('com.apple.CoreSimulator.SimRuntime.iOS-17-5');

export function device(name: string, udid: string, state: DeviceState = 'Shutdown', deviceType?: string): Device {
  return new Device({ udid, name, state, runtime: IOS_17, isAvailable: true, deviceTypeIdentifier: deviceType });
}

export class FakeDeviceGateway implements DeviceGateway {
  readonly calls: string[] = [];
  listCount = 0;
  scale: number | undefined = 3;
  /** Makes the next attempt to open the Simulator window fail. */
  windowError: Error | undefined;
  bootError: Error | undefined;

  constructor(public devices: Device[]) {}

  async list(): Promise<Device[]> {
    this.listCount += 1;
    return this.devices;
  }

  async boot(udid: string): Promise<void> {
    this.calls.push(`boot ${udid}`);
    if (this.bootError) {
      throw this.bootError;
    }
    this.setState(udid, 'Booted');
  }

  async shutdown(udid: string): Promise<void> {
    this.calls.push(`shutdown ${udid}`);
    this.setState(udid, 'Shutdown');
  }

  async shutdownAll(): Promise<void> {
    this.calls.push('shutdownAll');
    this.devices = this.devices.map((entry) => device(entry.name, entry.udid, 'Shutdown'));
  }

  async erase(udid: string): Promise<void> {
    this.calls.push(`erase ${udid}`);
  }

  async screenScale(deviceTypeIdentifier: string): Promise<number | undefined> {
    this.calls.push(`screenScale ${deviceTypeIdentifier}`);
    return this.scale;
  }

  async openSimulatorApp(udid?: string): Promise<void> {
    this.calls.push(`open ${udid ?? ''}`.trim());
    if (this.windowError) {
      throw this.windowError;
    }
  }

  /** Changes a device's state as something outside the server would. */
  setState(udid: string, state: DeviceState): void {
    this.devices = this.devices.map((entry) =>
      entry.udid === udid ? device(entry.name, entry.udid, state, entry.deviceTypeIdentifier) : entry,
    );
  }
}

/** Wires a resolver over a fake device gateway. */
export function resolverFor(gateway: FakeDeviceGateway, ttlMs = 10_000, clock = new FakeClock()) {
  const catalog = new DeviceCatalog(gateway, { ttlMs, clock });
  return { catalog, resolver: new DeviceResolver(catalog), clock };
}

export class FakeUiGateway implements UiAutomationGateway {
  readonly calls: string[] = [];
  /** Screens returned by successive reads; the last one repeats. */
  screens: UiElement[][] = [[]];
  describeCount = 0;
  failOn: { call: string; error: Error } | undefined;

  private record(call: string): void {
    this.calls.push(call);
    if (this.failOn && call.startsWith(this.failOn.call)) {
      throw this.failOn.error;
    }
  }

  async tap(_udid: string, point: Point, durationSeconds?: number): Promise<void> {
    this.record(`tap ${point.x},${point.y}${durationSeconds ? ` ${durationSeconds}s` : ''}`);
  }

  async swipe(_udid: string, from: Point, to: Point): Promise<void> {
    this.record(`swipe ${from.x},${from.y} ${to.x},${to.y}`);
  }

  async typeText(_udid: string, text: string): Promise<void> {
    this.record(`type ${text}`);
  }

  async pressButton(_udid: string, button: string): Promise<void> {
    this.record(`button ${button}`);
  }

  async pressKey(_udid: string, keyCode: number): Promise<void> {
    this.record(`key ${keyCode}`);
  }

  async describeScreen(): Promise<UiElement[]> {
    const screen = this.screens[Math.min(this.describeCount, this.screens.length - 1)] ?? [];
    this.describeCount += 1;
    if (this.failOn?.call === 'describe') {
      throw this.failOn.error;
    }
    return screen;
  }

  async describePoint(_udid: string, point: Point): Promise<UiElement | undefined> {
    this.record(`describePoint ${point.x},${point.y}`);
    return this.screens[0]?.find((entry) => entry.frame.contains(point));
  }
}

export class FakeAppGateway implements AppGateway {
  readonly calls: string[] = [];
  installed = new Set<string>(['com.example.app']);
  apps: InstalledApp[] = [];
  /** Errors thrown by the named operation. */
  failures: Partial<Record<'launch' | 'terminate' | 'container' | 'isInstalled', Error>> = {};

  async install(_udid: string, appPath: string): Promise<void> {
    this.calls.push(`install ${appPath}`);
  }

  async uninstall(_udid: string, bundleId: string): Promise<void> {
    this.calls.push(`uninstall ${bundleId}`);
    this.installed.delete(bundleId);
  }

  async launch(_udid: string, bundleId: string, options: LaunchOptions = {}): Promise<LaunchResult> {
    this.calls.push(`launch ${bundleId}${options.terminateRunning ? ' fresh' : ''}`);
    if (this.failures.launch) {
      throw this.failures.launch;
    }
    return { bundleId, pid: 42 };
  }

  async terminate(_udid: string, bundleId: string): Promise<void> {
    this.calls.push(`terminate ${bundleId}`);
    if (this.failures.terminate) {
      throw this.failures.terminate;
    }
  }

  async isInstalled(_udid: string, bundleId: string): Promise<boolean> {
    this.calls.push(`isInstalled ${bundleId}`);
    if (this.failures.isInstalled) {
      throw this.failures.isInstalled;
    }
    return this.installed.has(bundleId);
  }

  async listInstalled(): Promise<InstalledApp[]> {
    return this.apps;
  }

  async openUrl(_udid: string, url: string): Promise<void> {
    this.calls.push(`openUrl ${url}`);
  }

  async getContainerPath(_udid: string, bundleId: string, kind: AppContainerKind): Promise<string> {
    this.calls.push(`container ${bundleId} ${kind}`);
    if (this.failures.container) {
      throw this.failures.container;
    }
    return `/containers/${bundleId}/${kind}`;
  }
}

export class FakeMediaGateway implements MediaGateway {
  readonly captures: { format: ImageFormat; options: CaptureOptions }[] = [];
  readonly sessions: { outputPath: string; codec: string; stopped: boolean }[] = [];
  /** Whether a requested downscale "works" (sips available). */
  canDownscale = true;
  readonly media: string[][] = [];

  async captureScreenshot(_udid: string, format: ImageFormat, options: CaptureOptions = {}): Promise<CapturedImage> {
    this.captures.push({ format, options });
    return {
      data: new Uint8Array([1, 2, 3]),
      format,
      savedPath: options.outputPath,
      downscaled: this.canDownscale && options.downscaleBy !== undefined,
    };
  }

  async startRecording(_udid: string, outputPath: string, codec: string): Promise<RecordingSession> {
    const session = { outputPath, codec, stopped: false };
    this.sessions.push(session);
    return {
      outputPath,
      stop: async () => {
        session.stopped = true;
      },
    };
  }

  async addMedia(_udid: string, paths: readonly string[]): Promise<void> {
    this.media.push([...paths]);
  }
}

export class FakeEnvironmentGateway implements EnvironmentGateway {
  readonly calls: string[] = [];
  clipboard = '';
  pushError: Error | undefined;

  async setAppearance(_udid: string, appearance: string): Promise<void> {
    this.calls.push(`appearance ${appearance}`);
  }

  async setLocation(_udid: string, location: { latitude: number; longitude: number }): Promise<void> {
    this.calls.push(`location ${location.latitude},${location.longitude}`);
  }

  async clearLocation(): Promise<void> {
    this.calls.push('clearLocation');
  }

  async overrideStatusBar(_udid: string, overrides: StatusBarOverrides): Promise<void> {
    this.calls.push(`statusBar ${JSON.stringify(overrides)}`);
  }

  async clearStatusBar(): Promise<void> {
    this.calls.push('clearStatusBar');
  }

  async changePermission(_udid: string, change: PermissionChange): Promise<void> {
    this.calls.push(`permission ${change.action} ${change.service} ${change.bundleId ?? '*'}`);
  }

  async setClipboard(_udid: string, text: string): Promise<void> {
    this.clipboard = text;
  }

  async getClipboard(): Promise<string> {
    return this.clipboard;
  }

  async sendPushNotification(_udid: string, bundleId: string): Promise<void> {
    this.calls.push(`push ${bundleId}`);
    if (this.pushError) {
      throw this.pushError;
    }
  }
}

export class FakeLogGateway implements LogGateway {
  queries: LogQuery[] = [];
  lines: string[] = [];

  async readRecent(_udid: string, query: LogQuery): Promise<string[]> {
    this.queries.push(query);
    return this.lines;
  }
}

/** A failure as a command line tool would produce it. */
export function commandFailure(stderr: string): CommandFailedError {
  return new CommandFailedError('tool', 1, stderr);
}
