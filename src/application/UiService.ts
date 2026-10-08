import type { ElementQuery } from '../domain/ElementQuery.js';
import {
  CommandFailedError,
  ElementNotFoundError,
  PasteUnavailableError,
  UnsupportedTextError,
} from '../domain/errors.js';
import { Point, type Rect } from '../domain/geometry.js';
import type { EnvironmentGateway } from '../domain/ports/EnvironmentGateway.js';
import type { UiAutomationGateway } from '../domain/ports/UiAutomationGateway.js';
import {
  describeElement,
  isLabeled,
  PASTE_MENU_LABELS,
  type ScrollDirection,
  type UiElement,
  type UiStep,
} from '../domain/ui.js';
import { SystemClock, type Clock } from './Clock.js';
import type { DeviceResolver } from './DeviceResolver.js';
import type { OnDevice } from './OnDevice.js';

/** Criteria to narrow down the accessibility elements of a screen. */
export interface UiElementFilter {
  /** Drop elements without label, value or identifier (pure layout containers). */
  readonly meaningfulOnly?: boolean;
  /** Keep elements whose label, value or identifier contains this text (case-insensitive). */
  readonly containing?: string;
}

export interface RunOptions {
  /** Read the screen once the steps have run, saving the client a second call. */
  readonly describeAfter?: boolean;
}

/** What a step did. */
export interface StepOutcome {
  readonly step: UiStep;
  /** The element the step located, for steps that target one. */
  readonly element?: UiElement;
}

/** Result of running a list of steps. */
export interface UiRun {
  /** Outcomes of the steps that completed, in order. */
  readonly outcomes: readonly StepOutcome[];
  /** The step that stopped the run, if any. Later steps were not attempted. */
  readonly failure?: { readonly index: number; readonly error: unknown };
  /** Labeled elements on screen afterwards: on request, and always after a failure. */
  readonly screen?: readonly UiElement[];
}

/** Time for animations to finish before the resulting screen is read. */
const SETTLE_MS = 600;
/** Pause between two looks at the screen while waiting for an element. */
const POLL_INTERVAL_MS = 400;
/** Default patience of a tap on an element: enough for a screen transition. */
const DEFAULT_TAP_TIMEOUT_SECONDS = 3;
const DEFAULT_WAIT_TIMEOUT_SECONDS = 10;
/**
 * How long a plain read of the screen keeps retrying. The accessibility tree is briefly
 * unavailable while an app launches or a screen transition is in flight.
 */
const READ_PATIENCE_MS = 3000;
/** How many elements an "element not found" error lists to help the client recover. */
const MAX_LISTED_ELEMENTS = 40;

/** How long a text field is held for its edit menu to appear. */
const LONG_PRESS_SECONDS = 1;
/** How long the edit menu is given to show up after a long press. */
const PASTE_MENU_TIMEOUT_MS = 2400;
const DEFAULT_MAX_SWIPES = 10;
/** Share of the screen height a scrolling swipe travels, centred vertically. */
const SCROLL_TRAVEL = 0.4;
const SCROLL_SWIPE_SECONDS = 0.3;

const KEY_RETURN = 40;
const KEY_TAB = 43;
/** Characters the simulated hardware keyboard can produce. */
const TYPEABLE = /^[\x20-\x7E]$/;

/**
 * Use cases to drive the user interface of a booted simulator.
 *
 * Every interaction is a {@link UiStep}. Steps run through a single path,
 * {@link run}, whether a client sends one or a whole sequence: the device is
 * resolved once, steps execute back to back, and the resulting screen can be
 * returned in the same response. This is what keeps the number of round trips
 * between the model and the simulator low.
 */
export class UiService {
  constructor(
    private readonly ui: UiAutomationGateway,
    /** Used to enter text the simulated keyboard cannot type. */
    private readonly clipboard: Pick<EnvironmentGateway, 'setClipboard'>,
    private readonly resolver: DeviceResolver,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  /**
   * Runs steps in order and stops at the first one that fails. A failure is
   * reported in the result, not thrown, so the caller still learns which
   * steps completed and what the screen looks like.
   */
  async run(steps: readonly UiStep[], options: RunOptions = {}, reference?: string): Promise<OnDevice<UiRun>> {
    const device = await this.resolver.resolveBooted(reference);
    const outcomes: StepOutcome[] = [];

    for (const [index, step] of steps.entries()) {
      try {
        outcomes.push(await this.execute(device.udid, step));
      } catch (error) {
        // Best effort and a single look: the screen helps the client recover, but must
        // neither mask the failure nor delay reporting it.
        const screen = await this.ui
          .describeScreen(device.udid)
          .then((elements) => elements.filter(isLabeled))
          .catch(() => undefined);
        return { device, value: { outcomes, failure: { index, error }, screen } };
      }
    }

    if (!options.describeAfter) {
      return { device, value: { outcomes } };
    }
    await this.clock.sleep(SETTLE_MS);
    return { device, value: { outcomes, screen: await this.labeledElements(device.udid) } };
  }

  /**
   * Runs a single step and throws if it fails. Unlike {@link run}, nothing
   * else is read from the device on failure: the error is all the caller gets.
   */
  async perform(step: UiStep, options: RunOptions = {}, reference?: string): Promise<OnDevice<UiRun>> {
    const device = await this.resolver.resolveBooted(reference);
    const outcomes = [await this.execute(device.udid, step)];
    if (!options.describeAfter) {
      return { device, value: { outcomes } };
    }
    await this.clock.sleep(SETTLE_MS);
    return { device, value: { outcomes, screen: await this.labeledElements(device.udid) } };
  }

  async describeScreen(filter: UiElementFilter = {}, reference?: string): Promise<OnDevice<UiElement[]>> {
    const device = await this.resolver.resolveBooted(reference);
    const elements = await this.readScreen(device.udid);
    const needle = filter.containing?.trim().toLowerCase();
    const value = elements
      .filter((element) => !filter.meaningfulOnly || isLabeled(element))
      .filter(
        (element) =>
          !needle ||
          [element.label, element.value, element.identifier].some((text) => text?.toLowerCase().includes(needle)),
      );
    return { device, value };
  }

  async describePoint(point: Point, reference?: string): Promise<OnDevice<UiElement | undefined>> {
    const device = await this.resolver.resolveBooted(reference);
    const value = await this.ui.describePoint(device.udid, point.rounded());
    return { device, value };
  }

  private async execute(udid: string, step: UiStep): Promise<StepOutcome> {
    switch (step.kind) {
      case 'tap':
        await this.ui.tap(udid, step.point.rounded(), step.durationSeconds);
        return { step };
      case 'tapElement': {
        const element = await this.waitFor(udid, step.query, step.timeoutSeconds ?? DEFAULT_TAP_TIMEOUT_SECONDS);
        await this.ui.tap(udid, element.frame.center.rounded(), step.durationSeconds);
        return { step, element };
      }
      case 'swipe':
        await this.ui.swipe(udid, step.from.rounded(), step.to.rounded(), step.options);
        return { step };
      case 'typeText':
        await this.typeText(udid, step.text);
        return { step };
      case 'pressButton':
        await this.ui.pressButton(udid, step.button);
        return { step };
      case 'pressKey':
        await this.ui.pressKey(udid, step.keyCode);
        return { step };
      case 'wait':
        await this.clock.sleep(step.seconds * 1000);
        return { step };
      case 'waitForElement': {
        const element = await this.waitFor(udid, step.query, step.timeoutSeconds ?? DEFAULT_WAIT_TIMEOUT_SECONDS);
        return { step, element };
      }
      case 'pasteText': {
        const element = await this.pasteText(
          udid,
          step.text,
          step.query,
          step.timeoutSeconds ?? DEFAULT_TAP_TIMEOUT_SECONDS,
        );
        return { step, element };
      }
      case 'scrollTo': {
        const element = await this.scrollTo(
          udid,
          step.query,
          step.direction ?? 'down',
          step.maxSwipes ?? DEFAULT_MAX_SWIPES,
        );
        return { step, element };
      }
    }
  }

  /**
   * Enters text into a field through the clipboard, the way a user would:
   * copy, long-press the field, choose "Paste". Unlike typing, this works for
   * any text: accents, emoji, any script.
   *
   * A field that does not have focus yet may ignore the first long press, so
   * the field is tapped and pressed again once before giving up.
   * @throws PasteUnavailableError when no "Paste" option appears.
   */
  private async pasteText(udid: string, text: string, query: ElementQuery, timeoutSeconds: number): Promise<UiElement> {
    await this.clipboard.setClipboard(udid, text);
    const field = await this.waitFor(udid, query, timeoutSeconds);
    const target = field.frame.center.rounded();

    await this.ui.tap(udid, target, LONG_PRESS_SECONDS);
    let paste = await this.findPasteItem(udid);
    if (!paste) {
      await this.ui.tap(udid, target);
      await this.clock.sleep(SETTLE_MS);
      await this.ui.tap(udid, target, LONG_PRESS_SECONDS);
      paste = await this.findPasteItem(udid);
    }
    if (!paste) {
      const visible = (await this.labeledElements(udid).catch(() => []))
        .slice(0, MAX_LISTED_ELEMENTS)
        .map(describeElement);
      throw new PasteUnavailableError(query.describe(), visible);
    }
    await this.ui.tap(udid, paste.frame.center.rounded());
    return field;
  }

  /** Waits briefly for the "Paste" item of the edit menu, in any supported language. */
  private async findPasteItem(udid: string): Promise<UiElement | undefined> {
    const deadline = this.clock.now() + PASTE_MENU_TIMEOUT_MS;
    for (;;) {
      const elements = await this.tryReadScreen(udid);
      const item =
        elements instanceof Error
          ? undefined
          : elements.find((element) => PASTE_MENU_LABELS.includes(element.label?.trim().toLowerCase() ?? ''));
      if (item || this.clock.now() >= deadline) {
        return item;
      }
      await this.clock.sleep(POLL_INTERVAL_MS);
    }
  }

  /**
   * Swipes the content until the element is within the screen. Stops early
   * when a swipe changes nothing, which means the end of the content was reached.
   * @throws ElementNotFoundError when the element does not come into view.
   */
  private async scrollTo(
    udid: string,
    query: ElementQuery,
    direction: ScrollDirection,
    maxSwipes: number,
  ): Promise<UiElement> {
    let elements = await this.readScreen(udid);
    for (let swipes = 0; ; swipes += 1) {
      const screen = screenBounds(elements);
      const element = query.select(elements);
      if (element && (!screen || screen.contains(element.frame.center))) {
        return element;
      }
      if (!screen || swipes >= maxSwipes) {
        break;
      }

      const x = screen.x + screen.width / 2;
      const middle = screen.y + screen.height / 2;
      const half = (screen.height * SCROLL_TRAVEL) / 2;
      // Content further down is revealed by dragging the finger up, and vice versa.
      const [fromY, toY] = direction === 'down' ? [middle + half, middle - half] : [middle - half, middle + half];
      await this.ui.swipe(udid, new Point(x, fromY).rounded(), new Point(x, toY).rounded(), {
        durationSeconds: SCROLL_SWIPE_SECONDS,
      });
      await this.clock.sleep(SETTLE_MS);

      const after = await this.readScreen(udid);
      const reachedTheEnd = sameScreen(elements, after);
      elements = after;
      if (reachedTheEnd && !query.select(after)) {
        break;
      }
    }
    const visible = elements.filter(isLabeled).slice(0, MAX_LISTED_ELEMENTS).map(describeElement);
    throw new ElementNotFoundError(query.describe(), visible);
  }

  /**
   * Types text through the simulated keyboard. Line breaks and tabs are sent
   * as key presses. The text is validated up front so nothing is typed when
   * part of it cannot be.
   * @throws UnsupportedTextError for characters outside the keyboard's reach (accents, ñ, emoji…).
   */
  private async typeText(udid: string, text: string): Promise<void> {
    const normalised = text.replaceAll('\r\n', '\n');
    const unsupported = [...new Set(normalised)].filter(
      (character) => character !== '\n' && character !== '\t' && !TYPEABLE.test(character),
    );
    if (unsupported.length > 0) {
      throw new UnsupportedTextError(unsupported);
    }

    for (const chunk of normalised.split(/(\n|\t)/)) {
      if (chunk === '\n') {
        await this.ui.pressKey(udid, KEY_RETURN);
      } else if (chunk === '\t') {
        await this.ui.pressKey(udid, KEY_TAB);
      } else if (chunk.length > 0) {
        await this.ui.typeText(udid, chunk);
      }
    }
  }

  /**
   * Looks for an element, polling the screen until it shows up or the
   * timeout elapses. An ambiguous query fails immediately: waiting would not
   * make it less ambiguous.
   */
  private async waitFor(udid: string, query: ElementQuery, timeoutSeconds: number): Promise<UiElement> {
    const deadline = this.clock.now() + timeoutSeconds * 1000;
    for (;;) {
      const elements = await this.tryReadScreen(udid);
      const element = elements instanceof Error ? undefined : query.select(elements);
      if (element) {
        return element;
      }
      if (this.clock.now() >= deadline) {
        if (elements instanceof Error) {
          throw elements;
        }
        const visible = elements.filter(isLabeled).slice(0, MAX_LISTED_ELEMENTS).map(describeElement);
        throw new ElementNotFoundError(query.describe(), visible);
      }
      await this.clock.sleep(POLL_INTERVAL_MS);
    }
  }

  /**
   * Reads the screen, retrying for a short while when the read itself fails.
   * @throws the last failure once the patience runs out.
   */
  private async readScreen(udid: string): Promise<UiElement[]> {
    const deadline = this.clock.now() + READ_PATIENCE_MS;
    for (;;) {
      const elements = await this.tryReadScreen(udid);
      if (!(elements instanceof Error)) {
        return elements;
      }
      if (this.clock.now() >= deadline) {
        throw elements;
      }
      await this.clock.sleep(POLL_INTERVAL_MS);
    }
  }

  /**
   * Reads the screen once. A failing command is returned, not thrown, so
   * callers that poll can treat "could not look" like "not there yet".
   */
  private async tryReadScreen(udid: string): Promise<UiElement[] | CommandFailedError> {
    try {
      return await this.ui.describeScreen(udid);
    } catch (error) {
      if (error instanceof CommandFailedError) {
        return error;
      }
      throw error;
    }
  }

  private async labeledElements(udid: string): Promise<UiElement[]> {
    return (await this.readScreen(udid)).filter(isLabeled);
  }
}

/** The area of the screen: the frame of the largest element, which is the application itself. */
function screenBounds(elements: readonly UiElement[]): Rect | undefined {
  const frames = elements.map((element) => element.frame).filter((frame) => frame.area > 0);
  return frames.reduce<Rect | undefined>(
    (largest, frame) => (!largest || frame.area > largest.area ? frame : largest),
    undefined,
  );
}

/** Whether two reads of the screen show the same elements in the same places. */
function sameScreen(before: readonly UiElement[], after: readonly UiElement[]): boolean {
  return before.map(describeElement).join('\n') === after.map(describeElement).join('\n');
}
