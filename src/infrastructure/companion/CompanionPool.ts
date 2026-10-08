import { createServer } from 'node:net';

import { SimulatorError, UiBackendUnavailableError } from '../../domain/errors.js';
import type { SimulatorHost } from '../host/SimulatorHost.js';
import type { BackgroundProcess } from '../process/CommandRunner.js';
import { GrpcCompanionConnection, type CompanionConnection, type CompanionConnector } from './CompanionConnection.js';

export interface CompanionPoolOptions {
  /** Path or name of the `idb_companion` executable. */
  readonly companionPath?: string;
  readonly connect?: CompanionConnector;
  /** Picks a TCP port the companion can listen on; injectable for testing. */
  readonly freePort?: () => Promise<number>;
  readonly startupTimeoutMs?: number;
}

interface Companion {
  readonly process: BackgroundProcess;
  readonly connection: CompanionConnection;
}

const DEFAULT_STARTUP_TIMEOUT_MS = 20_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * Keeps one `idb_companion` process, and one connection to it, per simulator.
 *
 * The idb command line starts a Python interpreter and connects to the
 * companion on every single call. Holding the connection open removes that
 * cost from each interaction, which is most of what a tap or a screen read
 * takes.
 */
export class CompanionPool {
  private readonly companions = new Map<string, Promise<Companion>>();
  private readonly companionPath: string;
  private readonly connect: CompanionConnector;
  private readonly freePort: () => Promise<number>;
  private readonly startupTimeoutMs: number;

  constructor(
    private readonly host: SimulatorHost,
    options: CompanionPoolOptions = {},
  ) {
    this.companionPath = options.companionPath ?? 'idb_companion';
    this.connect = options.connect ?? ((address) => new GrpcCompanionConnection(address));
    this.freePort = options.freePort ?? findFreePort;
    this.startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  }

  /**
   * The connection to the companion of a simulator, starting it on first use.
   * @throws UiBackendUnavailableError when the companion cannot be started.
   */
  async connectionFor(udid: string): Promise<CompanionConnection> {
    const existing = this.companions.get(udid);
    if (existing) {
      const companion = await existing;
      if (!companion.process.hasExited) {
        return companion.connection;
      }
      // The companion died (the simulator was shut down, for instance): start a new one.
      companion.connection.close();
      this.companions.delete(udid);
    }

    const starting = this.start(udid);
    this.companions.set(udid, starting);
    try {
      return (await starting).connection;
    } catch (error) {
      this.companions.delete(udid);
      throw error;
    }
  }

  /** Closes every connection and stops every companion. */
  async dispose(): Promise<void> {
    const companions = await Promise.allSettled(this.companions.values());
    this.companions.clear();
    await Promise.allSettled(
      companions.map(async (result) => {
        if (result.status === 'fulfilled') {
          result.value.connection.close();
          await result.value.process.interrupt(SHUTDOWN_TIMEOUT_MS);
        }
      }),
    );
  }

  private async start(udid: string): Promise<Companion> {
    let process: BackgroundProcess | undefined;
    let connection: CompanionConnection | undefined;
    try {
      const port = await this.freePort();
      process = this.host.start(this.companionPath, ['--udid', udid, '--grpc-port', String(port)]);
      connection = this.connect(`127.0.0.1:${port}`);

      // A companion that cannot start exits with an explanation; one that works never
      // prints the marker below, so this promise only ever settles by rejecting.
      const exited = process.waitForOutput(NEVER_PRINTED, this.startupTimeoutMs).then(() => NEVER_SETTLES);
      exited.catch(() => undefined);
      await Promise.race([connection.waitUntilReady(this.startupTimeoutMs), exited]);
      return { process, connection };
    } catch (error) {
      connection?.close();
      await process?.interrupt(SHUTDOWN_TIMEOUT_MS).catch(() => undefined);
      throw new UiBackendUnavailableError(
        'idb_companion',
        error instanceof SimulatorError || error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
  }
}

const NEVER_PRINTED = /\0 this text is never printed \0/;
const NEVER_SETTLES = new Promise<void>(() => undefined);

/** Asks the operating system for a TCP port nobody is using. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}
