import type { Appearance, GeoLocation, PermissionChange, StatusBarOverrides } from '../environment.js';

/** Control over the simulated surroundings of a booted device. */
export interface EnvironmentGateway {
  setAppearance(udid: string, appearance: Appearance): Promise<void>;

  setLocation(udid: string, location: GeoLocation): Promise<void>;

  /** Stops simulating a location. */
  clearLocation(udid: string): Promise<void>;

  overrideStatusBar(udid: string, overrides: StatusBarOverrides): Promise<void>;

  /** Removes every status bar override. */
  clearStatusBar(udid: string): Promise<void>;

  changePermission(udid: string, change: PermissionChange): Promise<void>;

  /** Replaces the text on the simulator clipboard. */
  setClipboard(udid: string, text: string): Promise<void>;

  /** Text currently on the simulator clipboard. */
  getClipboard(udid: string): Promise<string>;

  /** Delivers a simulated remote notification with the given APNs payload. */
  sendPushNotification(udid: string, bundleId: string, payload: Record<string, unknown>): Promise<void>;
}
