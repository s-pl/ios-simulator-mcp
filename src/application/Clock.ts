/** Source of time, abstracted so waiting and expiry can be tested instantly. */
export interface Clock {
  /** Milliseconds since an arbitrary fixed origin. */
  now(): number;
  /** Resolves after the given number of milliseconds. */
  sleep(milliseconds: number): Promise<void>;
}

/** {@link Clock} backed by the real system time. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
