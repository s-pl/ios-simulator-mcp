import { AmbiguousElementError, InvalidArgumentError } from './errors.js';
import { describeElement, type UiElement } from './ui.js';

/** What a client can say about the element it is looking for. */
export interface ElementCriteria {
  /**
   * Visible text of the element (its accessibility label or value),
   * case-insensitive. An exact match wins over a partial one.
   */
  readonly label?: string;
  /** Exact `accessibilityIdentifier`. */
  readonly identifier?: string;
  /** Accessibility type, e.g. `Button` (case-insensitive). */
  readonly type?: string;
  /** Which match to use, starting at 0, when several elements qualify. */
  readonly index?: number;
}

/**
 * Locates one element among those on screen.
 *
 * The query is deliberately forgiving so that a client can act on what it
 * reads without first asking for coordinates: text is matched ignoring case,
 * exact matches are preferred over partial ones, and elements nested inside
 * each other (a cell and the label it contains) count as a single target.
 */
export class ElementQuery {
  private readonly label: string | undefined;
  private readonly identifier: string | undefined;
  private readonly type: string | undefined;
  private readonly index: number | undefined;

  constructor(criteria: ElementCriteria) {
    this.label = criteria.label?.trim().toLowerCase() || undefined;
    this.identifier = criteria.identifier?.trim() || undefined;
    this.type = criteria.type?.trim().toLowerCase() || undefined;
    this.index = criteria.index;

    if (!this.label && !this.identifier && !this.type) {
      throw new InvalidArgumentError('Describe the element with at least one of: label, identifier, type.');
    }
    if (this.index !== undefined && (!Number.isInteger(this.index) || this.index < 0)) {
      throw new InvalidArgumentError(`Invalid element index ${this.index}: it must be a non-negative integer.`);
    }
  }

  /** Every distinct element that satisfies the query, in screen order. */
  matches(elements: readonly UiElement[]): UiElement[] {
    const candidates = elements.filter(
      (element) =>
        (!this.identifier || element.identifier === this.identifier) &&
        (!this.type || element.type.toLowerCase() === this.type),
    );
    return withoutEnclosingDuplicates(this.label ? matchText(candidates, this.label) : candidates);
  }

  /**
   * The element the query designates, or `undefined` when nothing matches
   * (yet).
   * @throws AmbiguousElementError when several elements match and no index was given.
   */
  select(elements: readonly UiElement[]): UiElement | undefined {
    const matches = this.matches(elements);
    if (this.index !== undefined) {
      return matches[this.index];
    }
    if (matches.length > 1) {
      throw new AmbiguousElementError(this.describe(), matches.map(describeElement));
    }
    return matches[0];
  }

  /** Human readable form of the query, for messages. */
  describe(): string {
    return [
      this.label ? `label "${this.label}"` : '',
      this.identifier ? `identifier "${this.identifier}"` : '',
      this.type ? `type "${this.type}"` : '',
      this.index !== undefined ? `index ${this.index}` : '',
    ]
      .filter(Boolean)
      .join(', ');
  }
}

/** Elements whose label or value equals the text; failing that, those containing it. */
function matchText(elements: readonly UiElement[], text: string): UiElement[] {
  const texts = (element: UiElement): string[] =>
    [element.label, element.value].flatMap((value) => (value ? [value.trim().toLowerCase()] : []));

  const exact = elements.filter((element) => texts(element).includes(text));
  return exact.length > 0
    ? exact
    : elements.filter((element) => texts(element).some((value) => value.includes(text)));
}

/**
 * Drops matches that merely wrap another match (tapping either hits the same
 * spot), keeping the innermost one.
 */
function withoutEnclosingDuplicates(elements: readonly UiElement[]): UiElement[] {
  return elements.filter(
    (outer) =>
      !elements.some(
        (inner) =>
          inner !== outer &&
          outer.frame.contains(inner.frame.center) &&
          (inner.frame.area < outer.frame.area ||
            // Identical frames: keep only the first of them.
            (inner.frame.area === outer.frame.area && elements.indexOf(inner) < elements.indexOf(outer))),
      ),
  );
}
