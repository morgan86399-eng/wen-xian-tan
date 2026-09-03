/* 用 Node 內建 SQLite 包出一個 D1 相容介面，讓 store.mjs 的 SQL 在測試裡真的被執行。
   假物件只驗得到「有沒有呼叫」，真 SQLite 驗得到 SQL 本身寫對沒有。 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const SCHEMA_PATH = new URL('../../functions/lib/db/schema.sql', import.meta.url);

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args.map((value) => (typeof value === 'boolean' ? Number(value) : value));
    return this;
  }

  #prepare() {
    return this.database.prepare(this.sql);
  }

  async first() {
    const row = this.#prepare().get(...this.args);
    return row === undefined ? null : row;
  }

  async all() {
    return { results: this.#prepare().all(...this.args), success: true };
  }

  async run() {
    const info = this.#prepare().run(...this.args);
    return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
  }
}

/** 回傳可放進 env.DB 的物件，另附 close 與 raw 供測試收尾與直接查表。 */
export function createFakeD1() {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  return {
    prepare: (sql) => new FakeStatement(database, sql),
    batch: async (statements) => {
      database.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    raw: database,
    close: () => database.close()
  };
}
