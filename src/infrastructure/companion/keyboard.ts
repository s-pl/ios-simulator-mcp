/**
 * Translation of text into key presses of a US hardware keyboard, using USB
 * HID usage codes. This is what the idb command line does internally; the
 * companion itself only understands key codes.
 */

export const KEY_LEFT_SHIFT = 225;

/** A key to press, possibly while holding Shift. */
export interface KeyStroke {
  readonly keyCode: number;
  readonly shift: boolean;
}

/** Keys that produce a character on their own, and the one they produce with Shift. */
const SYMBOL_KEYS: readonly (readonly [keyCode: number, plain: string, shifted: string])[] = [
  [30, '1', '!'],
  [31, '2', '@'],
  [32, '3', '#'],
  [33, '4', '$'],
  [34, '5', '%'],
  [35, '6', '^'],
  [36, '7', '&'],
  [37, '8', '*'],
  [38, '9', '('],
  [39, '0', ')'],
  [45, '-', '_'],
  [46, '=', '+'],
  [47, '[', '{'],
  [48, ']', '}'],
  [49, '\\', '|'],
  [51, ';', ':'],
  [52, "'", '"'],
  [53, '`', '~'],
  [54, ',', '<'],
  [55, '.', '>'],
  [56, '/', '?'],
];

const KEY_A = 4;
const KEY_SPACE = 44;

const STROKES: ReadonlyMap<string, KeyStroke> = buildStrokes();

function buildStrokes(): Map<string, KeyStroke> {
  const strokes = new Map<string, KeyStroke>([[' ', { keyCode: KEY_SPACE, shift: false }]]);
  for (let index = 0; index < 26; index += 1) {
    const keyCode = KEY_A + index;
    strokes.set(String.fromCharCode(97 + index), { keyCode, shift: false });
    strokes.set(String.fromCharCode(65 + index), { keyCode, shift: true });
  }
  for (const [keyCode, plain, shifted] of SYMBOL_KEYS) {
    strokes.set(plain, { keyCode, shift: false });
    strokes.set(shifted, { keyCode, shift: true });
  }
  return strokes;
}

/** The key stroke that types a character, or `undefined` when the keyboard cannot produce it. */
export function keyStrokeFor(character: string): KeyStroke | undefined {
  return STROKES.get(character);
}
