import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { test } from "node:test";
import { dataDir } from "../src/lib/infra/dataDir";
import { eraseLocalData } from "../src/lib/infra/eraseData";
import { AssistantChat, Startup } from "../src/models";
import { useTempDatabase } from "./helpers";

useTempDatabase();

test("erasing removes everything the user added and keeps a safety copy", async () => {
  await Startup.create({ name: "Acme Inc", ownerId: "local-user" });
  await Startup.create({ name: "Old Co", ownerId: "local-user", deletedAt: new Date() });
  await AssistantChat.create({ userId: "local-user", title: "hi" });
  fs.mkdirSync(path.join(dataDir(), "files", "docs"), { recursive: true });
  fs.writeFileSync(path.join(dataDir(), "files", "docs", "memo.pdf"), "pdf");
  fs.writeFileSync(path.join(dataDir(), "folder-watch.json"), "{}");
  fs.writeFileSync(path.join(dataDir(), "settings.json"), "{}");

  const r = await eraseLocalData();

  assert.ok(r.deleted >= 3);
  assert.equal(await Startup.countDocuments({ deletedAt: { $exists: true } }), 0);
  assert.equal(await Startup.countDocuments({}), 0);
  assert.equal(await AssistantChat.countDocuments({}), 0);
  // Uploaded files and the watched-folder setup are set aside, settings stay.
  assert.ok(!fs.existsSync(path.join(dataDir(), "files")));
  assert.ok(fs.existsSync(path.join(r.safetyCopy, "files", "docs", "memo.pdf")));
  assert.ok(fs.existsSync(path.join(r.safetyCopy, "folder-watch.json")));
  assert.ok(fs.existsSync(path.join(r.safetyCopy, "capscreen.db")));
  assert.ok(fs.existsSync(path.join(dataDir(), "settings.json")));

  // The app keeps working afterwards.
  await Startup.create({ name: "Fresh Co", ownerId: "local-user" });
  assert.equal(await Startup.countDocuments({}), 1);
});
