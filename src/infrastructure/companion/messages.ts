import type { Point } from '../../domain/geometry.js';
import type { HardwareButton } from '../../domain/ui.js';
import { ProtoWriter } from './protobuf.js';

/**
 * The messages of the idb companion protocol (`idb.proto`, package `idb`)
 * that the server sends, as builders that return their encoded bytes.
 * Field numbers are those of the protocol definition.
 */

/** Values of `HIDEvent.HIDButtonType`. */
const BUTTON_CODES: Record<HardwareButton, number> = {
  APPLE_PAY: 0,
  HOME: 1,
  LOCK: 2,
  SIDE_BUTTON: 3,
  SIRI: 4,
};

const DIRECTION_DOWN = 0;
const DIRECTION_UP = 1;

/** What a press acts upon: a point of the screen, a hardware button or a keyboard key. */
export type PressTarget =
  { readonly touch: Point } | { readonly button: HardwareButton } | { readonly keyCode: number };

function point(value: Point): ProtoWriter {
  return new ProtoWriter().double(1, value.x).double(2, value.y);
}

/** `HIDEvent.HIDPressAction`: field 1 touch, 2 button, 3 key. */
function pressAction(target: PressTarget): ProtoWriter {
  if ('touch' in target) {
    return new ProtoWriter().message(1, new ProtoWriter().message(1, point(target.touch)));
  }
  if ('button' in target) {
    return new ProtoWriter().message(2, new ProtoWriter().varint(1, BUTTON_CODES[target.button]));
  }
  return new ProtoWriter().message(3, new ProtoWriter().varint(1, target.keyCode));
}

/** `HIDEvent { press { action, direction } }`. */
function press(target: PressTarget, direction: number): Buffer {
  const body = new ProtoWriter().message(1, pressAction(target)).varint(2, direction);
  return new ProtoWriter().message(1, body).finish();
}

export function pressDown(target: PressTarget): Buffer {
  return press(target, DIRECTION_DOWN);
}

export function pressUp(target: PressTarget): Buffer {
  return press(target, DIRECTION_UP);
}

/** `HIDEvent { delay { duration } }`: a pause between two events, in seconds. */
export function delay(seconds: number): Buffer {
  return new ProtoWriter().message(3, new ProtoWriter().double(1, seconds)).finish();
}

/** `HIDEvent { swipe { start, end, delta, duration } }`. */
export function swipe(from: Point, to: Point, stepSize: number, durationSeconds: number): Buffer {
  const body = new ProtoWriter()
    .message(1, point(from))
    .message(2, point(to))
    .double(5, stepSize)
    .double(6, durationSeconds);
  return new ProtoWriter().message(2, body).finish();
}

/**
 * `AccessibilityInfoRequest`: the whole screen, or the element at a point,
 * in the flat ("legacy") format the idb command line prints.
 */
export function accessibilityInfoRequest(at?: Point): Buffer {
  const request = new ProtoWriter();
  if (at) {
    request.message(2, point(at));
  }
  return request.finish();
}
