import os from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { loadConfig, type ServerConfig } from '../../src/config.js';
import { createContainer, type Container, type ContainerOverrides } from '../../src/container.js';
import { FakeClock } from './FakeClock.js';
import { deviceListJson, FakeCommandRunner } from './FakeCommandRunner.js';

export interface ToolContent {
  readonly type: string;
  readonly text?: string;
  readonly data?: string;
  readonly mimeType?: string;
}

export interface ToolOutcome {
  readonly isError: boolean;
  readonly content: ToolContent[];
  /** All text blocks joined. */
  readonly text: string;
}

export interface HarnessOptions {
  readonly platform?: NodeJS.Platform;
  readonly config?: Partial<ServerConfig>;
  /** How the server reaches an idb companion, for tests of the companion backend. */
  readonly companion?: Pick<ContainerOverrides, 'companionConnector' | 'companionPort'>;
}

/**
 * A real MCP client talking to the full application over an in-memory
 * transport. Only command execution and time are faked, so a test exercises
 * every layer exactly as a client would.
 */
export class Harness {
  readonly runner = new FakeCommandRunner().on('xcrun simctl list devices', deviceListJson());
  readonly clock = new FakeClock();
  /** Diagnostics the server logged outside of tool responses. */
  readonly logs: string[] = [];
  private readonly client = new Client({ name: 'test-client', version: '0.0.0' });
  private container: Container | undefined;

  static start(options: HarnessOptions = {}): Promise<Harness> {
    return new Harness().start(options);
  }

  async start(options: HarnessOptions = {}): Promise<this> {
    const config: ServerConfig = {
      ...loadConfig({}),
      outputDirectory: path.join(os.tmpdir(), 'ios-simulator-mcp-test'),
      // The command line backend is the one whose commands the fake runner can observe.
      uiBackend: 'cli',
      ...options.config,
    };
    this.container = createContainer(config, {
      runner: this.runner,
      platform: options.platform ?? 'darwin',
      clock: this.clock,
      log: (message) => this.logs.push(message),
      ...options.companion,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await this.container.server.connect(serverTransport);
    await this.client.connect(clientTransport);
    return this;
  }

  get instructions(): string | undefined {
    return this.client.getInstructions();
  }

  async tools(): Promise<Awaited<ReturnType<Client['listTools']>>['tools']> {
    return (await this.client.listTools()).tools;
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolOutcome> {
    const result = await this.client.callTool({ name, arguments: args });
    const content = result.content as ToolContent[];
    return {
      isError: result.isError === true,
      content,
      text: content.flatMap((item) => (item.type === 'text' ? [item.text ?? ''] : [])).join('\n'),
    };
  }

  /** Calls a tool and fails the test if it reports an error. */
  async ok(name: string, args: Record<string, unknown> = {}): Promise<ToolOutcome> {
    const outcome = await this.call(name, args);
    if (outcome.isError) {
      throw new Error(`${name} unexpectedly failed: ${outcome.text}`);
    }
    return outcome;
  }

  async stop(): Promise<void> {
    await this.client.close();
    await this.container?.dispose();
  }
}
