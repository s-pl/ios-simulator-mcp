import { spawnSync } from 'node:child_process';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { loadConfig } from '../../src/config.js';
import { createContainer, type Container } from '../../src/container.js';

/** Shared plumbing of the tests that drive a real simulator. */

export const isMac = process.platform === 'darwin';
export const config = loadConfig();
export const hasIdb = isMac && spawnSync(config.idbPath, ['--help'], { stdio: 'ignore' }).status === 0;

export interface Content {
  readonly type: string;
  readonly text?: string;
  readonly data?: string;
}

export interface Outcome {
  readonly isError: boolean;
  readonly text: string;
  readonly content: Content[];
  /** Wall-clock duration of the call, in milliseconds. */
  readonly ms: number;
}

/** A real MCP client connected to the real server, bound to one booted iPhone simulator. */
export class Session {
  private readonly client = new Client({ name: 'integration', version: '0.0.0' });
  private container: Container | undefined;
  udid = '';
  deviceName = '';

  async start(): Promise<this> {
    this.container = createContainer(config);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await this.container.server.connect(serverTransport);
    await this.client.connect(clientTransport);

    const listed = await this.call('list_devices', { platform: 'iOS' });
    const devices = JSON.parse(listed.text) as { udid: string; name: string }[];
    const iphone = devices.find((device) => device.name.startsWith('iPhone'));
    if (!iphone) {
      throw new Error('No iPhone simulator is available on this machine.');
    }
    this.udid = iphone.udid;
    this.deviceName = iphone.name;

    // The window is opened because idb reads accessibility through the Simulator app.
    const booted = await this.ok('boot_device');
    console.log(`Using ${iphone.name} (${this.udid}); idb available: ${hasIdb}. ${booted.text}`);
    return this;
  }

  /** Calls a tool exactly as given. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<Outcome> {
    const startedAt = performance.now();
    const result = await this.client.callTool({ name, arguments: args }, undefined, { timeout: 280_000 });
    const content = result.content as Content[];
    return {
      isError: result.isError === true,
      content,
      text: content.flatMap((item) => (item.type === 'text' ? [item.text ?? ''] : [])).join('\n'),
      ms: performance.now() - startedAt,
    };
  }

  /** Calls a tool on the session's device and fails if it reports an error. */
  async ok(name: string, args: Record<string, unknown> = {}): Promise<Outcome> {
    const outcome = await this.call(name, { device: this.udid, ...args });
    if (outcome.isError) {
      throw new Error(`${name} failed: ${outcome.text}`);
    }
    return outcome;
  }

  /** Calls a tool on the session's device, returning the outcome even when it is an error. */
  attempt(name: string, args: Record<string, unknown> = {}): Promise<Outcome> {
    return this.call(name, { device: this.udid, ...args });
  }

  async stop(options: { shutdown?: boolean } = {}): Promise<void> {
    if (options.shutdown && this.udid) {
      await this.call('shutdown_device', { device: this.udid }).catch(() => undefined);
    }
    await this.client.close();
    await this.container?.dispose();
  }
}

export const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
