#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadConfig } from './config.js';
import { createContainer } from './container.js';

/**
 * Entry point: serves the MCP server over stdio.
 *
 * stdout belongs to the protocol, so diagnostics must go to stderr.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const container = createContainer(config, { log: (message) => console.error(message) });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await container.dispose().catch(() => undefined);
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  // The client closing the pipe is the normal way a stdio server is stopped.
  process.stdin.once('close', () => void shutdown());

  await container.server.connect(new StdioServerTransport());
  console.error(`${config.name} MCP server v${config.version} running on stdio`);
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
