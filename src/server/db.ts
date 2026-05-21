import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';

export interface ChannelOverride {
  categoryPrimary:    string;
  categorySecondary?: string;
  notes?:             string;
  updatedAt:          string;
}

export interface DbSchema {
  overrides: Record<string, ChannelOverride>;
}

const DB_PATH = path.resolve('output/db.json');

const adapter  = new JSONFile<DbSchema>(DB_PATH);
const defaults: DbSchema = { overrides: {} };
export const db = new Low<DbSchema>(adapter, defaults);

export async function initDb() {
  await db.read();
  db.data ??= defaults;
  await db.write();
}
