import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

/** Runtime settings of the server, all overridable through environment variables. */
export interface ServerConfig {
  readonly name: string;
  readonly version: string;
  /** `xcrun` executable (`IOS_SIMULATOR_MCP_XCRUN_PATH`). */
  readonly xcrunPath: string;
  /** `idb` executable used for UI automation (`IOS_SIMULATOR_MCP_IDB_PATH`). */
  readonly idbPath: string;
  /** Where recordings are stored by default (`IOS_SIMULATOR_MCP_OUTPUT_DIR`). */
  readonly outputDirectory: string;
  /**
   * How long the list of simulators is reused between calls, in milliseconds
   * (`IOS_SIMULATOR_MCP_DEVICE_CACHE_MS`). `0` disables the cache.
   */
  readonly deviceCacheTtlMs: number;
}

const DEFAULT_DEVICE_CACHE_TTL_MS = 10_000;

/** Builds the configuration from the environment, falling back to sensible defaults. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    name: 'ios-simulator',
    version: readPackageVersion(),
    xcrunPath: nonEmpty(env['IOS_SIMULATOR_MCP_XCRUN_PATH']) ?? 'xcrun',
    idbPath: nonEmpty(env['IOS_SIMULATOR_MCP_IDB_PATH']) ?? 'idb',
    outputDirectory:
      nonEmpty(env['IOS_SIMULATOR_MCP_OUTPUT_DIR']) ?? path.join(os.tmpdir(), 'ios-simulator-mcp'),
    deviceCacheTtlMs: nonNegativeInteger(env['IOS_SIMULATOR_MCP_DEVICE_CACHE_MS']) ?? DEFAULT_DEVICE_CACHE_TTL_MS,
  };
}

/** Parses a whole number of milliseconds; anything else is ignored in favour of the default. */
function nonNegativeInteger(value: string | undefined): number | undefined {
  const trimmed = nonEmpty(value);
  return trimmed !== undefined && /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

/** `package.json` sits one level above both `src/` and `dist/`. */
function readPackageVersion(): string {
  const require = createRequire(import.meta.url);
  return (require('../package.json') as { version: string }).version;
}
