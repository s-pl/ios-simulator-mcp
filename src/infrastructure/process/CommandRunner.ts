/** Captured output of a command that exited successfully. */
export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunOptions {
  /** Text written to the standard input of the process. */
  readonly stdin?: string;
  /** Kill the process and fail when it runs longer than this. */
  readonly timeoutMs?: number;
}

/** A long-lived process started with {@link CommandRunner.start}. */
export interface BackgroundProcess {
  readonly hasExited: boolean;

  /**
   * Resolves when the combined output of the process matches `pattern`.
   * Rejects if the process exits first or the timeout elapses.
   */
  waitForOutput(pattern: RegExp, timeoutMs: number): Promise<void>;

  /**
   * Asks the process to finish (SIGINT) and waits for it to exit.
   * The process is killed if it has not exited after `timeoutMs`.
   */
  interrupt(timeoutMs: number): Promise<void>;
}

/**
 * Execution of external programs.
 *
 * Commands are always given as an executable plus an argument vector and are
 * never interpreted by a shell, so arguments need no quoting or escaping.
 */
export interface CommandRunner {
  /**
   * Runs a command to completion.
   * @throws CommandFailedError on a non-zero exit status.
   * @throws ExecutableNotFoundError when the executable does not exist.
   * @throws CommandTimeoutError when `timeoutMs` elapses.
   */
  run(command: string, args: readonly string[], options?: RunOptions): Promise<CommandResult>;

  /** Starts a command that keeps running until it is interrupted. */
  start(command: string, args: readonly string[]): BackgroundProcess;
}
