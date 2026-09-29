import { decodeProtobuf, pbNumber, pbString } from './protobuf';

/** Minimal async SQL reader, satisfied by expo-sqlite (and by node:sqlite in tests). */
export interface SqlReader {
  getAllAsync<T>(sql: string, ...params: (string | number)[]): Promise<T[]>;
}

export interface AnkiNotetype {
  ankiId: number;
  name: string;
  isCloze: boolean;
  css: string;
  fields: string[];
  templates: { name: string; qfmt: string; afmt: string }[];
}

export interface AnkiDeck {
  ankiId: number;
  /** Full path with "::" between levels, as Anki shows it. */
  name: string;
}

export interface AnkiNote {
  ankiId: number;
  guid: string;
  notetypeId: number;
  fields: string[];
  tags: string;
}

export interface AnkiCardRow {
  id: number;
  nid: number;
  did: number;
  ord: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  odue: number;
  odid: number;
  data: string;
}

export interface AnkiRevlogRow {
  id: number;
  cid: number;
  ease: number;
  ivl: number;
  time: number;
  type: number;
}

export interface AnkiCollection {
  /** Collection creation time (unix seconds): review due dates count days from here. */
  crt: number;
  notetypes: AnkiNotetype[];
  decks: AnkiDeck[];
  notes: AnkiNote[];
  cards: AnkiCardRow[];
  revlog: AnkiRevlogRow[];
}

const FIELD_SEP = '\x1f';

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function hasTable(db: SqlReader, name: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name);
  return rows.length > 0;
}

interface LegacyModel {
  id: number | string;
  name: string;
  type?: number;
  css?: string;
  flds: { name: string; ord: number }[];
  tmpls: { name: string; ord: number; qfmt: string; afmt: string }[];
}

/** Anki ≤ 2.1.49 layout (schema 11): note types and decks are JSON in the `col` row. */
async function readLegacyMeta(db: SqlReader): Promise<{ notetypes: AnkiNotetype[]; decks: AnkiDeck[] }> {
  const [col] = await db.getAllAsync<{ models: string; decks: string }>('SELECT models, decks FROM col');
  const models = JSON.parse(col.models || '{}') as Record<string, LegacyModel>;
  const decks = JSON.parse(col.decks || '{}') as Record<string, { id: number | string; name: string }>;
  return {
    notetypes: Object.values(models).map((m) => ({
      ankiId: Number(m.id),
      name: m.name,
      isCloze: m.type === 1,
      css: m.css ?? '',
      fields: [...m.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name),
      templates: [...m.tmpls].sort((a, b) => a.ord - b.ord).map((t) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt })),
    })),
    decks: Object.values(decks).map((d) => ({ ankiId: Number(d.id), name: d.name })),
  };
}

/** Anki ≥ 2.1.50 layout (schema 18): separate tables with protobuf config blobs. */
async function readModernMeta(db: SqlReader): Promise<{ notetypes: AnkiNotetype[]; decks: AnkiDeck[] }> {
  const [nts, fields, tmpls, decks] = await Promise.all([
    // Blobs are read as hex: some SQLite bindings hand back views into a reused buffer.
    db.getAllAsync<{ id: number; name: string; config: string }>('SELECT id, name, hex(config) AS config FROM notetypes'),
    db.getAllAsync<{ ntid: number; ord: number; name: string }>('SELECT ntid, ord, name FROM fields ORDER BY ntid, ord'),
    db.getAllAsync<{ ntid: number; ord: number; name: string; config: string }>('SELECT ntid, ord, name, hex(config) AS config FROM templates ORDER BY ntid, ord'),
    db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM decks'),
  ]);
  return {
    notetypes: nts.map((nt) => {
      // Notetype.Config: kind = 1 (0 normal, 1 cloze), css = 3
      const cfg = decodeProtobuf(fromHex(nt.config));
      return {
        ankiId: nt.id,
        name: nt.name,
        isCloze: pbNumber(cfg, 1) === 1,
        css: pbString(cfg, 3),
        fields: fields.filter((f) => f.ntid === nt.id).map((f) => f.name),
        templates: tmpls
          .filter((t) => t.ntid === nt.id)
          .map((t) => {
            // Template.Config: q_format = 1, a_format = 2
            const tc = decodeProtobuf(fromHex(t.config));
            return { name: t.name, qfmt: pbString(tc, 1), afmt: pbString(tc, 2) };
          }),
      };
    }),
    decks: decks.map((d) => ({ ankiId: d.id, name: d.name.split(FIELD_SEP).join('::') })),
  };
}

/** Read everything the importer needs from an Anki collection database. */
export async function readCollection(db: SqlReader): Promise<AnkiCollection> {
  const [col] = await db.getAllAsync<{ crt: number }>('SELECT crt FROM col');
  const meta = (await hasTable(db, 'notetypes')) ? await readModernMeta(db) : await readLegacyMeta(db);
  const [notes, cards, revlog] = await Promise.all([
    db.getAllAsync<{ id: number; guid: string; mid: number; flds: string; tags: string }>('SELECT id, guid, mid, flds, tags FROM notes'),
    db.getAllAsync<AnkiCardRow>('SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, odue, odid, data FROM cards'),
    db.getAllAsync<AnkiRevlogRow>('SELECT id, cid, ease, ivl, time, type FROM revlog ORDER BY id'),
  ]);
  return {
    crt: col?.crt ?? 0,
    ...meta,
    notes: notes.map((n) => ({ ankiId: n.id, guid: n.guid, notetypeId: n.mid, fields: n.flds.split(FIELD_SEP), tags: n.tags.trim() })),
    cards: cards.map((c) => ({ ...c, data: c.data ?? '' })),
    revlog,
  };
}
