import { InvalidArgumentError } from './errors.js';

/**
 * A location on the simulator screen, expressed in **points** (the logical
 * coordinate space used by UIKit), not in screenshot pixels.
 */
export class Point {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
      throw new InvalidArgumentError(`Invalid screen coordinates (${x}, ${y}): both must be finite and non-negative.`);
    }
  }

  /** Same point snapped to whole points, as required by the automation tooling. */
  rounded(): Point {
    return new Point(Math.round(this.x), Math.round(this.y));
  }

  toString(): string {
    return `(${this.x}, ${this.y})`;
  }
}

/** An axis-aligned rectangle in points. */
export class Rect {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly width: number,
    readonly height: number,
  ) {}

  /** Middle of the rectangle: the natural place to tap an element. */
  get center(): Point {
    return new Point(
      Math.max(0, this.x + this.width / 2),
      Math.max(0, this.y + this.height / 2),
    );
  }
}
