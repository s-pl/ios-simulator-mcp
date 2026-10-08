import { z } from 'zod';

import type { UiService } from '../../application/UiService.js';
import { Point } from '../../domain/geometry.js';
import { HARDWARE_BUTTONS, type UiElement } from '../../domain/ui.js';
import { json, text } from '../responses.js';
import { coordinate, deviceParam } from '../schemas.js';
import { defineTool, Hints, type AnyToolDefinition, type ToolProvider } from '../ToolDefinition.js';

/**
 * Tools to interact with whatever is on screen: touches, text input, hardware
 * buttons and accessibility inspection. They require idb on the Mac.
 */
export class UiTools implements ToolProvider {
  constructor(private readonly ui: UiService) {}

  tools(): AnyToolDefinition[] {
    return [
      defineTool({
        name: 'ui_describe_screen',
        title: 'Describe screen',
        description:
          'Returns the accessibility elements currently on screen (type, label, value, identifier, ' +
          'frame and tap point, all in points). Prefer this over a screenshot to locate elements to tap. ' +
          'Requires idb.',
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
          return json({ device: target.label, elements: value.map(presentElement) });
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
          return value ? json(presentElement(value)) : text(`No accessibility element at (${x}, ${y}).`);
        },
      }),

      defineTool({
        name: 'ui_tap',
        title: 'Tap',
        description:
          'Taps a screen coordinate given in points (not screenshot pixels). ' +
          'Get coordinates from the "tapPoint" of ui_describe_screen. ' +
          'Set a duration to long-press. Requires idb.',
        inputSchema: {
          x: coordinate('Horizontal position'),
          y: coordinate('Vertical position'),
          durationSeconds: z
            .number()
            .positive()
            .max(30)
            .optional()
            .describe('How long to hold the touch, for a long press.'),
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ x, y, durationSeconds, device }) => {
          const target = await this.ui.tap(new Point(x, y), durationSeconds, device);
          return text(`Tapped (${x}, ${y}) on ${target.label}.`);
        },
      }),

      defineTool({
        name: 'ui_swipe',
        title: 'Swipe',
        description:
          'Drags a finger between two coordinates in points. To scroll content down, swipe from a ' +
          'lower point to a higher one (larger y to smaller y). Requires idb.',
        inputSchema: {
          fromX: coordinate('Starting horizontal position'),
          fromY: coordinate('Starting vertical position'),
          toX: coordinate('Ending horizontal position'),
          toY: coordinate('Ending vertical position'),
          durationSeconds: z.number().positive().max(30).optional().describe('Duration of the gesture.'),
          stepSize: z
            .number()
            .positive()
            .optional()
            .describe('Distance in points between intermediate touch events.'),
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ fromX, fromY, toX, toY, durationSeconds, stepSize, device }) => {
          const target = await this.ui.swipe(
            new Point(fromX, fromY),
            new Point(toX, toY),
            { durationSeconds, stepSize },
            device,
          );
          return text(`Swiped from (${fromX}, ${fromY}) to (${toX}, ${toY}) on ${target.label}.`);
        },
      }),

      defineTool({
        name: 'ui_type_text',
        title: 'Type text',
        description:
          'Types text into the focused field, as if using the keyboard. ' +
          'Tap a text field first to give it focus. Requires idb.',
        inputSchema: {
          text: z.string().min(1).describe('Text to type.'),
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ text: input, device }) => {
          const target = await this.ui.typeText(input, device);
          return text(`Typed ${input.length} character(s) on ${target.label}.`);
        },
      }),

      defineTool({
        name: 'ui_press_button',
        title: 'Press hardware button',
        description: 'Presses a hardware button, e.g. HOME to return to the home screen. Requires idb.',
        inputSchema: {
          button: z.enum(HARDWARE_BUTTONS).describe('Button to press.'),
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ button, device }) => {
          const target = await this.ui.pressButton(button, device);
          return text(`Pressed ${button} on ${target.label}.`);
        },
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
          device: deviceParam,
        },
        annotations: Hints.mutating,
        execute: async ({ keyCode, device }) => {
          const target = await this.ui.pressKey(keyCode, device);
          return text(`Pressed key ${keyCode} on ${target.label}.`);
        },
      }),
    ];
  }
}

/** Compact view of an element, with the point to tap already computed. */
function presentElement(element: UiElement): Record<string, unknown> {
  const { frame } = element;
  const tapPoint = frame.center.rounded();
  return {
    type: element.type,
    ...(element.label && { label: element.label }),
    ...(element.value && { value: element.value }),
    ...(element.identifier && { identifier: element.identifier }),
    ...(!element.enabled && { enabled: false }),
    frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    tapPoint: { x: tapPoint.x, y: tapPoint.y },
  };
}
