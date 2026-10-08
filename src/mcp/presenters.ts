import type { UiRun } from '../application/UiService.js';
import type { Device } from '../domain/Device.js';
import type { InstalledApp } from '../domain/InstalledApp.js';
import type { Screenshot } from '../domain/media.js';
import { describeElement, type UiElement, type UiStep } from '../domain/ui.js';
import { formatError } from './responses.js';

/**
 * Text renderings of domain results.
 *
 * Everything a tool returns is read by a model and paid for in tokens, so
 * these formats are compact on purpose: one line per item, no JSON
 * punctuation, no fields the client cannot act on.
 */

/** One line per element; each ends with the point to tap it at. */
export function formatElements(elements: readonly UiElement[]): string {
  return elements.length > 0 ? elements.map(describeElement).join('\n') : '(no labeled elements)';
}

const SCREEN_LEGEND = 'Format: Type "label" value="…" id=identifier @(x,y to tap) WIDTHxHEIGHT, in points.';

/** The accessibility elements of a screen, with a header naming the device. */
export function formatScreen(device: Device, elements: readonly UiElement[]): string {
  return `Screen of ${device.label}: ${elements.length} element(s).\n${SCREEN_LEGEND}\n${formatElements(elements)}`;
}

/** Short description of a step and, when it located an element, which one. */
export function describeStep(step: UiStep, element?: UiElement): string {
  const target = element ? ` -> ${describeElement(element)}` : '';
  switch (step.kind) {
    case 'tap':
      return `tap ${step.point}${step.durationSeconds ? ` for ${step.durationSeconds}s` : ''}`;
    case 'tapElement':
      return `tap_element ${step.query.describe()}${target}`;
    case 'swipe':
      return `swipe ${step.from} to ${step.to}`;
    case 'typeText':
      return `type_text (${step.text.length} characters)`;
    case 'pressButton':
      return `press_button ${step.button}`;
    case 'pressKey':
      return `press_key ${step.keyCode}`;
    case 'wait':
      return `wait ${step.seconds}s`;
    case 'waitForElement':
      return `wait_for_element ${step.query.describe()}${target}`;
  }
}

/**
 * Report of a run of UI steps: what completed, what failed and, when
 * available, what the screen shows now.
 */
export function formatRun(device: Device, run: UiRun, totalSteps: number): string {
  const lines: string[] = [];
  if (totalSteps === 1 && !run.failure) {
    const [only] = run.outcomes;
    lines.push(only ? `Done on ${device.label}: ${describeStep(only.step, only.element)}.` : `Done on ${device.label}.`);
  } else {
    lines.push(`Ran ${run.outcomes.length} of ${totalSteps} step(s) on ${device.label}.`);
    run.outcomes.forEach((outcome, index) => {
      lines.push(`${index + 1}. ${describeStep(outcome.step, outcome.element)}`);
    });
  }
  if (run.failure) {
    lines.push(`Step ${run.failure.index + 1} failed: ${formatError(run.failure.error)}`);
  }
  if (run.screen) {
    lines.push('', `Screen now (${run.screen.length} element(s)):`, formatElements(run.screen));
  }
  return lines.join('\n');
}

/** One line per app: `bundle.id  Name  version`. Host paths are left out; get_app_container returns them. */
export function formatApps(device: Device, apps: readonly InstalledApp[]): string {
  const lines = apps.map((app) =>
    [app.bundleId, app.name, app.version ?? '', app.type === 'System' ? '[system]' : '']
      .filter(Boolean)
      .join('  '),
  );
  return `${apps.length} app(s) on ${device.label}.\n${lines.join('\n')}`;
}

/** Caption of a screenshot, telling the model how to read coordinates off the image. */
export function describeScreenshot(device: Device, screenshot: Screenshot): string {
  const saved = screenshot.savedPath ? ` Saved to ${screenshot.savedPath}.` : '';
  const coordinates =
    screenshot.coordinateSpace === 'points'
      ? 'The image is in points: positions in it are the coordinates ui_tap and ui_swipe expect.'
      : screenshot.deviceScale
        ? `The image is in pixels at ${screenshot.deviceScale}x: divide positions by ${screenshot.deviceScale} to get the points ui_tap and ui_swipe expect.`
        : 'The image is in pixels, not points: use ui_describe_screen to get coordinates for ui_tap and ui_swipe.';
  return `Screenshot of ${device.label}.${saved} ${coordinates}`;
}
