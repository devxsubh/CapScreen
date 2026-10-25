import mongoose from "mongoose";
import { dataFile } from "./dataDir";
import type { SqliteDb } from "./sqliteStore/store";
import { applyPendingRestore } from "./backup";

/**
 * On-device database. Mongoose models run unchanged on top of a SQLite file
 * (see sqliteStore/) — nothing is sent to a database server.
 *
 * Exception: the cloud auth service (src/authService, deployed to Vercel) sets
 * CAPSCREEN_DB=mongodb and stores accounts — only accounts — in MongoDB Atlas.
 * The desktop app never sets it.
 */

let sqlite: SqliteDb | null = null;
let mongoPending: Promise<unknown> | null = null;

function usesMongo(): boolean {
  return process.env.CAPSCREEN_DB === "mongodb";
}

export function databaseFile(): string {
  return process.env.CAPSCREEN_DB_FILE?.trim() || dataFile("capscreen.db");
}

export async function connectDb(): Promise<void> {
  if (usesMongo()) {
    if (mongoose.connection.readyState === 1) return;
    const uri = process.env.MONGODB_URI?.trim();
    if (!uri) throw new Error("MONGODB_URI is required when CAPSCREEN_DB=mongodb");
    // Serverless: reuse one connection across warm invocations.
    mongoPending ??= mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 }).catch((err) => {
      mongoPending = null;
      throw err;
    });
    await mongoPending;
    return;
  }
  if (sqlite) return;

  // Loaded lazily so the cloud auth service never touches node:sqlite.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SqliteClient, SqliteDb: SqliteDbImpl } = require("./sqliteStore/store") as typeof import("./sqliteStore/store");
  applyPendingRestore(databaseFile());
  sqlite = new SqliteDbImpl(databaseFile());
  const client = new SqliteClient(sqlite);

  // Mirror what mongoose's native driver does in _setClient(), then open.
  const conn = mongoose.connection as unknown as {
    db: unknown;
    client: unknown;
    name: string;
    host: string;
    port: number;
    onOpen(): void;
  };
  conn.db = sqlite;
  conn.client = client;
  conn.name = sqlite.databaseName;
  conn.host = "localhost";
  conn.port = 0;
  conn.onOpen();

  sqlite.startTtlSweeper();
  console.log(`Local database: ${sqlite.file}`);
}

export function getSqliteDb(): SqliteDb {
  if (!sqlite) throw new Error("Database not connected");
  return sqlite;
}

export async function disconnectDb(): Promise<void> {
  if (usesMongo()) {
    await mongoose.disconnect();
    mongoPending = null;
    return;
  }
  if (!sqlite) return;
  sqlite.close();
  sqlite = null;
  (mongoose.connection as unknown as { readyState: number }).readyState = 0;
}
