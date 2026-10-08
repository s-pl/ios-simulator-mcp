import type { Clock } from '../../src/application/Clock.js';

/** A clock that only moves when told to: sleeping advances it instantly. */
export class FakeClock implements Clock {
  /** Every sleep requested, in milliseconds. */
  readonly sleeps: number[] = [];
  private time = 0;

  now(): number {
    return this.time;
  }

  async sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds);
    this.time += milliseconds;
  }

  advance(milliseconds: number): void {
    this.time += milliseconds;
  }
}
