// fflate's UTF-8 decoder: Hermes' TextDecoder support varies by version.
import { strFromU8 } from 'fflate';

/**
 * Just enough protobuf decoding for Anki's newer (schema 18 / .anki21b) exports:
 * note type config, template config and the media map. Unknown fields are kept
 * but ignored by callers.
 */
export type PbValue = number | Uint8Array;

export function decodeProtobuf(bytes: Uint8Array): Map<number, PbValue[]> {
  const out = new Map<number, PbValue[]>();
  let i = 0;
  const varint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (i >= bytes.length) throw new Error('Truncated protobuf');
      const b = bytes[i++];
      // Multiply rather than shift so values past 2^31 stay correct (up to 2^53).
      result += (b & 0x7f) * 2 ** shift;
      if ((b & 0x80) === 0) return result;
      shift += 7;
    }
  };
  while (i < bytes.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key & 7;
    let value: PbValue;
    if (wire === 0) value = varint();
    else if (wire === 2) {
      const len = varint();
      value = bytes.subarray(i, i + len);
      i += len;
    } else if (wire === 1) {
      i += 8;
      continue;
    } else if (wire === 5) {
      i += 4;
      continue;
    } else throw new Error(`Unsupported protobuf wire type ${wire}`);
    if (!out.has(field)) out.set(field, []);
    out.get(field)!.push(value);
  }
  return out;
}


export function pbString(msg: Map<number, PbValue[]>, field: number): string {
  const v = msg.get(field)?.[0];
  return v instanceof Uint8Array ? strFromU8(v) : '';
}

export function pbNumber(msg: Map<number, PbValue[]>, field: number): number {
  const v = msg.get(field)?.[0];
  return typeof v === 'number' ? v : 0;
}

export function pbMessages(msg: Map<number, PbValue[]>, field: number): Map<number, PbValue[]>[] {
  return (msg.get(field) ?? []).filter((v): v is Uint8Array => v instanceof Uint8Array).map(decodeProtobuf);
}
