import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { dataDir } from "./dataDir";
import { databaseFile } from "./db";

export type EraseResult = { deleted: number; safetyCopy: string };

/**
 * "Start fresh": remove everything the user has added — startups, cap tables, screenings, documents and uploaded
 * files, chats, tabular reviews, custom workflows, the audit log and the watched-folder setup.
 *
 * Kept: sign-in (vault/, identity.json), AI setup and keys (ai/), settings.json and the Watchman list cache.
 * Goes through the live connection so the in-memory store and the SQLite file stay in step. Before deleting, the
 * database files and uploaded files are set aside in <data>/backups/before-erase-<time>/.
 */
export async function eraseLocalData(): Promise<EraseResult> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safetyCopy = dataDir("backups", `before-erase-${stamp}`);
  const dbFile = databaseFile();
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(dbFile + suffix)) fs.copyFileSync(dbFile + suffix, path.join(safetyCopy, path.basename(dbFile + suffix)));
  }
  // Moved rather than copied, so this stays instant however many documents were uploaded.
  for (const name of ["files", "folder-watch.json"]) {
    const src = path.join(dataDir(), name);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(safetyCopy, name));
  }

  let deleted = 0;
  for (const { name } of await db.listCollections().toArray()) {
    const r = await db.collection(name).deleteMany({});
    deleted += r.deletedCount ?? 0;
  }
  return { deleted, safetyCopy };
}
