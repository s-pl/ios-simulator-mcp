import { CommandFailedError, ExecutableNotFoundError, UnsupportedPlatformError } from '../../domain/errors.js';
import type { BackgroundProcess, CommandResult, CommandRunner, RunOptions } from '../process/CommandRunner.js';

export interface SimulatorHostOptions {
  /** Path or name of the `xcrun` executable. */
  readonly xcrunPath?: string;
  /** Platform of the host; injectable for testing. Defaults to the real one. */
  readonly platform?: NodeJS.Platform;
}

/** Generous on purpose: simctl can stall for a long time while a simulator is still settling after boot. */
const DEFAULT_TIMEOUT_MS = 120_000;
/** Attempts given to a repeatable command before a transient timeout is reported. */
const TRANSIENT_ATTEMPTS = 3;
const XCODE_HINT = 'Install Xcode and its command line tools (xcode-select --install).';

/**
 * The Mac that hosts the simulators.
 *
 * Single entry point for every macOS command the server runs (`xcrun simctl`
 * and a few system utilities). It guarantees commands are only attempted on
 * macOS and applies a default timeout so a stuck tool cannot hang the server.
 */
export class SimulatorHost {
  private readonly xcrunPath: string;
  private readonly platform: NodeJS.Platform;

  constructor(
    private readonly runner: CommandRunner,
    options: SimulatorHostOptions = {},
  ) {
    this.xcrunPath = options.xcrunPath ?? 'xcrun';
    this.platform = options.platform ?? process.platform;
  }

  /** Runs `xcrun simctl <args>`. */
  async simctl(args: readonly string[], options: RunOptions = {}): Promise<CommandResult> {
    try {
      return await this.run(this.xcrunPath, ['simctl', ...args], options);
    } catch (error) {
      if (error instanceof ExecutableNotFoundError) {
        throw new ExecutableNotFoundError(this.xcrunPath, XCODE_HINT);
      }
      throw error;
    }
  }

  /**
   * Runs a `simctl` command that is safe to repeat, retrying when CoreSimulator
   * answers "Operation timed out". That answer is intermittent, typically seen
   * right after another operation restarted a system service, and the same
   * command succeeds when run again.
   */
  async simctlRepeatable(args: readonly string[], options: RunOptions = {}): Promise<CommandResult> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.simctl(args, options);
      } catch (error) {
        const transient = error instanceof CommandFailedError && /operation timed out/i.test(error.stderr);
        if (!transient || attempt >= TRANSIENT_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  /** Starts a long-running `xcrun simctl <args>` process. */
  startSimctl(args: readonly string[]): BackgroundProcess {
    this.assertMacOs();
    return this.runner.start(this.xcrunPath, ['simctl', ...args]);
  }

  /** Starts any other long-running executable of the host. */
  start(command: string, args: readonly string[]): BackgroundProcess {
    this.assertMacOs();
    return this.runner.start(command, args);
  }

  /** Runs any other executable of the host. */
  async run(command: string, args: readonly string[], options: RunOptions = {}): Promise<CommandResult> {
    this.assertMacOs();
    return this.runner.run(command, args, { timeoutMs: DEFAULT_TIMEOUT_MS, ...options });
  }

  private assertMacOs(): void {
    if (this.platform !== 'darwin') {
      throw new UnsupportedPlatformError(this.platform);
    }
  }
}
