/**
 * A minimal Protocol Buffers encoder and decoder.
 *
 * The companion protocol uses a handful of small messages, so they are encoded
 * by hand instead of shipping a `.proto` file and a code generator. The tests
 * decode these bytes with the official definition to prove they are right.
 */

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_FIXED32 = 5;

/** Builds the bytes of one message, field by field. */
export class ProtoWriter {
  private readonly chunks: Buffer[] = [];

  /** An unsigned integer or enum value. Zero is the default and is not written. */
  varint(field: number, value: number): this {
    if (value !== 0) {
      this.chunks.push(encodeVarint(tag(field, WIRE_VARINT)), encodeVarint(value));
    }
    return this;
  }

  /** A 64-bit floating point number. Zero is the default and is not written. */
  double(field: number, value: number): this {
    if (value !== 0) {
      const bytes = Buffer.alloc(8);
      bytes.writeDoubleLE(value);
      this.chunks.push(encodeVarint(tag(field, WIRE_FIXED64)), bytes);
    }
    return this;
  }

  /** A nested message. It is written even when empty: its presence selects a `oneof` case. */
  message(field: number, body: ProtoWriter): this {
    const bytes = body.finish();
    this.chunks.push(encodeVarint(tag(field, WIRE_LENGTH_DELIMITED)), encodeVarint(bytes.length), bytes);
    return this;
  }

  finish(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

/** Reads a string field of a message, or an empty string when it is absent. */
export function readString(message: Uint8Array, field: number): string {
  const bytes = Buffer.from(message.buffer, message.byteOffset, message.byteLength);
  let offset = 0;
  while (offset < bytes.length) {
    const key = decodeVarint(bytes, offset);
    offset = key.next;
    const wireType = key.value & 0x7;
    const number = Math.floor(key.value / 8);

    if (wireType === WIRE_LENGTH_DELIMITED) {
      const length = decodeVarint(bytes, offset);
      const end = length.next + length.value;
      if (number === field) {
        return bytes.toString('utf8', length.next, end);
      }
      offset = end;
    } else if (wireType === WIRE_VARINT) {
      offset = decodeVarint(bytes, offset).next;
    } else if (wireType === WIRE_FIXED64) {
      offset += 8;
    } else if (wireType === WIRE_FIXED32) {
      offset += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
  }
  return '';
}

function tag(field: number, wireType: number): number {
  return field * 8 + wireType;
}

function encodeVarint(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Cannot encode ${value} as a protobuf varint`);
  }
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest % 0x80) + 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return Buffer.from(bytes);
}

function decodeVarint(bytes: Buffer, start: number): { value: number; next: number } {
  let value = 0;
  let scale = 1;
  let offset = start;
  for (;;) {
    const byte = bytes[offset];
    if (byte === undefined) {
      throw new Error('Truncated protobuf message');
    }
    offset += 1;
    value += (byte & 0x7f) * scale;
    if (byte < 0x80) {
      return { value, next: offset };
    }
    scale *= 0x80;
  }
}
