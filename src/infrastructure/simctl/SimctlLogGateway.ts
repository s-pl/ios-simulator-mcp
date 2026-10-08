import type { LogGateway, LogQuery } from '../../domain/ports/LogGateway.js';
import type { SimulatorHost } from '../host/SimulatorHost.js';

/**
 * {@link LogGateway} that runs the simulator's own `log show` through
 * `xcrun simctl spawn`.
 */
export class SimctlLogGateway implements LogGateway {
  constructor(private readonly host: SimulatorHost) {}

  async readRecent(udid: string, query: LogQuery): Promise<string[]> {
    const filter = query.predicate ? ['--predicate', query.predicate] : [];
    const { stdout } = await this.host.simctl([
      'spawn',
      udid,
      'log',
      'show',
      '--style',
      'compact',
      '--last',
      `${query.minutes}m`,
      ...filter,
    ]);
    return parseLogLines(stdout);
  }
}

/** Splits `log show` output into entries, dropping the column header and blank lines. */
export function parseLogLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .filter((line) => !line.startsWith('Timestamp'));
}
