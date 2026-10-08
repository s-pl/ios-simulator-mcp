const RUNTIME_PREFIX = 'com.apple.CoreSimulator.SimRuntime.';

/**
 * Operating system image a simulator runs, e.g. iOS 17.5.
 *
 * CoreSimulator identifies runtimes with strings such as
 * `com.apple.CoreSimulator.SimRuntime.iOS-17-5`; this value object exposes the
 * platform and version encoded in that identifier.
 */
export class Runtime {
  private constructor(
    /** Full CoreSimulator identifier. */
    readonly identifier: string,
    /** Platform name: `iOS`, `watchOS`, `tvOS`, `xrOS`… or `Unknown`. */
    readonly platform: string,
    /** Dotted version (`17.5`), or an empty string when it cannot be derived. */
    readonly version: string,
  ) {}

  /** Builds a runtime from its CoreSimulator identifier. Never throws. */
  static fromIdentifier(identifier: string): Runtime {
    const suffix = identifier.startsWith(RUNTIME_PREFIX)
      ? identifier.slice(RUNTIME_PREFIX.length)
      : identifier;
    const match = /^([A-Za-z]+)-(\d+(?:-\d+)*)$/.exec(suffix);
    if (!match) {
      return new Runtime(identifier, 'Unknown', '');
    }
    const [, platform = 'Unknown', version = ''] = match;
    return new Runtime(identifier, platform, version.replaceAll('-', '.'));
  }

  /** Human readable name, e.g. `iOS 17.5`. */
  get displayName(): string {
    return this.version ? `${this.platform} ${this.version}` : this.identifier;
  }
}
