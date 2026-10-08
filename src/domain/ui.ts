import type { Rect } from './geometry.js';

export const HARDWARE_BUTTONS = ['HOME', 'LOCK', 'SIDE_BUTTON', 'SIRI', 'APPLE_PAY'] as const;
export type HardwareButton = (typeof HARDWARE_BUTTONS)[number];

/** A node of the accessibility tree shown on screen. */
export interface UiElement {
  /** Accessibility type, e.g. `Button`, `StaticText`, `TextField`. */
  readonly type: string;
  /** Accessibility label: the text a user would identify the element by. */
  readonly label: string | undefined;
  /** Current value, e.g. the text inside a field or the state of a switch. */
  readonly value: string | undefined;
  /** Developer-assigned `accessibilityIdentifier`. */
  readonly identifier: string | undefined;
  readonly enabled: boolean;
  /** Position and size in points. */
  readonly frame: Rect;
}

/** Tuning of a swipe gesture. */
export interface SwipeOptions {
  /** Total duration of the gesture in seconds. */
  readonly durationSeconds?: number;
  /** Distance in points between the intermediate touch events. */
  readonly stepSize?: number;
}
