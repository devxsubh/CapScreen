import fs, { readFileSync } from "fs";
import os from "os";
import path from "path";
import { after, before } from "node:test";
import { connectDb, disconnectDb } from "../src/lib/infra/db";
import type { EntityResult } from "../src/types/screening";

export function sampleCsv(name: string): string {
  return readFileSync(path.join(__dirname, "..", "sample-data", name), "utf8");
}

/** Minimal EntityResult for exposure/confidence tests. */
export function entity(
  name: string,
  overrides: Partial<EntityResult> = {},
): EntityResult {
  return {
    name,
    type: "person",
    riskLevel: "clear",
    topScore: null,
    matches: [],
    ownershipPath: [],
    ...overrides,
  };
}

/** Give this test file its own throwaway SQLite database. */
export function useTempDatabase(): void {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "capscreen-test-"));
  before(async () => {
    process.env.CAPSCREEN_DATA_DIR = dataDir;
    delete process.env.CAPSCREEN_DB;
    delete process.env.CAPSCREEN_DB_FILE;
    await connectDb();
  });
  after(async () => {
    await disconnectDb();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
}
