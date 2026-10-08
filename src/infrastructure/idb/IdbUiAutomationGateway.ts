import { CommandFailedError, ExecutableNotFoundError, UnexpectedOutputError } from '../../domain/errors.js';
import { Rect, type Point } from '../../domain/geometry.js';
import type { UiAutomationGateway } from '../../domain/ports/UiAutomationGateway.js';
import type { HardwareButton, SwipeOptions, UiElement } from '../../domain/ui.js';
import type { SimulatorHost } from '../host/SimulatorHost.js';

const IDB_HINT =
  'UI automation needs Facebook idb: run "brew tap facebook/fb && brew install idb-companion" and ' +
  '"pipx install fb-idb", or set IOS_SIMULATOR_MCP_IDB_PATH to the idb executable.';

/** Subset of an accessibility node as printed by `idb ui describe-*`. */
interface IdbElement {
  readonly type?: string;
  readonly AXLabel?: string | null;
  readonly AXValue?: string | null;
  readonly AXUniqueId?: string | null;
  readonly enabled?: boolean;
  readonly frame?: {
    readonly x?: number;
    readonly y?: number;
    readonly width?: number;
    readonly height?: number;
  };
}

/**
 * {@link UiAutomationGateway} implemented with Facebook's
 * [idb](https://fbidb.io) command line client.
 *
 * `simctl` cannot inject touches or read the accessibility tree, which is why
 * UI automation depends on this separate, optional tool.
 */
export class IdbUiAutomationGateway implements UiAutomationGateway {
  constructor(
    private readonly host: SimulatorHost,
    private readonly idbPath = 'idb',
  ) {}

  async tap(udid: string, point: Point, durationSeconds?: number): Promise<void> {
    await this.ui(udid, 'tap', [...optionalFlag('--duration', durationSeconds), String(point.x), String(point.y)]);
  }

  async swipe(udid: string, from: Point, to: Point, options: SwipeOptions = {}): Promise<void> {
    await this.ui(udid, 'swipe', [
      ...optionalFlag('--duration', options.durationSeconds),
      ...optionalFlag('--delta', options.stepSize),
      String(from.x),
      String(from.y),
      String(to.x),
      String(to.y),
    ]);
  }

  async typeText(udid: string, text: string): Promise<void> {
    // "--" keeps text starting with a dash from being parsed as an option.
    await this.ui(udid, 'text', ['--', text]);
  }

  async pressButton(udid: string, button: HardwareButton): Promise<void> {
    await this.ui(udid, 'button', [button]);
  }

  async pressKey(udid: string, keyCode: number): Promise<void> {
    await this.ui(udid, 'key', [String(keyCode)]);
  }

  async describeScreen(udid: string): Promise<UiElement[]> {
    const output = await this.ui(udid, 'describe-all', []);
    const parsed = parseJson(output, 'idb ui describe-all');
    if (!Array.isArray(parsed)) {
      throw new UnexpectedOutputError('idb ui describe-all', 'expected a JSON array of elements');
    }
    return (parsed as IdbElement[]).map(toUiElement);
  }

  async describePoint(udid: string, point: Point): Promise<UiElement | undefined> {
    const output = await this.ui(udid, 'describe-point', [String(point.x), String(point.y)]);
    if (!output.trim()) {
      return undefined;
    }
    const parsed = parseJson(output, 'idb ui describe-point');
    return parsed && typeof parsed === 'object' ? toUiElement(parsed) : undefined;
  }

  /** Runs `idb ui <action> --udid <udid> <args>` and returns its standard output. */
  private async ui(udid: string, action: string, args: readonly string[]): Promise<string> {
    try {
      const { stdout } = await this.host.run(this.idbPath, ['ui', action, '--udid', udid, ...args]);
      return stdout;
    } catch (error) {
      if (error instanceof ExecutableNotFoundError) {
        throw new ExecutableNotFoundError(this.idbPath, IDB_HINT);
      }
      if (error instanceof CommandFailedError) {
        throw explain(error.withOutput(summariseIdbError(error.stderr)));
      }
      throw error;
    }
  }
}

/**
 * idb is a Python program and reports failures as full tracebacks. Only the
 * final line, the exception message, means anything to a client.
 */
export function summariseIdbError(stderr: string): string {
  if (!stderr.includes('Traceback (most recent call last)')) {
    return stderr.trim();
  }
  const lines = stderr.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.at(-1)?.trim() ?? stderr.trim();
}

/** Adds advice to the idb failures whose cause is known. */
function explain(error: CommandFailedError): CommandFailedError {
  if (/No translation object returned/i.test(error.stderr)) {
    return error.withHint(
      'idb reads the screen through the Simulator app, so its window must be open. ' +
        'Call open_simulator_app, wait a few seconds and retry.',
    );
  }
  return error;
}

/** Maps an idb accessibility node to the domain model. */
export function toUiElement(element: IdbElement): UiElement {
  const frame = element.frame ?? {};
  return {
    type: element.type ?? 'Unknown',
    label: element.AXLabel || undefined,
    value: element.AXValue || undefined,
    identifier: element.AXUniqueId || undefined,
    enabled: element.enabled ?? true,
    frame: new Rect(frame.x ?? 0, frame.y ?? 0, frame.width ?? 0, frame.height ?? 0),
  };
}

function optionalFlag(flag: string, value: number | undefined): string[] {
  return value === undefined ? [] : [flag, String(value)];
}

function parseJson(output: string, source: string): unknown {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new UnexpectedOutputError(source, 'the output is not valid JSON', { cause: error });
  }
}
