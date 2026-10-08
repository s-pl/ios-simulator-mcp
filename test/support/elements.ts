import { Rect } from '../../src/domain/geometry.js';
import type { UiElement } from '../../src/domain/ui.js';

/** Builds a domain element; the frame is `[x, y, width, height]`. */
export function element(
  type: string,
  label: string | undefined,
  frame: readonly [number, number, number, number] = [0, 0, 100, 40],
  extra: Partial<Pick<UiElement, 'value' | 'identifier' | 'enabled'>> = {},
): UiElement {
  return {
    type,
    label,
    value: extra.value,
    identifier: extra.identifier,
    enabled: extra.enabled ?? true,
    frame: new Rect(...frame),
  };
}

/** The same element as `idb ui describe-all` would print it. */
export function idbNode(
  type: string,
  label: string | null,
  frame: readonly [number, number, number, number] = [0, 0, 100, 40],
  extra: { value?: string; identifier?: string; enabled?: boolean } = {},
): Record<string, unknown> {
  const [x, y, width, height] = frame;
  return {
    type,
    AXLabel: label,
    AXValue: extra.value ?? null,
    AXUniqueId: extra.identifier ?? null,
    enabled: extra.enabled ?? true,
    frame: { x, y, width, height },
  };
}

/** A login screen as idb would describe it, used across the UI tests. */
export const LOGIN_SCREEN = [
  idbNode('Application', null, [0, 0, 390, 844]),
  idbNode('StaticText', 'Welcome', [20, 100, 350, 40]),
  idbNode('TextField', 'Email', [20, 280, 350, 40], { identifier: 'login.email' }),
  idbNode('SecureTextField', 'Password', [20, 340, 350, 40], { identifier: 'login.password' }),
  idbNode('Button', 'Sign in', [20, 700, 350, 50], { identifier: 'login.submit' }),
];

export const HOME_SCREEN = [
  idbNode('Application', null, [0, 0, 390, 844]),
  idbNode('StaticText', 'Dashboard', [20, 100, 350, 40]),
  idbNode('Button', 'Log out', [20, 700, 350, 50]),
];
