import type {
  BackgroundProcess,
  CommandResult,
  CommandRunner,
  RunOptions,
} from '../../src/infrastructure/process/CommandRunner.js';

type Responder = (args: readonly string[], options: RunOptions) => string | Promise<string>;

interface RecordedCall {
  readonly commandLine: string;
  readonly args: readonly string[];
  readonly stdin: string | undefined;
}

/**
 * In-memory {@link CommandRunner}: records every command and answers with
 * canned output, so the whole application can be exercised without a Mac.
 */
export class FakeCommandRunner implements CommandRunner {
  readonly calls: RecordedCall[] = [];
  readonly background: FakeBackgroundProcess[] = [];
  private readonly responders: { prefix: string; respond: Responder }[] = [];

  /** Answers commands whose command line starts with `prefix`. Later rules win. */
  on(prefix: string, response: string | Responder): this {
    this.responders.unshift({ prefix, respond: typeof response === 'string' ? () => response : response });
    return this;
  }

  get commandLines(): string[] {
    return this.calls.map((call) => call.commandLine);
  }

  async run(command: string, args: readonly string[], options: RunOptions = {}): Promise<CommandResult> {
    const commandLine = [command, ...args].join(' ');
    this.calls.push({ commandLine, args, stdin: options.stdin });
    const rule = this.responders.find(({ prefix }) => commandLine.startsWith(prefix));
    return { stdout: rule ? await rule.respond(args, options) : '', stderr: '' };
  }

  start(command: string, args: readonly string[]): BackgroundProcess {
    this.calls.push({ commandLine: [command, ...args].join(' '), args, stdin: undefined });
    const process = new FakeBackgroundProcess();
    this.background.push(process);
    return process;
  }
}

export class FakeBackgroundProcess implements BackgroundProcess {
  hasExited = false;

  async waitForOutput(): Promise<void> {}

  async interrupt(): Promise<void> {
    this.hasExited = true;
  }
}

const IOS_17 = 'com.apple.CoreSimulator.SimRuntime.iOS-17-5';
const IOS_18 = 'com.apple.CoreSimulator.SimRuntime.iOS-18-0';

export const UDID = {
  iphone15: 'AAAAAAAA-0000-0000-0000-000000000001',
  iphone15OnIos18: 'AAAAAAAA-0000-0000-0000-000000000002',
  ipad: 'AAAAAAAA-0000-0000-0000-000000000003',
  unavailable: 'AAAAAAAA-0000-0000-0000-000000000004',
} as const;

/** `simctl list devices --json` output with the given devices booted. */
export function deviceListJson(booted: readonly string[] = [UDID.iphone15]): string {
  const state = (udid: string): string => (booted.includes(udid) ? 'Booted' : 'Shutdown');
  return JSON.stringify({
    devices: {
      [IOS_17]: [
        { udid: UDID.iphone15, name: 'iPhone 15', state: state(UDID.iphone15), isAvailable: true },
        { udid: UDID.ipad, name: 'iPad Air', state: state(UDID.ipad), isAvailable: true },
        { udid: UDID.unavailable, name: 'iPhone 8', state: 'Shutdown', isAvailable: false },
      ],
      [IOS_18]: [
        {
          udid: UDID.iphone15OnIos18,
          name: 'iPhone 15',
          state: state(UDID.iphone15OnIos18),
          isAvailable: true,
        },
      ],
    },
  });
}
