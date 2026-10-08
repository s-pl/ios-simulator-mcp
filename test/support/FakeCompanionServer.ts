import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadPackageDefinition,
  Server,
  ServerCredentials,
  status,
  type ServerReadableStream,
  type ServerUnaryCall,
  type sendUnaryData,
  type ServiceDefinition,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

const PROTO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'proto', 'idb.proto');

/** A `HIDEvent` as decoded by the official protocol definition. */
export type DecodedHidEvent = Record<string, unknown>;

interface AccessibilityRequest {
  readonly point: { x: number; y: number } | null;
  readonly format: string;
}

/**
 * A real gRPC server that speaks the idb companion protocol, built from the
 * official `idb.proto`. It decodes whatever the server under test sends, so a
 * mistake in the hand-written encoding shows up as a wrong decoded message.
 */
export class FakeCompanionServer {
  /** One entry per `hid` call: the events it carried, in order. */
  readonly hidCalls: DecodedHidEvent[][] = [];
  readonly accessibilityRequests: AccessibilityRequest[] = [];
  /** JSON returned by `accessibility_info`. */
  screenJson = '[]';
  /** Makes the next requests fail with this message. */
  failure: string | undefined;
  port = 0;
  private readonly server = new Server();

  async start(): Promise<this> {
    const definition = loadSync(PROTO, { keepCase: true, longs: Number, enums: String, defaults: true, oneofs: true });
    const idb = loadPackageDefinition(definition)['idb'] as unknown as {
      CompanionService: { service: ServiceDefinition };
    };

    this.server.addService(idb.CompanionService.service, {
      hid: (call: ServerReadableStream<DecodedHidEvent, object>, callback: sendUnaryData<object>) => {
        const events: DecodedHidEvent[] = [];
        call.on('data', (event: DecodedHidEvent) => events.push(event));
        call.on('end', () => {
          if (this.failure) {
            callback({ code: status.INTERNAL, details: this.failure });
            return;
          }
          this.hidCalls.push(events);
          callback(null, {});
        });
      },
      accessibility_info: (
        call: ServerUnaryCall<AccessibilityRequest, { json: string }>,
        callback: sendUnaryData<{ json: string }>,
      ) => {
        if (this.failure) {
          callback({ code: status.INTERNAL, details: this.failure });
          return;
        }
        this.accessibilityRequests.push(call.request);
        callback(null, { json: this.screenJson });
      },
    });

    this.port = await new Promise<number>((resolve, reject) => {
      this.server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, port) =>
        error ? reject(error) : resolve(port),
      );
    });
    return this;
  }

  /** Every event received, flattened across calls. */
  get events(): DecodedHidEvent[] {
    return this.hidCalls.flat();
  }

  stop(): void {
    this.server.forceShutdown();
  }
}

/** Shorthand for the decoded form of a press event. */
export function decodedPress(action: Record<string, unknown>, direction: 'DOWN' | 'UP'): DecodedHidEvent {
  const [kind] = Object.keys(action);
  return { press: { action: { ...action, action: kind }, direction }, event: 'press' };
}
