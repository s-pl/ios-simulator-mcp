import { describe, expect, it } from 'vitest';

import { ElementQuery } from '../../src/domain/ElementQuery.js';
import { AmbiguousElementError, InvalidArgumentError } from '../../src/domain/errors.js';
import { element } from '../support/elements.js';

const signIn = element('Button', 'Sign in', [20, 700, 350, 50], { identifier: 'login.submit' });
const signInWithApple = element('Button', 'Sign in with Apple', [20, 760, 350, 50]);
const email = element('TextField', 'Email', [20, 280, 350, 40], { value: 'ana@example.com' });
const title = element('StaticText', 'Welcome', [20, 100, 350, 40]);
const screen = [title, email, signIn, signInWithApple];

describe('ElementQuery', () => {
  describe('construction', () => {
    it('requires at least one criterion', () => {
      expect(() => new ElementQuery({})).toThrow(InvalidArgumentError);
      expect(() => new ElementQuery({ label: '   ' })).toThrow(InvalidArgumentError);
    });

    it('accepts an index only together with a criterion', () => {
      expect(() => new ElementQuery({ index: 0 })).toThrow(InvalidArgumentError);
    });

    it.each([-1, 1.5, Number.NaN])('rejects the index %s', (index) => {
      expect(() => new ElementQuery({ label: 'x', index })).toThrow(InvalidArgumentError);
    });
  });

  describe('matching by label', () => {
    it('ignores case and surrounding spaces', () => {
      expect(new ElementQuery({ label: '  WELCOME ' }).select(screen)).toBe(title);
    });

    it('prefers an exact match over a partial one', () => {
      expect(new ElementQuery({ label: 'sign in' }).select(screen)).toBe(signIn);
    });

    it('falls back to a partial match', () => {
      expect(new ElementQuery({ label: 'with apple' }).select(screen)).toBe(signInWithApple);
    });

    it('also looks at the value of the element', () => {
      expect(new ElementQuery({ label: 'ana@example.com' }).select(screen)).toBe(email);
    });

    it('returns undefined when nothing matches', () => {
      expect(new ElementQuery({ label: 'Register' }).select(screen)).toBeUndefined();
      expect(new ElementQuery({ label: 'Register' }).select([])).toBeUndefined();
    });
  });

  describe('matching by identifier and type', () => {
    it('matches the identifier exactly', () => {
      expect(new ElementQuery({ identifier: 'login.submit' }).select(screen)).toBe(signIn);
      expect(new ElementQuery({ identifier: 'login' }).select(screen)).toBeUndefined();
    });

    it('matches the type ignoring case', () => {
      expect(new ElementQuery({ type: 'textfield' }).select(screen)).toBe(email);
    });

    it('combines criteria with AND', () => {
      expect(new ElementQuery({ label: 'sign', type: 'StaticText' }).select(screen)).toBeUndefined();
      expect(new ElementQuery({ label: 'Email', type: 'TextField' }).select(screen)).toBe(email);
    });
  });

  describe('several matches', () => {
    it('fails listing the candidates when no index is given', () => {
      const query = new ElementQuery({ type: 'Button' });
      expect(() => query.select(screen)).toThrow(AmbiguousElementError);
      expect(() => query.select(screen)).toThrow(/0: Button "Sign in".*\n1: Button "Sign in with Apple"/s);
    });

    it('uses the index to choose', () => {
      expect(new ElementQuery({ type: 'Button', index: 1 }).select(screen)).toBe(signInWithApple);
    });

    it('treats an index beyond the matches as not found', () => {
      expect(new ElementQuery({ type: 'Button', index: 5 }).select(screen)).toBeUndefined();
    });
  });

  describe('nested elements with the same text', () => {
    const cell = element('Cell', 'General', [0, 300, 390, 44]);
    const cellLabel = element('StaticText', 'General', [16, 310, 200, 24]);
    const otherCell = element('Cell', 'General', [0, 500, 390, 44]);

    it('collapses a container and the label inside it into one target', () => {
      const query = new ElementQuery({ label: 'General' });
      expect(query.matches([cell, cellLabel])).toEqual([cellLabel]);
      expect(query.select([cell, cellLabel])).toBe(cellLabel);
    });

    it('keeps one of two elements that share the very same frame', () => {
      const twin = element('Button', 'General', [0, 300, 390, 44]);
      expect(new ElementQuery({ label: 'General' }).matches([cell, twin])).toEqual([cell]);
    });

    it('still reports elements in different places as ambiguous', () => {
      expect(() => new ElementQuery({ label: 'General' }).select([cell, cellLabel, otherCell])).toThrow(
        AmbiguousElementError,
      );
    });
  });

  it('describes itself for error messages', () => {
    expect(new ElementQuery({ label: 'Sign In', type: 'Button', index: 2 }).describe()).toBe(
      'label "sign in", type "button", index 2',
    );
    expect(new ElementQuery({ identifier: 'login.submit' }).describe()).toBe('identifier "login.submit"');
  });
});
