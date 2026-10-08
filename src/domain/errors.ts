/**
 * Error hierarchy of the simulator domain.
 *
 * Every failure the server can explain to a client derives from
 * {@link SimulatorError} and carries a stable machine-readable `code`, so the
 * presentation layer can render it without knowing where it came from.
 */
export abstract class SimulatorError extends Error {
  /** Stable identifier of the failure category (e.g. `DEVICE_NOT_FOUND`). */
  abstract readonly code: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The host is not macOS, so no simulator tooling is available. */
export class UnsupportedPlatformError extends SimulatorError {
  readonly code = 'UNSUPPORTED_PLATFORM';

  constructor(readonly platform: string) {
    super(
      `The iOS Simulator is only available on macOS with Xcode installed (current platform: ${platform}).`,
    );
  }
}

/** A required command line tool is not installed or not on the PATH. */
export class ExecutableNotFoundError extends SimulatorError {
  readonly code = 'EXECUTABLE_NOT_FOUND';

  constructor(
    readonly executable: string,
    readonly hint?: string,
  ) {
    super(`Executable "${executable}" was not found.${hint ? ` ${hint}` : ''}`);
  }
}

/** An external command exited with a non-zero status. */
export class CommandFailedError extends SimulatorError {
  readonly code = 'COMMAND_FAILED';

  constructor(
    readonly commandLine: string,
    readonly exitCode: number | null,
    readonly stderr: string,
    options?: ErrorOptions,
    /** Explanation of the likely cause and how to fix it, when one is known. */
    readonly hint?: string,
  ) {
    const detail = stderr.trim() || 'no error output';
    super(
      `Command failed (exit code ${exitCode ?? 'unknown'}): ${commandLine}\n${detail}` +
        (hint ? `\nHint: ${hint}` : ''),
      options,
    );
  }

  /** Same failure with different error output, e.g. stripped of noise. */
  withOutput(stderr: string): CommandFailedError {
    return new CommandFailedError(this.commandLine, this.exitCode, stderr, { cause: this.cause }, this.hint);
  }

  /** Same failure, explained. */
  withHint(hint: string): CommandFailedError {
    return new CommandFailedError(this.commandLine, this.exitCode, this.stderr, { cause: this.cause }, hint);
  }
}

/** An external command did not finish within its time budget. */
export class CommandTimeoutError extends SimulatorError {
  readonly code = 'COMMAND_TIMEOUT';

  constructor(
    readonly commandLine: string,
    readonly timeoutMs: number,
  ) {
    super(`Command timed out after ${timeoutMs} ms: ${commandLine}`);
  }
}

/** An external command succeeded but its output could not be interpreted. */
export class UnexpectedOutputError extends SimulatorError {
  readonly code = 'UNEXPECTED_OUTPUT';

  constructor(source: string, detail: string, options?: ErrorOptions) {
    super(`Could not interpret the output of ${source}: ${detail}`, options);
  }
}

/** No simulator matches the UDID or name given by the client. */
export class DeviceNotFoundError extends SimulatorError {
  readonly code = 'DEVICE_NOT_FOUND';

  constructor(readonly reference: string) {
    super(`No available simulator matches "${reference}". Use list_devices to see valid names and UDIDs.`);
  }
}

/** A device was required implicitly but no simulator is booted. */
export class NoBootedDeviceError extends SimulatorError {
  readonly code = 'NO_BOOTED_DEVICE';

  constructor() {
    super('No simulator is booted. Boot one with boot_device or pass an explicit device.');
  }
}

/** The reference (or its omission) matches more than one simulator. */
export class AmbiguousDeviceError extends SimulatorError {
  readonly code = 'AMBIGUOUS_DEVICE';

  constructor(
    reason: string,
    readonly candidates: readonly string[],
  ) {
    super(`${reason} Pass the UDID of one of: ${candidates.join('; ')}.`);
  }
}

/** The operation needs a running simulator but the device is not booted. */
export class DeviceNotBootedError extends SimulatorError {
  readonly code = 'DEVICE_NOT_BOOTED';

  constructor(deviceLabel: string, state: string) {
    super(`Simulator ${deviceLabel} must be booted for this operation (current state: ${state}).`);
  }
}

/** The operation needs a stopped simulator but the device is running. */
export class DeviceNotShutdownError extends SimulatorError {
  readonly code = 'DEVICE_NOT_SHUTDOWN';

  constructor(deviceLabel: string, state: string) {
    super(`Simulator ${deviceLabel} must be shut down for this operation (current state: ${state}).`);
  }
}

/** A screen recording is already running on the device. */
export class RecordingAlreadyActiveError extends SimulatorError {
  readonly code = 'RECORDING_ALREADY_ACTIVE';

  constructor(deviceLabel: string, outputPath: string) {
    super(`Simulator ${deviceLabel} is already being recorded to ${outputPath}. Stop it with stop_recording first.`);
  }
}

/** There is no screen recording to stop. */
export class NoActiveRecordingError extends SimulatorError {
  readonly code = 'NO_ACTIVE_RECORDING';

  constructor(deviceLabel?: string) {
    super(
      deviceLabel
        ? `There is no active recording for simulator ${deviceLabel}.`
        : 'There is no active recording.',
    );
  }
}

/** The client supplied a value that is syntactically valid but not acceptable. */
export class InvalidArgumentError extends SimulatorError {
  readonly code = 'INVALID_ARGUMENT';
}

/** No element on screen matches the query, even after waiting. */
export class ElementNotFoundError extends SimulatorError {
  readonly code = 'ELEMENT_NOT_FOUND';

  constructor(
    readonly query: string,
    readonly visible: readonly string[],
  ) {
    const onScreen =
      visible.length > 0 ? `Elements on screen:\n${visible.join('\n')}` : 'The screen exposes no labeled elements.';
    super(`No element on screen matches ${query}. ${onScreen}`);
  }
}

/** Several distinct elements match the query and no index was given. */
export class AmbiguousElementError extends SimulatorError {
  readonly code = 'AMBIGUOUS_ELEMENT';

  constructor(
    readonly query: string,
    readonly candidates: readonly string[],
  ) {
    const numbered = candidates.map((candidate, index) => `${index}: ${candidate}`).join('\n');
    super(`${candidates.length} elements match ${query}. Narrow the query or pass "index":\n${numbered}`);
  }
}

/** The operation targets an app that is not installed on the simulator. */
export class AppNotInstalledError extends SimulatorError {
  readonly code = 'APP_NOT_INSTALLED';

  constructor(
    readonly bundleId: string,
    deviceLabel: string,
  ) {
    super(`App "${bundleId}" is not installed on ${deviceLabel}. Use list_apps to see the installed bundle ids.`);
  }
}

/** A file or directory the client referred to does not exist on the host. */
export class PathNotFoundError extends SimulatorError {
  readonly code = 'PATH_NOT_FOUND';

  constructor(readonly path: string) {
    super(`"${path}" does not exist on this Mac. Pass the absolute path of an existing file.`);
  }
}

/** The text contains characters the keyboard automation cannot type. */
export class UnsupportedTextError extends SimulatorError {
  readonly code = 'UNSUPPORTED_TEXT';

  constructor(readonly characters: readonly string[]) {
    super(
      `Cannot type ${characters.map((character) => JSON.stringify(character)).join(', ')}: the simulated keyboard ` +
        'only types unaccented Latin letters, digits and common punctuation. To enter this text, copy it with ' +
        'set_clipboard, long-press the text field and tap the "Paste" item of the menu that appears.',
    );
  }
}
