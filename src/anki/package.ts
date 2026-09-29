import { strFromU8, Unzip, UnzipInflate, type UnzipFile } from 'fflate';
import { decompress } from 'fzstd';
import { decodeProtobuf, pbNumber, pbString } from './protobuf';

/**
 * .apkg / .colpkg unpacking. A package is a zip holding:
 * - the collection: collection.anki21b (zstd-compressed, Anki ≥ 2.1.50 default),
 *   collection.anki21 (plain SQLite) or collection.anki2 (oldest; a placeholder when a newer one exists)
 * - media files named 0, 1, 2… (zstd-compressed in the newest format)
 * - `media`: the map from those numbers to real file names (JSON, or zstd'd protobuf)
 */

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

export function isZstd(b: Uint8Array): boolean {
  return b.length >= 4 && ZSTD_MAGIC.every((m, i) => b[i] === m);
}

export function maybeZstd(b: Uint8Array): Uint8Array {
  return isZstd(b) ? decompress(b) : b;
}

/** Media map: zip entry name ("0", "1", …) → real file name. */
export function decodeMediaMap(raw: Uint8Array): Map<string, string> {
  const bytes = maybeZstd(raw);
  const out = new Map<string, string>();
  if (bytes.length === 0) return out;
  if (bytes[0] === 0x7b /* { */) {
    const json = JSON.parse(strFromU8(bytes)) as Record<string, string>;
    for (const [k, v] of Object.entries(json)) out.set(k, v);
    return out;
  }
  // MediaEntries { repeated MediaEntry entries = 1 }
  // MediaEntry { string name = 1; uint32 size = 2; bytes sha1 = 3; optional uint32 legacy_zip_filename = 255 }
  const top = decodeProtobuf(bytes);
  (top.get(1) ?? []).forEach((entry, index) => {
    if (!(entry instanceof Uint8Array)) return;
    const e = decodeProtobuf(entry);
    const legacy = e.has(255) ? pbNumber(e, 255) : index;
    out.set(String(legacy), pbString(e, 1));
  });
  return out;
}

/** A safe file name for the media folder (no path separators or leading dots). */
export function safeMediaName(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/^\.+/, '_').slice(0, 200);
}

export const COLLECTION_NAMES = ['collection.anki21b', 'collection.anki21', 'collection.anki2'] as const;

export interface PackageSink {
  /** A complete entry (already zstd-decompressed). Media entries are named by their number. */
  entry(name: string, bytes: Uint8Array): void | Promise<void>;
}

export interface UnpackResult {
  /** The best collection entry found. */
  collection: (typeof COLLECTION_NAMES)[number];
  mediaMap: Map<string, string>;
}

/**
 * Stream a package through fflate, handing each finished entry to `sink`.
 * `read(n)` returns the next chunk (empty when done). Yields to the event loop between
 * chunks so the UI can show progress on big decks.
 */
export async function unpackPackage(
  read: (n: number) => Uint8Array,
  totalBytes: number,
  sink: PackageSink,
  onProgress?: (fraction: number) => void,
): Promise<UnpackResult> {
  const CHUNK = 1 << 20;
  const found = new Set<string>();
  let mediaMapBytes = null as Uint8Array | null;
  const pending: Promise<void>[] = [];
  let error: unknown = null;

  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file: UnzipFile) => {
    const parts: Uint8Array[] = [];
    let size = 0;
    file.ondata = (err, data, final) => {
      if (err) {
        error = err;
        return;
      }
      parts.push(data);
      size += data.length;
      if (!final) return;
      const whole = new Uint8Array(size);
      let off = 0;
      for (const p of parts) {
        whole.set(p, off);
        off += p.length;
      }
      const name = file.name;
      if (name === 'media') {
        mediaMapBytes = whole;
        return;
      }
      if (name === 'meta') return;
      try {
        const bytes = maybeZstd(whole);
        if ((COLLECTION_NAMES as readonly string[]).includes(name)) found.add(name);
        const r = sink.entry(name, bytes);
        if (r) pending.push(r);
      } catch (e) {
        error = e;
      }
    };
    file.start();
  };

  let done = 0;
  for (;;) {
    const chunk = read(CHUNK);
    const last = chunk.length === 0 || done + chunk.length >= totalBytes;
    unzip.push(chunk, last);
    if (error) throw error instanceof Error ? error : new Error(String(error));
    done += chunk.length;
    onProgress?.(totalBytes ? Math.min(1, done / totalBytes) : 0);
    if (last) break;
    await new Promise((r) => setTimeout(r, 0));
  }
  await Promise.all(pending);

  const collection = COLLECTION_NAMES.find((n) => found.has(n));
  if (!collection) throw new Error('This file doesn’t contain an Anki collection. Export from Anki as “Anki Deck Package (*.apkg)”.');
  return { collection, mediaMap: mediaMapBytes ? decodeMediaMap(mediaMapBytes) : new Map() };
}
