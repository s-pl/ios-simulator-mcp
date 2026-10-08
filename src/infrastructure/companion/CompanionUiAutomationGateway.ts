import { UnexpectedOutputError, UnsupportedTextError } from '../../domain/errors.js';
import type { Point } from '../../domain/geometry.js';
import type { UiAutomationGateway } from '../../domain/ports/UiAutomationGateway.js';
import type { HardwareButton, SwipeOptions, UiElement } from '../../domain/ui.js';
import { toUiElement } from '../idb/IdbUiAutomationGateway.js';
import type { CompanionPool } from './CompanionPool.js';
import { KEY_LEFT_SHIFT, keyStrokeFor } from './keyboard.js';
import { accessibilityInfoRequest, delay, pressDown, pressUp, swipe, type PressTarget } from './messages.js';

/** Defaults the idb command line applies to a swipe. */
const DEFAULT_SWIPE_STEP = 10;
const DEFAULT_SWIPE_SECONDS = 0.5;

/**
 * {@link UiAutomationGateway} that talks to `idb_companion` directly over a
 * connection kept open between calls.
 *
 * It does the same things as the gateway built on the idb command line, and
 * the companion answers with the same data, but without starting a Python
 * process for every interaction. It only needs `idb_companion` (installed
 * with Homebrew), not the `idb` Python client.
 */
export class CompanionUiAutomationGateway implements UiAutomationGateway {
  constructor(private readonly companions: CompanionPool) {}

  async tap(udid: string, point: Point, durationSeconds?: number): Promise<void> {
    const target = { touch: point };
    await this.play(udid, [pressDown(target), ...(durationSeconds ? [delay(durationSeconds)] : []), pressUp(target)]);
  }

  async swipe(udid: string, from: Point, to: Point, options: SwipeOptions = {}): Promise<void> {
    await this.play(udid, [
      swipe(from, to, options.stepSize ?? DEFAULT_SWIPE_STEP, options.durationSeconds ?? DEFAULT_SWIPE_SECONDS),
    ]);
  }

  async typeText(udid: string, text: string): Promise<void> {
    const characters = [...text];
    const untypeable = characters.filter((character) => !keyStrokeFor(character));
    if (untypeable.length > 0) {
      throw new UnsupportedTextError([...new Set(untypeable)]);
    }

    const shift = { keyCode: KEY_LEFT_SHIFT };
    const events = characters.flatMap((character) => {
      const stroke = keyStrokeFor(character);
      if (!stroke) {
        return [];
      }
      const key = { keyCode: stroke.keyCode };
      return stroke.shift
        ? [pressDown(shift), pressDown(key), pressUp(key), pressUp(shift)]
        : [pressDown(key), pressUp(key)];
    });
    await this.play(udid, events);
  }

  async pressButton(udid: string, button: HardwareButton): Promise<void> {
    await this.press(udid, { button });
  }

  async pressKey(udid: string, keyCode: number): Promise<void> {
    await this.press(udid, { keyCode });
  }

  async describeScreen(udid: string): Promise<UiElement[]> {
    const connection = await this.companions.connectionFor(udid);
    const parsed = parseJson(await connection.accessibilityInfo(accessibilityInfoRequest()));
    if (!Array.isArray(parsed)) {
      throw new UnexpectedOutputError('idb_companion accessibility_info', 'expected a JSON array of elements');
    }
    return parsed.map(toUiElement);
  }

  async describePoint(udid: string, point: Point): Promise<UiElement | undefined> {
    const connection = await this.companions.connectionFor(udid);
    const json = await connection.accessibilityInfo(accessibilityInfoRequest(point));
    if (!json.trim()) {
      return undefined;
    }
    const parsed = parseJson(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? toUiElement(parsed) : undefined;
  }

  private async press(udid: string, target: PressTarget): Promise<void> {
    await this.play(udid, [pressDown(target), pressUp(target)]);
  }

  private async play(udid: string, events: readonly Uint8Array[]): Promise<void> {
    const connection = await this.companions.connectionFor(udid);
    await connection.sendHidEvents(events);
  }
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new UnexpectedOutputError('idb_companion accessibility_info', 'the answer is not valid JSON', {
      cause: error,
    });
  }
}
