import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * Black-box tests of the shipped artefact: the compiled server is started as
 * a child process and driven over stdio, exactly as an MCP client does.
 * Nothing is faked, so these run against whatever the host really is.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const entryPoint = path.join(root, 'dist', 'index.js');
const isMac = process.platform === 'darwin';

interface Session {
  readonly client: Client;
  readonly transport: StdioClientTransport;
  readonly stderr: () => string;
}

let session: Session | undefined;

async function connect(env: Record<string, string> = {}): Promise<Session> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entryPoint],
    env: { ...(process.env as Record<string, string>), ...env },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const client = new Client({ name: 'stdio-test', version: '0.0.0' });
  await client.connect(transport);
  session = { client, transport, stderr: () => stderr };
  return session;
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  return (result.content as { type: string; text?: string }[]).map((item) => item.text ?? '').join('\n');
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

beforeAll(() => {
  if (!existsSync(entryPoint)) {
    throw new Error(`${entryPoint} is missing: run "npm run build" first (npm test does it for you).`);
  }
});

afterEach(async () => {
  await session?.client.close();
  session = undefined;
});

describe('server process over stdio', () => {
  it('completes the MCP handshake and identifies itself', async () => {
    const { client } = await connect();
    expect(client.getServerVersion()).toMatchObject({ name: 'ios-simulator', version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
    expect(client.getServerCapabilities()?.tools).toBeDefined();
    expect(client.getInstructions()).toContain('ui_sequence');
  });

  it('serves its tools', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(34);
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['list_devices', 'ui_tap_element', 'ui_sequence', 'screenshot', 'set_clipboard']),
    );
  });

  it('keeps stdout for the protocol and logs to stderr', async () => {
    const { client, stderr } = await connect();
    // If anything but JSON-RPC reached stdout, these round trips would fail.
    await client.listTools();
    await client.ping();
    expect(stderr()).toContain('MCP server');
  });

  it.runIf(isMac)('lists the real simulators on macOS', async () => {
    const { client } = await connect();
    const result = await client.callTool({ name: 'list_devices', arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(Array.isArray(JSON.parse(textOf(result)))).toBe(true);
  });

  it.runIf(!isMac)('answers every call with a clear error off macOS', async () => {
    const { client } = await connect();
    for (const [name, args] of [
      ['list_devices', {}],
      ['ui_tap_element', { label: 'OK' }],
      ['screenshot', {}],
    ] as const) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/^\[UNSUPPORTED_PLATFORM\] The iOS Simulator is only available on macOS/);
    }
  });

  it('rejects invalid arguments and unknown tools without crashing', async () => {
    const { client } = await connect();
    const invalid = await client.callTool({ name: 'ui_tap', arguments: { x: 'left', y: 1 } });
    expect(invalid.isError).toBe(true);

    const unknown = await client.callTool({ name: 'no_such_tool', arguments: {} }).then(
      (result) => result.isError === true,
      () => true,
    );
    expect(unknown).toBe(true);

    await expect(client.ping()).resolves.toBeDefined();
  });

  it('handles many concurrent calls', async () => {
    const { client } = await connect();
    const results = await Promise.all(
      Array.from({ length: 25 }, () => client.callTool({ name: 'ui_tap', arguments: { x: -1, y: 0 } })),
    );
    expect(results.every((result) => result.isError === true)).toBe(true);
  });

  it('starts with a nonsensical configuration, falling back to defaults', async () => {
    const { client } = await connect({
      IOS_SIMULATOR_MCP_DEVICE_CACHE_MS: 'forever',
      IOS_SIMULATOR_MCP_IDB_PATH: '   ',
    });
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
  });

  it('reports a missing xcrun instead of hanging', async () => {
    const { client } = await connect({ IOS_SIMULATOR_MCP_XCRUN_PATH: 'definitely-not-xcrun-xyz' });
    const result = await client.callTool({ name: 'list_devices', arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(isMac ? /^\[EXECUTABLE_NOT_FOUND\].*xcode-select/s : /^\[UNSUPPORTED_PLATFORM\]/);
  });

  it('exits when the client disconnects', async () => {
    const { client, transport } = await connect();
    const pid = transport.pid;
    expect(pid).toBeTypeOf('number');
    await client.close();
    session = undefined;

    const deadline = Date.now() + 10_000;
    while (isAlive(pid as number) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(isAlive(pid as number)).toBe(false);
  });
});
