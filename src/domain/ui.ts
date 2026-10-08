import type { ElementQuery } from './ElementQuery.js';
import type { Point, Rect } from './geometry.js';

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

/** Whether an element carries any text a user or a test could refer to it by. */
export function isLabeled(element: UiElement): boolean {
  return Boolean(element.label || element.value || element.identifier);
}

/**
 * One-line description of an element, ending with the point to tap it at:
 * `Button "Sign in" id=login.submit @(195,725) 350x50`.
 */
export function describeElement(element: UiElement): string {
  const { frame } = element;
  const center = frame.center.rounded();
  return [
    element.type,
    element.label ? JSON.stringify(element.label) : '',
    element.value ? `value=${JSON.stringify(element.value)}` : '',
    element.identifier ? `id=${element.identifier}` : '',
    `@(${center.x},${center.y})`,
    `${Math.round(frame.width)}x${Math.round(frame.height)}`,
    element.enabled ? '' : '[disabled]',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Tuning of a swipe gesture. */
export interface SwipeOptions {
  /** Total duration of the gesture in seconds. */
  readonly durationSeconds?: number;
  /** Distance in points between the intermediate touch events. */
  readonly stepSize?: number;
}

/**
 * A single user interaction. Steps are plain data so they can be queued and
 * executed in sequence without a round trip to the client between them.
 */
export type UiStep =
  | { readonly kind: 'tap'; readonly point: Point; readonly durationSeconds?: number }
  | {
      readonly kind: 'tapElement';
      readonly query: ElementQuery;
      readonly durationSeconds?: number;
      /** How long to wait for the element to appear. */
      readonly timeoutSeconds?: number;
    }
  | { readonly kind: 'swipe'; readonly from: Point; readonly to: Point; readonly options?: SwipeOptions }
  | { readonly kind: 'typeText'; readonly text: string }
  | { readonly kind: 'pressButton'; readonly button: HardwareButton }
  | { readonly kind: 'pressKey'; readonly keyCode: number }
  | { readonly kind: 'wait'; readonly seconds: number }
  | { readonly kind: 'waitForElement'; readonly query: ElementQuery; readonly timeoutSeconds?: number }
  | {
      /** Enters any text, including what the keyboard cannot type, through the clipboard. */
      readonly kind: 'pasteText';
      readonly text: string;
      /** The text field to paste into. */
      readonly query: ElementQuery;
      readonly timeoutSeconds?: number;
    }
  | {
      /** Scrolls until an element is on screen. */
      readonly kind: 'scrollTo';
      readonly query: ElementQuery;
      /** Where the element is expected: further `down` the content (default) or back `up`. */
      readonly direction?: ScrollDirection;
      /** Swipes to attempt before giving up. */
      readonly maxSwipes?: number;
    };

export const SCROLL_DIRECTIONS = ['down', 'up'] as const;
export type ScrollDirection = (typeof SCROLL_DIRECTIONS)[number];

/**
 * Labels of the "Paste" item of the iOS edit menu in the languages a
 * simulator is most often run in, lower-cased.
 */
export const PASTE_MENU_LABELS: readonly string[] = [
  'paste',
  'pegar',
  'coller',
  'einfügen',
  'einsetzen',
  'incolla',
  'colar',
  'plakken',
  'ペースト',
  '粘贴',
  '貼上',
  '붙여넣기',
];
