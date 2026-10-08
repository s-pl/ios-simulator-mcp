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
}

/** Builds the configuration from the environment, falling back to sensible defaults. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    name: 'ios-simulator',
    version: readPackageVersion(),
    xcrunPath: nonEmpty(env['IOS_SIMULATOR_MCP_XCRUN_PATH']) ?? 'xcrun',
    idbPath: nonEmpty(env['IOS_SIMULATOR_MCP_IDB_PATH']) ?? 'idb',
    outputDirectory:
      nonEmpty(env['IOS_SIMULATOR_MCP_OUTPUT_DIR']) ?? path.join(os.tmpdir(), 'ios-simulator-mcp'),
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

/** `package.json` sits one level above both `src/` and `dist/`. */
function readPackageVersion(): string {
  const require = createRequire(import.meta.url);
  return (require('../package.json') as { version: string }).version;
}
