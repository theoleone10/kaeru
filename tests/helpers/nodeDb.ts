/// <reference types="node" />
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * A tiny expo-sqlite look-alike over Node's built-in SQLite (node ≥ 22), so the real
 * migrations, importer and queries can run in Jest. Only the methods the app uses.
 */
// process.getBuiltinModule bypasses Jest's module registry, which doesn't know node:sqlite.
const { DatabaseSync } = (process as unknown as { getBuiltinModule: (id: string) => typeof import('node:sqlite') }).getBuiltinModule('node:sqlite');

type Param = string | number | null | Uint8Array | boolean;

function flat(params: unknown[]): Param[] {
  const p = params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;
  return p.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : (v as Param)));
}

function num(v: number | bigint): number {
  return typeof v === 'bigint' ? Number(v) : v;
}

export function openNodeDb(path = ':memory:'): SQLiteDatabase {
  const db = new DatabaseSync(path);
  // Plain objects without a prototype confuse toEqual; normalise rows.
  const rows = (r: unknown[]) => r.map((x) => ({ ...(x as object) }));
  const api = {
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async runAsync(sql: string, ...params: unknown[]) {
      const res = db.prepare(sql).run(...(flat(params) as never[]));
      return { lastInsertRowId: num(res.lastInsertRowid), changes: num(res.changes) };
    },
    async getAllAsync(sql: string, ...params: unknown[]) {
      return rows(db.prepare(sql).all(...(flat(params) as never[])));
    },
    async getFirstAsync(sql: string, ...params: unknown[]) {
      const r = db.prepare(sql).get(...(flat(params) as never[]));
      return r ? { ...(r as object) } : null;
    },
    async prepareAsync(sql: string) {
      const stmt = db.prepare(sql);
      return {
        async executeAsync(...params: unknown[]) {
          const res = stmt.run(...(flat(params) as never[]));
          return { lastInsertRowId: num(res.lastInsertRowid), changes: num(res.changes) };
        },
        async finalizeAsync() {},
      };
    },
    async withTransactionAsync(task: () => Promise<void>) {
      await api.withExclusiveTransactionAsync(async () => task());
    },
    async withExclusiveTransactionAsync(task: (txn: unknown) => Promise<void>) {
      db.exec('BEGIN');
      try {
        await task(api);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async closeAsync() {
      db.close();
    },
  };
  return api as unknown as SQLiteDatabase;
}
