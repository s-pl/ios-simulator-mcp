import { ExecutableNotFoundError, UiBackendUnavailableError } from '../../domain/errors.js';
import type { Point } from '../../domain/geometry.js';
import type { UiAutomationGateway } from '../../domain/ports/UiAutomationGateway.js';
import type { HardwareButton, SwipeOptions, UiElement } from '../../domain/ui.js';

/**
 * Uses a preferred {@link UiAutomationGateway} and switches to another one,
 * for good, the first time the preferred one turns out not to be available.
 *
 * Only "this backend cannot be used here" triggers the switch. An ordinary
 * failure of an operation (an element that is not there, a command that
 * fails) is reported as it is: retrying it elsewhere would hide real errors.
 */
export class FallbackUiAutomationGateway implements UiAutomationGateway {
  private usingFallback = false;

  constructor(
    private readonly preferred: UiAutomationGateway,
    private readonly fallback: UiAutomationGateway,
    /** Told why the preferred gateway was abandoned, once. */
    private readonly onFallback: (reason: string) => void = () => undefined,
  ) {}

  tap(udid: string, point: Point, durationSeconds?: number): Promise<void> {
    return this.attempt((gateway) => gateway.tap(udid, point, durationSeconds));
  }

  swipe(udid: string, from: Point, to: Point, options?: SwipeOptions): Promise<void> {
    return this.attempt((gateway) => gateway.swipe(udid, from, to, options));
  }

  typeText(udid: string, text: string): Promise<void> {
    return this.attempt((gateway) => gateway.typeText(udid, text));
  }

  pressButton(udid: string, button: HardwareButton): Promise<void> {
    return this.attempt((gateway) => gateway.pressButton(udid, button));
  }

  pressKey(udid: string, keyCode: number): Promise<void> {
    return this.attempt((gateway) => gateway.pressKey(udid, keyCode));
  }

  describeScreen(udid: string): Promise<UiElement[]> {
    return this.attempt((gateway) => gateway.describeScreen(udid));
  }

  describePoint(udid: string, point: Point): Promise<UiElement | undefined> {
    return this.attempt((gateway) => gateway.describePoint(udid, point));
  }

  private async attempt<T>(operation: (gateway: UiAutomationGateway) => Promise<T>): Promise<T> {
    if (this.usingFallback) {
      return operation(this.fallback);
    }
    try {
      return await operation(this.preferred);
    } catch (error) {
      if (!(error instanceof UiBackendUnavailableError) && !(error instanceof ExecutableNotFoundError)) {
        throw error;
      }
      this.usingFallback = true;
      this.onFallback(error.message);
      return operation(this.fallback);
    }
  }
}
