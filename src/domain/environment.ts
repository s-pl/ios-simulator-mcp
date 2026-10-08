/**
 * Value types describing the simulated environment of a device: appearance,
 * location, status bar and privacy permissions.
 */

export const APPEARANCES = ['light', 'dark'] as const;
export type Appearance = (typeof APPEARANCES)[number];

/** A geographic position in decimal degrees. */
export interface GeoLocation {
  readonly latitude: number;
  readonly longitude: number;
}

export const DATA_NETWORKS = [
  'hide',
  'wifi',
  '3g',
  '4g',
  'lte',
  'lte-a',
  'lte+',
  '5g',
  '5g+',
  '5g-uwb',
  '5g-uc',
] as const;
export type DataNetwork = (typeof DATA_NETWORKS)[number];

export const WIFI_MODES = ['searching', 'failed', 'active'] as const;
export type WifiMode = (typeof WIFI_MODES)[number];

export const CELLULAR_MODES = ['notSupported', 'searching', 'failed', 'active'] as const;
export type CellularMode = (typeof CELLULAR_MODES)[number];

export const BATTERY_STATES = ['charging', 'charged', 'discharging'] as const;
export type BatteryState = (typeof BATTERY_STATES)[number];

/**
 * Status bar values to force. Omitted fields keep whatever the simulator is
 * currently showing.
 */
export interface StatusBarOverrides {
  /** Text shown as the clock, e.g. `9:41`. */
  readonly time?: string;
  readonly dataNetwork?: DataNetwork;
  readonly wifiMode?: WifiMode;
  /** 0–3 */
  readonly wifiBars?: number;
  readonly cellularMode?: CellularMode;
  /** 0–4 */
  readonly cellularBars?: number;
  readonly operatorName?: string;
  readonly batteryState?: BatteryState;
  /** 0–100 */
  readonly batteryLevel?: number;
}

export const PRIVACY_SERVICES = [
  'all',
  'calendar',
  'contacts-limited',
  'contacts',
  'location',
  'location-always',
  'photos-add',
  'photos',
  'media-library',
  'microphone',
  'motion',
  'reminders',
  'siri',
] as const;
export type PrivacyService = (typeof PRIVACY_SERVICES)[number];

export const PERMISSION_ACTIONS = ['grant', 'revoke', 'reset'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** A change to the privacy permissions of a simulator. */
export interface PermissionChange {
  readonly action: PermissionAction;
  readonly service: PrivacyService;
  /** Target app. Required to grant or revoke; optional when resetting. */
  readonly bundleId?: string;
}
