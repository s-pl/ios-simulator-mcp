import type { Point } from '../geometry.js';
import type { HardwareButton, SwipeOptions, UiElement } from '../ui.js';

/**
 * Simulation of user input and inspection of what is on screen.
 * All coordinates are expressed in points.
 */
export interface UiAutomationGateway {
  /** @param durationSeconds Hold time; use it to perform a long press. */
  tap(udid: string, point: Point, durationSeconds?: number): Promise<void>;

  swipe(udid: string, from: Point, to: Point, options?: SwipeOptions): Promise<void>;

  /** Types text into the element that currently has keyboard focus. */
  typeText(udid: string, text: string): Promise<void>;

  pressButton(udid: string, button: HardwareButton): Promise<void>;

  /** Presses a keyboard key identified by its HID usage code (e.g. 40 = Return). */
  pressKey(udid: string, keyCode: number): Promise<void>;

  /** Accessibility elements currently visible on screen. */
  describeScreen(udid: string): Promise<UiElement[]>;

  /** Accessibility element located at a point, if any. */
  describePoint(udid: string, point: Point): Promise<UiElement | undefined>;
}
