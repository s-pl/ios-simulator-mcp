/** Selection of the log entries to read. */
export interface LogQuery {
  /** How far back to look, in minutes. */
  readonly minutes: number;
  /** NSPredicate used to filter entries, in `log show --predicate` syntax. */
  readonly predicate?: string;
}

/** Read access to the unified system log of a booted simulator. */
export interface LogGateway {
  /** Log lines matching the query, oldest first. */
  readRecent(udid: string, query: LogQuery): Promise<string[]>;
}
