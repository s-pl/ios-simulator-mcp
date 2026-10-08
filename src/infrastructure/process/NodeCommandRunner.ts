import { spawn, type ChildProcess } from 'node:child_process';

import {
  CommandFailedError,
  CommandTimeoutError,
  ExecutableNotFoundError,
} from '../../domain/errors.js';
import type { BackgroundProcess, CommandResult, CommandRunner, RunOptions } from './CommandRunner.js';

/** Upper bound of the output retained for a background process. */
const MAX_BACKGROUND_OUTPUT_CHARS = 64 * 1024;

/** {@link CommandRunner} backed by `node:child_process`. */
export class NodeCommandRunner implements CommandRunner {
  run(command: string, args: readonly string[], options: RunOptions = {}): Promise<CommandResult> {
    const commandLine = formatCommandLine(command, args);

    return new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let timedOut = false;

      const timer =
        options.timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              timedOut = true;
              child.kill('SIGKILL');
            }, options.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

      child.once('error', (error) => {
        clearTimeout(timer);
        reject(toSpawnError(error, command, commandLine));
      });

      child.once('close', (exitCode) => {
        clearTimeout(timer);
        const result = {
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        };
        if (timedOut) {
          reject(new CommandTimeoutError(commandLine, options.timeoutMs ?? 0));
        } else if (exitCode === 0) {
          resolve(result);
        } else {
          reject(new CommandFailedError(commandLine, exitCode, result.stderr || result.stdout));
        }
      });

      // A process that exits without reading its input raises EPIPE here; the
      // failure is already reported through its exit status.
      child.stdin.on('error', () => undefined);
      child.stdin.end(options.stdin ?? '');
    });
  }

  start(command: string, args: readonly string[]): BackgroundProcess {
    const child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    return new NodeBackgroundProcess(child, command, formatCommandLine(command, args));
  }
}

interface Exit {
  readonly code: number | null;
  readonly error?: Error;
}

class NodeBackgroundProcess implements BackgroundProcess {
  private output = '';
  private exit: Exit | undefined;
  private readonly watchers = new Set<() => void>();

  constructor(
    private readonly child: ChildProcess,
    private readonly command: string,
    private readonly commandLine: string,
  ) {
    const collect = (chunk: Buffer): void => {
      this.output = (this.output + chunk.toString('utf8')).slice(-MAX_BACKGROUND_OUTPUT_CHARS);
      this.notify();
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.once('error', (error) => this.markExited({ code: null, error }));
    child.once('close', (code) => this.markExited({ code }));
  }

  get hasExited(): boolean {
    return this.exit !== undefined;
  }

  waitForOutput(pattern: RegExp, timeoutMs: number): Promise<void> {
    return this.waitUntil(() => {
      if (pattern.test(this.output)) {
        return true;
      }
      if (this.exit) {
        throw this.exitError(this.exit);
      }
      return false;
    }, timeoutMs);
  }

  async interrupt(timeoutMs: number): Promise<void> {
    if (this.exit) {
      return;
    }
    this.child.kill('SIGINT');
    try {
      await this.waitUntil(() => this.exit !== undefined, timeoutMs);
    } catch (error) {
      this.child.kill('SIGKILL');
      throw error;
    }
  }

  /** Re-evaluates `condition` on every process event until it holds or throws. */
  private waitUntil(condition: () => boolean, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const settle = (finish: () => void): void => {
        clearTimeout(timer);
        this.watchers.delete(check);
        finish();
      };
      const check = (): void => {
        try {
          if (condition()) {
            settle(resolve);
          }
        } catch (error) {
          settle(() => reject(error));
        }
      };
      const timer = setTimeout(
        () => settle(() => reject(new CommandTimeoutError(this.commandLine, timeoutMs))),
        timeoutMs,
      );
      this.watchers.add(check);
      check();
    });
  }

  private markExited(exit: Exit): void {
    this.exit ??= exit;
    this.notify();
  }

  private notify(): void {
    for (const watcher of [...this.watchers]) {
      watcher();
    }
  }

  private exitError(exit: Exit): Error {
    return exit.error
      ? toSpawnError(exit.error, this.command, this.commandLine)
      : new CommandFailedError(this.commandLine, exit.code, this.output);
  }
}

function toSpawnError(error: Error, command: string, commandLine: string): Error {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
    ? new ExecutableNotFoundError(command)
    : new CommandFailedError(commandLine, null, error.message, { cause: error });
}

function formatCommandLine(command: string, args: readonly string[]): string {
  return [command, ...args].map((part) => (/[\s"']/.test(part) ? JSON.stringify(part) : part)).join(' ');
}
