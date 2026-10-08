import { Client, credentials, type ServiceError } from '@grpc/grpc-js';

import { CommandFailedError } from '../../domain/errors.js';
import { readString } from './protobuf.js';

/** An open channel to the idb companion of one simulator. */
export interface CompanionConnection {
  /** Resolves once the companion accepts requests. */
  waitUntilReady(timeoutMs: number): Promise<void>;
  /** Plays a series of encoded `HIDEvent` messages in order. */
  sendHidEvents(events: readonly Uint8Array[]): Promise<void>;
  /** Sends an encoded `AccessibilityInfoRequest` and returns the JSON the companion answers with. */
  accessibilityInfo(request: Uint8Array): Promise<string>;
  close(): void;
}

/** Opens a connection to a companion listening at `address` (`host:port`). */
export type CompanionConnector = (address: string) => CompanionConnection;

const SERVICE = '/idb.CompanionService';
/** A request to the companion that takes longer than this is treated as stuck. */
const CALL_TIMEOUT_MS = 60_000;

const identity = (bytes: Uint8Array): Buffer => Buffer.from(bytes);

/**
 * {@link CompanionConnection} over gRPC.
 *
 * Messages are passed as already-encoded bytes, so no protocol definition has
 * to be loaded at runtime: the client only needs the method paths.
 */
export class GrpcCompanionConnection implements CompanionConnection {
  private readonly client: Client;

  constructor(address: string) {
    this.client = new Client(address, credentials.createInsecure());
  }

  waitUntilReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.waitForReady(Date.now() + timeoutMs, (error) => (error ? reject(error) : resolve()));
    });
  }

  sendHidEvents(events: readonly Uint8Array[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const call = this.client.makeClientStreamRequest<Uint8Array, Buffer>(
        `${SERVICE}/hid`,
        identity,
        identity,
        { deadline: Date.now() + CALL_TIMEOUT_MS },
        (error) => (error ? reject(toCommandError('hid', error)) : resolve()),
      );
      for (const event of events) {
        call.write(event);
      }
      call.end();
    });
  }

  accessibilityInfo(request: Uint8Array): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client.makeUnaryRequest<Uint8Array, Buffer>(
        `${SERVICE}/accessibility_info`,
        identity,
        identity,
        request,
        { deadline: Date.now() + CALL_TIMEOUT_MS },
        (error, response) => {
          if (error) {
            reject(toCommandError('accessibility_info', error));
          } else {
            resolve(readString(response ?? Buffer.alloc(0), 1));
          }
        },
      );
    });
  }

  close(): void {
    this.client.close();
  }
}

/**
 * Presents a failed request like a failed command, which is what it is to the
 * rest of the server: the same retries and hints apply as with the idb CLI.
 */
function toCommandError(method: string, error: ServiceError): CommandFailedError {
  return new CommandFailedError(`idb_companion ${method}`, error.code, error.details || error.message, {
    cause: error,
  });
}
