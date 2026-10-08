import type { LogGateway } from '../domain/ports/LogGateway.js';
import type { DeviceResolver } from './DeviceResolver.js';
import type { OnDevice } from './OnDevice.js';

export interface LogRequest {
  /** How far back to look, in minutes. Defaults to 1. */
  readonly minutes?: number;
  /** Only entries emitted by this process (usually the app's executable name). */
  readonly processName?: string;
  /** Only entries whose message contains this text. */
  readonly messageContains?: string;
  /** Raw NSPredicate, combined with the other filters using AND. */
  readonly predicate?: string;
  /** Maximum number of lines returned (the most recent ones). Defaults to 200. */
  readonly maxLines?: number;
}

/** Log lines read from a device. */
export interface LogExcerpt {
  readonly lines: readonly string[];
  /** Number of older lines dropped to honour `maxLines`. */
  readonly omitted: number;
}

const DEFAULT_MINUTES = 1;
const DEFAULT_MAX_LINES = 200;

/** Use cases to inspect the system log of a booted simulator. */
export class LogService {
  constructor(
    private readonly logs: LogGateway,
    private readonly resolver: DeviceResolver,
  ) {}

  async readRecent(request: LogRequest = {}, reference?: string): Promise<OnDevice<LogExcerpt>> {
    const device = await this.resolver.resolveBooted(reference);
    const lines = await this.logs.readRecent(device.udid, {
      minutes: request.minutes ?? DEFAULT_MINUTES,
      predicate: buildPredicate(request),
    });
    const maxLines = request.maxLines ?? DEFAULT_MAX_LINES;
    const kept = lines.slice(-maxLines);
    return { device, value: { lines: kept, omitted: lines.length - kept.length } };
  }
}

/** Combines the request filters into a single NSPredicate, if any applies. */
function buildPredicate(request: LogRequest): string | undefined {
  const clauses: string[] = [];
  if (request.processName) {
    clauses.push(`process == ${quote(request.processName)}`);
  }
  if (request.messageContains) {
    clauses.push(`eventMessage CONTAINS[c] ${quote(request.messageContains)}`);
  }
  if (request.predicate?.trim()) {
    clauses.push(`(${request.predicate.trim()})`);
  }
  return clauses.length > 0 ? clauses.join(' AND ') : undefined;
}

/** Quotes a value as an NSPredicate string literal. */
function quote(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
