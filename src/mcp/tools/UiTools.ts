import { z } from 'zod';

import type { UiService } from '../../application/UiService.js';
import { ElementQuery } from '../../domain/ElementQuery.js';
import { Point } from '../../domain/geometry.js';
import { describeElement, HARDWARE_BUTTONS, SCROLL_DIRECTIONS, type UiStep } from '../../domain/ui.js';
import { formatRun, formatScreen } from '../presenters.js';
import { failure, text } from '../responses.js';
import { coordinate, deviceParam } from '../schemas.js';
import { defineTool, Hints, type AnyToolDefinition, type ToolProvider, type ToolResponse } from '../ToolDefinition.js';

const describeAfterParam = z
  .boolean()
  .optional()
  .describe('Also return the elements on screen after the action, saving a ui_describe_screen call.');

/** How a client designates an element without knowing its coordinates. */
const elementShape = {
  label: z
    .string()
    .min(1)
    .optional()
    .describe('Visible text of the element (label or value), case-insensitive. Exact matches win over partial ones.'),
  identifier: z.string().min(1).optional().describe('Exact accessibilityIdentifier of the element.'),
  type: z.string().min(1).optional().describe('Accessibility type to restrict the match to, e.g. "Button".'),
  index: z.number().int().min(0).optional().describe('Which match to use (0 = first) when several elements qualify.'),
};

const durationParam = z.number().positive().max(30).optional();
const timeoutParam = z.number().min(0).max(60).optional();
const maxSwipesParam = z.number().int().min(1).max(50).optional();

/** One entry of the `steps` array of ui_sequence. */
const stepSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('tap'), x: z.number().min(0), y: z.number().min(0), durationSeconds: durationParam }),
  z.object({
    action: z.literal('tap_element'),
    ...elementShape,
    durationSeconds: durationParam,
    timeoutSeconds: timeoutParam,
  }),
  z.object({
    action: z.literal('swipe'),
    fromX: z.number().min(0),
    fromY: z.number().min(0),
    toX: z.number().min(0),
    toY: z.number().min(0),
    durationSeconds: durationParam,
  }),
  z.object({ action: z.literal('type_text'), text: z.string().min(1) }),
  z.object({ action: z.literal('press_button'), button: z.enum(HARDWARE_BUTTONS) }),
  z.object({ action: z.literal('press_key'), keyCode: z.number().int().min(0).max(255) }),
  z.object({ action: z.literal('wait'), seconds: z.number().positive().max(30) }),
  z.object({ action: z.literal('wait_for_element'), ...elementShape, timeoutSeconds: timeoutParam }),
  z.object({ action: z.literal('paste_text'), text: z.string().min(1), ...elementShape, timeoutSeconds: timeoutParam }),
  z.object({
    action: z.literal('scroll_to_element'),
    ...elementShape,
    direction: z.enum(SCROLL_DIRECTIONS).optional(),
    maxSwipes: maxSwipesParam,
  }),
]);

type StepInput = z.infer<typeof stepSchema>;

/** Translates the wire format of a step into the domain model. */
function toStep(input: StepInput): UiStep {
  switch (input.action) {
    case 'tap':
      return { kind: 'tap', point: new Point(input.x, input.y), durationSeconds: input.durationSeconds };
    case 'tap_element':
      return {
        kind: 'tapElement',
        query: new ElementQuery(input),
        durationSeconds: input.durationSeconds,
        timeoutSeconds: input.timeoutSeconds,
      };
    case 'swipe':
      return {
        kind: 'swipe',
        from: new Point(input.fromX, input.fromY),
        to: new Point(input.toX, input.toY),
        options: { durationSeconds: input.durationSeconds },
      };
    case 'type_text':
      return { kind: 'typeText', text: input.text };
    case 'press_button':
      return { kind: 'pressButton', button: input.button };
    case 'press_key':
      return { kind: 'pressKey', keyCode: input.keyCode };
    case 'wait':
      return { kind: 'wait', seconds: input.seconds };
    case 'wait_for_element':
      return { kind: 'waitForElement', query: new ElementQuery(input), timeoutSeconds: input.timeoutSeconds };
    case 'paste_text':
      return {
        kind: 'pasteText',
        text: input.text,
        query: new ElementQuery(input),
        timeoutSeconds: input.timeoutSeconds,
      };
    case 'scroll_to_element':
      return {
        kind: 'scrollTo',
        query: new ElementQuery(input),
        direction: input.direction,
        maxSwipes: input.maxSwipes,
      };
  }
}

/**
 * Tools to interact with whatever is on screen: touches, text input, hardware
 * buttons and accessibility inspection. They require idb on the Mac.
 *
 * Several of them exist to cut round trips: an element can be tapped by its
 * text, any action can return the resulting screen, and a whole flow can be
 * sent as one sequence.
 */
export class UiTools implements ToolProvider {
  constructor(private readonly ui: UiService) {}

  tools(): AnyToolDefinition[] {
    return [
      defineTool({
        name: 'ui_describe_screen',
        title: 'Describe screen',
        description:
          'Lists the accessibility elements on screen, one per line: type, label, value, identifier, ' +
          'the point to tap it at and its size, all in points. Prefer it over a screenshot: it is ' +
          'faster, cheaper and gives exact coordinates. Requires idb.',
        inputSchema: {
          containing: z
            .string()
            .optional()
            .describe('Only elements whose label, value or identifier contains this text (case-insensitive).'),
          includeUnlabeled: z
            .boolean()
            .optional()
            .describe('Include elements with no label, value or identifier (default: false).'),
          device: deviceParam,
        },
        annotations: Hints.readOnly,
        execute: async ({ containing, includeUnlabeled, device }) => {
          const { device: target, value } = await this.ui.describeScreen(
            { containing, meaningfulOnly: !includeUnlabeled },
            device,
          );
          return text(formatScreen(target, value));
        },
      }),

      defineTool({
        name: 'ui_describe_point',
        title: 'Describe element at point',
        description: 'Returns the accessibility element located at a screen coordinate. Requires idb.',
        inputSchema: {
          x: coordinate('Horizontal position'),
          y: coordinate('Vertical position'),
          device: deviceParam,
        },
        annotations: Hints.readOnly,
        execute: async ({ x, y, device }) => {
          const { value } = await this.ui.describePoint(new Point(x, y), device);
          return text(value ? describeElement(value) : `No accessibility element at (${x}, ${y}).`);
        },
      }),

      defineTool({
        name: 'ui_tap_element',
        title: 'Tap element',
        description:
          'Finds an element by its visible text, identifier or type and taps it, in a single call. ' +
          'This is the fastest way to press a button or focus a field: no coordinates needed. ' +
          'Waits briefly for the element to appear, so it can follow a screen transition. Requires idb.',
        inputSchema: {
          ...elementShape,
          durationSeconds: durationParam.describe('How long to hold the touch, for a long press.'),
          timeoutSeconds: timeoutParam.describe('How long to wait for the element to appear (default: 3).'),
          describeAfter: describeAfterParam,
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: ({ durationSeconds, timeoutSeconds, describeAfter, device, ...criteria }) =>
          this.perform(
            { kind: 'tapElement', query: new ElementQuery(criteria), durationSeconds, timeoutSeconds },
            describeAfter,
            device,
          ),
      }),

      defineTool({
        name: 'ui_wait_for_element',
        title: 'Wait for element',
        description:
          'Waits until an element is on screen, e.g. after launching an app or submitting a form, ' +
          'and returns it. Use it instead of polling with ui_describe_screen. Requires idb.',
        inputSchema: {
          ...elementShape,
          timeoutSeconds: timeoutParam.describe('How long to wait (default: 10).'),
          describeAfter: describeAfterParam,
          device: deviceParam,
        },
        annotations: Hints.readOnly,
        execute: ({ timeoutSeconds, describeAfter, device, ...criteria }) =>
          this.perform(
            { kind: 'waitForElement', query: new ElementQuery(criteria), timeoutSeconds },
            describeAfter,
            device,
          ),
      }),

      defineTool({
        name: 'ui_paste_text',
        title: 'Paste text into a field',
        description:
          'Enters any text into a text field through the clipboard: accents, \u00f1, emoji and non-Latin ' +
          'scripts included. Use it whenever ui_type_text cannot type the text. It copies the text, ' +
          'long-presses the field and taps "Paste" in the menu that appears, all in one call. The text ' +
          'is inserted at the cursor; it does not replace what the field already contains. Requires idb.',
        inputSchema: {
          text: z.string().min(1).describe('Text to enter. Any Unicode text is accepted.'),
          ...elementShape,
          timeoutSeconds: timeoutParam.describe('How long to wait for the field to appear (default: 3).'),
          describeAfter: describeAfterParam,
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: ({ text: input, timeoutSeconds, describeAfter, device, ...criteria }) =>
          this.perform(
            { kind: 'pasteText', text: input, query: new ElementQuery(criteria), timeoutSeconds },
            describeAfter,
            device,
          ),
      }),

      defineTool({
        name: 'ui_scroll_to_element',
        title: 'Scroll to element',
        description:
          'Scrolls the screen until an element is visible and returns it, in one call. Use it for ' +
          'items further down a list instead of repeating ui_swipe and ui_describe_screen. Stops when ' +
          'the element appears, when the end of the content is reached or after maxSwipes. Requires idb.',
        inputSchema: {
          ...elementShape,
          direction: z
            .enum(SCROLL_DIRECTIONS)
            .optional()
            .describe('"down" (default) looks further down the content; "up" goes back towards the top.'),
          maxSwipes: maxSwipesParam.describe('Swipes to attempt before giving up (default: 10).'),
          describeAfter: describeAfterParam,
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: ({ direction, maxSwipes, describeAfter, device, ...criteria }) =>
          this.perform(
            { kind: 'scrollTo', query: new ElementQuery(criteria), direction, maxSwipes },
            describeAfter,
            device,
          ),
      }),

      defineTool({
        name: 'ui_tap',
        title: 'Tap',
        description:
          'Taps a screen coordinate in points. Prefer ui_tap_element when the target has a label or ' +
          'identifier. Coordinates come from ui_describe_screen or from a screenshot taken at the ' +
          'default "points" resolution. Set a duration to long-press. Requires idb.',
        inputSchema: {
          x: coordinate('Horizontal position'),
          y: coordinate('Vertical position'),
          durationSeconds: durationParam.describe('How long to hold the touch, for a long press.'),
          describeAfter: describeAfterParam,
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: ({ x, y, durationSeconds, describeAfter, device }) =>
          this.perform({ kind: 'tap', point: new Point(x, y), durationSeconds }, describeAfter, device),
      }),

      defineTool({
        name: 'ui_swipe',
        title: 'Swipe',
        description:
          'Drags a finger between two coordinates in points. To scroll content down, swipe from a ' +
          'lower point to a higher one (larger y to smaller y). Limitation: swipes that start at a ' +
          'screen edge do not trigger system gestures such as Notification Center, Control Center ' +
          'or the app switcher. Requires idb.',
        inputSchema: {
          fromX: coordinate('Starting horizontal position'),
          fromY: coordinate('Starting vertical position'),
          toX: coordinate('Ending horizontal position'),
          toY: coordinate('Ending vertical position'),
          durationSeconds: durationParam.describe('Duration of the gesture.'),
          stepSize: z.number().positive().optional().describe('Distance in points between intermediate touch events.'),
          describeAfter: describeAfterParam,
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: ({ fromX, fromY, toX, toY, durationSeconds, stepSize, describeAfter, device }) =>
          this.perform(
            {
              kind: 'swipe',
              from: new Point(fromX, fromY),
              to: new Point(toX, toY),
              options: { durationSeconds, stepSize },
            },
            describeAfter,
            device,
          ),
      }),

      defineTool({
        name: 'ui_type_text',
        title: 'Type text',
        description:
          'Types text into the focused field, as if using the keyboard; line breaks press Return. ' +
          'Tap a text field first to give it focus. Limitation: only unaccented Latin letters, digits ' +
          'and common punctuation can be typed. For accents, ñ, emoji or any other script, use ' +
          'ui_paste_text instead. Requires idb.',
        inputSchema: {
          text: z.string().min(1).describe('Text to type (printable ASCII, line breaks and tabs).'),
          describeAfter: describeAfterParam,
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: ({ text: input, describeAfter, device }) =>
          this.perform({ kind: 'typeText', text: input }, describeAfter, device),
      }),

      defineTool({
        name: 'ui_press_button',
        title: 'Press hardware button',
        description: 'Presses a hardware button, e.g. HOME to return to the home screen. Requires idb.',
        inputSchema: {
          button: z.enum(HARDWARE_BUTTONS).describe('Button to press.'),
          describeAfter: describeAfterParam,
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: ({ button, describeAfter, device }) =>
          this.perform({ kind: 'pressButton', button }, describeAfter, device),
      }),

      defineTool({
        name: 'ui_press_key',
        title: 'Press keyboard key',
        description:
          'Presses a keyboard key by its USB HID usage code. ' +
          'Common codes: 40 Return, 41 Escape, 42 Backspace, 43 Tab, 44 Space, ' +
          '79 Right, 80 Left, 81 Down, 82 Up. Requires idb.',
        inputSchema: {
          keyCode: z.number().int().min(0).max(255).describe('USB HID keyboard usage code.'),
          describeAfter: describeAfterParam,
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: ({ keyCode, describeAfter, device }) =>
          this.perform({ kind: 'pressKey', keyCode }, describeAfter, device),
      }),

      defineTool({
        name: 'ui_sequence',
        title: 'Run a sequence of UI steps',
        description:
          'Runs several UI steps in one call, which is much faster than one call per step. Use it for ' +
          'any flow you can plan ahead, such as filling a form. Stops at the first failing step and ' +
          'reports which steps completed, the error and the current screen. Requires idb.\n' +
          'Each step is an object with an "action":\n' +
          '- tap: x, y, durationSeconds?\n' +
          '- tap_element: label?, identifier?, type?, index?, durationSeconds?, timeoutSeconds?\n' +
          '- type_text: text\n' +
          '- swipe: fromX, fromY, toX, toY, durationSeconds?\n' +
          '- press_button: button (HOME, LOCK, SIDE_BUTTON, SIRI, APPLE_PAY)\n' +
          '- press_key: keyCode\n' +
          '- wait: seconds\n' +
          '- wait_for_element: label?, identifier?, type?, index?, timeoutSeconds?\n' +
          '- paste_text: text, label?, identifier?, type?, index?, timeoutSeconds?\n' +
          '- scroll_to_element: label?, identifier?, type?, index?, direction?, maxSwipes?\n' +
          'Example: [{"action":"tap_element","label":"Email"},{"action":"type_text","text":"a@b.co"},' +
          '{"action":"tap_element","label":"Sign in"},{"action":"wait_for_element","label":"Welcome"}]',
        inputSchema: {
          steps: z.array(stepSchema).min(1).max(50).describe('Steps to run, in order.'),
          describeAfter: describeAfterParam,
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ steps, describeAfter, device }) => {
          const { device: target, value } = await this.ui.run(steps.map(toStep), { describeAfter }, device);
          const report = formatRun(target, value, steps.length);
          return value.failure ? failure(report) : text(report);
        },
      }),
    ];
  }

  /** Runs one step and reports it, optionally followed by the resulting screen. */
  private async perform(
    step: UiStep,
    describeAfter: boolean | undefined,
    device: string | undefined,
  ): Promise<ToolResponse> {
    const { device: target, value } = await this.ui.perform(step, { describeAfter }, device);
    return text(formatRun(target, value, 1));
  }
}
