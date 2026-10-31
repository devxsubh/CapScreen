/**
 * HTTP contract of the desktop API: status codes and response shapes the
 * frontend relies on. Covers the routes that need no LLM; Watchman points at a
 * closed port so screening exercises its fail-closed path.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createApp } from "../src/app";
import { sampleCsv, useTempDatabase } from "./helpers";
import { serveForTests } from "./http";

process.env.WATCHMAN_URL = "http://127.0.0.1:9";
delete process.env.CAPSCREEN_DESKTOP_TOKEN;

useTempDatabase();
const api = serveForTests(createApp);

type Json = Record<string, unknown>;
const MISSING_ID = "0123456789abcdef01234567";

describe("startups, CSVs and screening", () => {
  let startupId = "";
  let csvId = "";

  test("create, list, read, rename", async () => {
    assert.equal((await api("POST", "/api/startups", { name: "  " })).status, 400);

    const created = await api("POST", "/api/startups", { name: " NexaFlow " });
    assert.equal(created.status, 201);
    const startup = created.body as Json;
    assert.equal(startup.name, "NexaFlow");
    assert.equal(startup.portfolioReviewStatus, "pending");
    assert.equal(startup.isSample, false);
    startupId = startup.id as string;

    const list = (await api("GET", "/api/startups")).body as Json[];
    assert.ok(list.some((s) => s.id === startupId));

    assert.equal(((await api("GET", `/api/startups/${startupId}`)).body as Json).name, "NexaFlow");
    assert.equal((await api("GET", `/api/startups/${MISSING_ID}`)).status, 404);
    assert.equal((await api("GET", "/api/startups/not-an-id")).status, 404);

    const renamed = await api("PATCH", `/api/startups/${startupId}`, { name: "NexaFlow AI" });
    assert.equal((renamed.body as Json).name, "NexaFlow AI");
  });

  test("screening summary lists the startup", async () => {
    const res = await api("GET", "/api/startups/screening-summary");
    const row = (res.body as Json[]).find((s) => s.startupId === startupId);
    assert.deepEqual(
      { totalEntities: row?.totalEntities, flaggedCount: row?.flaggedCount, lastScreenedAt: row?.lastScreenedAt },
      { totalEntities: 0, flaggedCount: 0, lastScreenedAt: null },
    );
  });

  test("CSV upload, list, edit; writes audit entries", async () => {
    assert.equal((await api("POST", "/api/startups/analyze-csv", {})).status, 400);
    assert.equal((await api("POST", `/api/startups/${startupId}/csvs`, { filename: "x.csv" })).status, 400);

    const uploaded = await api("POST", `/api/startups/${startupId}/csvs`, {
      filename: "sample-cap-table.csv",
      content: sampleCsv("sample-cap-table.csv"),
    });
    assert.equal(uploaded.status, 201);
    const csv = uploaded.body as Json;
    assert.equal(csv.parseStatus, "valid");
    assert.equal(csv.rosterPurpose, "cap_table");
    assert.ok((csv.recordCount as number) > 0);
    csvId = csv.id as string;

    const startup = (await api("GET", `/api/startups/${startupId}`)).body as Json;
    assert.equal(startup.latestCsvId, csvId);

    const list = (await api("GET", `/api/startups/${startupId}/csvs`)).body as Json[];
    assert.deepEqual(list.map((c) => c.id), [csvId]);

    assert.equal((await api("PATCH", `/api/startups/${startupId}/csvs/${csvId}`, {})).status, 400);
    const edited = await api("PATCH", `/api/startups/${startupId}/csvs/${csvId}`, {
      content: sampleCsv("sample-cap-table.csv"),
    });
    assert.equal(edited.status, 200);
    assert.equal((edited.body as Json).id, csvId);
    assert.equal((await api("PATCH", `/api/startups/${startupId}/csvs/${MISSING_ID}`, { content: "a,b" })).status, 404);

    const logs = (await api("GET", `/api/audit-logs?startupId=${startupId}`)).body as Json[];
    assert.deepEqual(logs.map((l) => l.eventType).sort(), ["csv_updated", "csv_uploaded"]);
  });

  test("screening fails closed when Watchman is down", async () => {
    const res = await api("POST", `/api/startups/${startupId}/screen`, {});
    assert.equal(res.status, 503);
  });

  test("delta, report and IC memo before any screening", async () => {
    const delta = await api("GET", `/api/startups/${startupId}/screening-delta`);
    assert.deepEqual(delta.body, { hasPrevious: false, previousScreenedAt: null, changes: [], summary: "No screening on file." });
    assert.equal((await api("GET", `/api/startups/${startupId}/screening-report`)).status, 400);
    assert.equal((await api("POST", `/api/startups/${startupId}/ic-memo`)).status, 400);
    assert.deepEqual((await api("GET", `/api/startups/${startupId}/ic-memo`)).body, []);
    assert.equal((await api("GET", `/api/startups/${startupId}/ic-memo/latest`)).status, 404);
  });

  test("entity reviews", async () => {
    const path = `/api/startups/${startupId}/entity-reviews`;
    assert.equal((await api("POST", path, { status: "cleared" })).status, 400);
    assert.equal((await api("POST", path, { entityName: "A", status: "nope" })).status, 400);
    const created = await api("POST", path, { entityName: " Alpha Holdings ", status: "cleared", notes: " ok " });
    assert.equal(created.status, 201);
    assert.equal((created.body as Json).entityName, "Alpha Holdings");
    assert.equal((created.body as Json).notes, "ok");
    const list = (await api("GET", path)).body as Json[];
    assert.equal(list.length, 1);
  });

  test("startup chat transcript", async () => {
    const path = `/api/startups/${startupId}/chat`;
    assert.deepEqual((await api("GET", path)).body, { messages: [] });
    assert.equal((await api("PUT", path, {})).status, 400);
    assert.deepEqual((await api("PUT", path, { messages: [{ role: "user", content: "hi" }] })).body, { ok: true });
    assert.deepEqual((await api("GET", path)).body, { messages: [{ role: "user", content: "hi" }] });
  });

  test("projects view of the startup", async () => {
    const list = (await api("GET", "/projects")).body as Json[];
    assert.ok(list.some((p) => p.id === startupId && p.is_owner === true));
    const one = (await api("GET", `/projects/${startupId}`)).body as Json;
    assert.equal(one.name, "NexaFlow AI");
    assert.ok(Array.isArray(one.csvs));
    assert.equal((await api("GET", `/projects/${MISSING_ID}`)).status, 404);
  });

  test("portfolio grid: editing Status records the decision, other columns untouched", async () => {
    const { reviewId } = (await api("GET", "/api/portfolio/review")).body as { reviewId: string };
    const rowId = `startup:${startupId}`;
    const coInvestorCell = async () => {
      const { cells } = (await api("GET", `/tabular-review/${reviewId}`)).body as { cells: Json[] };
      return cells.find((c) => c.document_id === rowId && c.column_index === 4)?.content;
    };
    const before = await coInvestorCell();

    const edited = await api("POST", `/tabular-review/${reviewId}/regenerate-cell`, {
      document_id: rowId,
      column_index: 5,
      content: { summary: "cleared" },
    });
    assert.equal(edited.status, 200);

    const startup = (await api("GET", `/api/startups/${startupId}`)).body as Json;
    assert.equal(startup.portfolioReviewStatus, "cleared");
    assert.deepEqual(await coInvestorCell(), before);
    const logs = (await api("GET", `/api/audit-logs?startupId=${startupId}`)).body as Json[];
    assert.ok(logs.some((l) => l.eventType === "portfolio_reviewed"));
  });

  test("every /:id route 404s for a startup that doesn't exist", async () => {
    for (const path of ["csvs", "entity-reviews", "rag-documents", "chat", "ic-memo", "screening-delta"]) {
      const res = await api("GET", `/api/startups/${MISSING_ID}/${path}`);
      assert.equal(res.status, 404, path);
      assert.deepEqual(res.body, { detail: "Startup not found" });
    }
    assert.equal((await api("POST", `/api/startups/${MISSING_ID}/screen`, {})).status, 404);
  });

  test("CSV delete, then startup delete", async () => {
    assert.equal((await api("DELETE", `/api/startups/${startupId}/csvs/${csvId}`)).status, 204);
    assert.equal((await api("DELETE", `/api/startups/${startupId}/csvs/${csvId}`)).status, 404);
    assert.equal((await api("DELETE", `/api/startups/${startupId}`)).status, 204);
    assert.equal((await api("GET", `/api/startups/${startupId}`)).status, 404);
  });
});

describe("assistant chats", () => {
  test("lifecycle", async () => {
    const created = await api("POST", "/api/chats", {});
    assert.equal(created.status, 201);
    const id = (created.body as Json).id as string;

    assert.equal((await api("GET", "/api/chats/bad")).status, 404);
    const read = (await api("GET", `/api/chats/${id}`)).body as { chat: Json; messages: unknown[] };
    assert.equal(read.chat.title, null);
    assert.deepEqual(read.messages, []);

    assert.equal((await api("PATCH", `/api/chats/${id}`, {})).status, 400);
    assert.equal(((await api("PATCH", `/api/chats/${id}`, { title: " Q3 " })).body as Json).title, "Q3");
    assert.deepEqual((await api("PUT", `/api/chats/${id}/messages`, { messages: [{ role: "user", content: "x" }] })).body, { ok: true });
    const titled = await api("POST", `/api/chats/${id}/generate-title`, { message: "  screen   this  " });
    assert.deepEqual(titled.body, { title: "screen this" });

    const list = (await api("GET", "/api/chats?limit=5")).body as Json[];
    assert.equal(list[0].id, id);

    assert.equal((await api("DELETE", `/api/chats/${id}`)).status, 204);
    assert.equal((await api("DELETE", `/api/chats/${id}`)).status, 404);
  });

  test("POST /chat validates before streaming", async () => {
    assert.equal((await api("POST", "/chat", { messages: [] })).status, 400);
    assert.equal((await api("POST", "/chat/runs/nope/resume", { approved: "yes" })).status, 400);
    assert.equal((await api("POST", "/chat/runs/nope/resume", { approved: true })).status, 404);
    assert.equal(typeof ((await api("POST", "/chat/create")).body as Json).id, "string");
  });

  test("explain validates input", async () => {
    assert.equal((await api("POST", "/api/screen/explain", { name: "A" })).status, 400);
  });
});

describe("audit logs", () => {
  test("create, validate, export", async () => {
    assert.equal((await api("POST", "/api/audit-logs", { eventType: "bogus" })).status, 400);
    assert.equal((await api("POST", "/api/audit-logs", { eventType: "csv_uploaded", startupId: "bad" })).status, 400);
    assert.equal((await api("POST", "/api/audit-logs", { eventType: "csv_uploaded", startupId: MISSING_ID })).status, 404);
    const created = await api("POST", "/api/audit-logs", { eventType: "portfolio_reviewed", details: { a: 1 } });
    assert.equal(created.status, 201);
    assert.deepEqual((created.body as Json).details, { a: 1 });

    assert.equal((await api("GET", "/api/audit-logs?startupId=bad")).status, 400);
    assert.equal((await api("GET", `/api/audit-logs?startupId=${MISSING_ID}`)).status, 404);

    const csv = await api("GET", "/api/audit-logs/export");
    assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
    assert.ok(csv.text.startsWith("id,startupId,eventType,"));
  });

  test("tamper-evident desktop export", async () => {
    const res = await api("GET", "/api/desktop/audit-export");
    const doc = res.body as { format: string; count: number; entries: Json[]; chain: Json };
    assert.equal(doc.format, "capscreen-audit-v1");
    assert.equal(doc.count, doc.entries.length);
    assert.equal(doc.chain.finalHash, doc.entries.at(-1)?.hash);
  });
});

describe("workflows", () => {
  test("custom workflow lifecycle and hiding", async () => {
    assert.equal((await api("GET", "/workflows?type=bad")).status, 400);
    assert.equal((await api("POST", "/workflows", { type: "assistant" })).status, 400);
    assert.equal((await api("POST", "/workflows", { title: "x", type: "bad" })).status, 400);

    const created = await api("POST", "/workflows", { title: "KYC pass", type: "assistant", prompt_md: "Do it" });
    assert.equal(created.status, 201);
    const id = (created.body as Json).id as string;

    assert.equal(((await api("PATCH", `/workflows/${id}`, { title: "KYC" })).body as Json).title, "KYC");
    assert.equal(((await api("GET", `/workflows/${id}`)).body as Json).title, "KYC");
    assert.equal((await api("GET", "/workflows/nope")).status, 404);

    assert.equal((await api("POST", "/workflows/hidden", {})).status, 400);
    assert.equal((await api("POST", "/workflows/hidden", { workflow_id: id })).status, 204);
    assert.ok(((await api("GET", "/workflows/hidden")).body as string[]).includes(id));
    assert.equal((await api("DELETE", `/workflows/hidden/${id}`)).status, 204);

    assert.equal((await api("DELETE", `/workflows/${id}`)).status, 204);
    assert.equal((await api("DELETE", `/workflows/${id}`)).status, 404);
  });
});

describe("tabular reviews", () => {
  test("lifecycle", async () => {
    const created = await api("POST", "/tabular-review", { title: "Grid", document_ids: ["a", "b"] });
    assert.equal(created.status, 201);
    const review = created.body as Json;
    assert.equal(review.document_count, 2);
    assert.equal(review.is_owner, true);
    const id = review.id as string;

    const one = (await api("GET", `/tabular-review/${id}`)).body as { review: Json; cells: unknown[]; documents: Json[] };
    assert.deepEqual(one.documents.map((d) => d.id), ["a", "b"]);

    assert.equal(((await api("PATCH", `/tabular-review/${id}`, { title: "Grid 2" })).body as Json).title, "Grid 2");

    assert.equal((await api("POST", `/tabular-review/${id}/regenerate-cell`, {})).status, 400);
    const cell = await api("POST", `/tabular-review/${id}/regenerate-cell`, {
      document_id: "a",
      column_index: 0,
      content: { summary: "Clear" },
    });
    assert.deepEqual(cell.body, { summary: "Clear", flag: "grey", reasoning: "" });
    assert.equal(((await api("GET", `/tabular-review/${id}`)).body as { cells: unknown[] }).cells.length, 1);

    assert.equal((await api("POST", `/tabular-review/${id}/clear-cells`, {})).status, 400);
    assert.deepEqual((await api("POST", `/tabular-review/${id}/clear-cells`, { document_ids: ["a"] })).body, { ok: true });

    const gen = await api("POST", `/tabular-review/${id}/generate`);
    assert.match(gen.headers.get("content-type") ?? "", /text\/event-stream/);
    assert.ok(gen.text.includes('"type":"error"') && gen.text.includes("[DONE]"));

    assert.equal((await api("POST", `/tabular-review/${id}/chat`, { messages: [] })).status, 400);

    const list = (await api("GET", "/tabular-review")).body as Json[];
    assert.ok(list.some((r) => r.id === id));

    assert.equal((await api("DELETE", `/tabular-review/${id}`)).status, 204);
    assert.equal((await api("GET", `/tabular-review/${id}`)).status, 404);
  });
});

describe("portfolio, config, settings, AI control center", () => {
  test("portfolio", async () => {
    assert.equal((await api("GET", "/api/portfolio/compare?ids=a")).status, 400);
    assert.equal((await api("GET", "/api/portfolio/digest")).body, null);
    assert.equal(typeof ((await api("GET", "/api/portfolio/review")).body as Json).reviewId, "string");
    assert.equal((await api("POST", `/api/portfolio/startups/${MISSING_ID}/entity-review`)).status, 404);
  });

  test("config", async () => {
    const body = (await api("GET", "/api/config")).body as Json;
    assert.deepEqual(Object.keys(body).sort(), ["llm", "ragEnabled", "screening", "webSearchEnabled"]);
  });

  test("desktop settings", async () => {
    const read = (await api("GET", "/api/desktop/settings")).body as Json;
    assert.ok(Array.isArray(read.availableLists));
    assert.equal((await api("PUT", "/api/desktop/settings", { sanctionsLists: [] })).status, 400);
    const saved = await api("PUT", "/api/desktop/settings", { backgroundScreening: { enabled: true, intervalHours: 0 } });
    assert.deepEqual((saved.body as { settings: Json }).settings.backgroundScreening, { enabled: true, intervalHours: 1 });
    assert.equal((await api("POST", "/api/desktop/erase", { confirm: "yes" })).status, 400);
    assert.equal((await api("PUT", `/api/desktop/watch-folders/${MISSING_ID}`, { path: null })).status, 404);
  });

  test("AI control center validation", async () => {
    const state = (await api("GET", "/api/ai/state")).body as Json;
    assert.ok(Array.isArray(state.providers));
    assert.equal((await api("PUT", "/api/ai/providers/X!", {})).status, 400);
    assert.equal((await api("PUT", "/api/ai/providers/my-gw", {})).status, 400);
    assert.equal((await api("PUT", "/api/ai/providers/my-gw", { baseUrl: "ftp://x" })).status, 400);
    assert.equal((await api("PUT", "/api/ai/providers/nope/key", { apiKey: "k" })).status, 404);
    assert.equal((await api("PUT", "/api/ai/roles", { boss: null })).status, 400);
    assert.equal((await api("POST", "/api/ai/probe-tools", {})).status, 400);
    assert.equal((await api("POST", "/api/ai/local/pull", { model: "bad model!" })).status, 400);
  });

  test("documents", async () => {
    assert.deepEqual((await api("GET", "/single-documents")).body, []);
    assert.equal((await api("GET", `/single-documents/${MISSING_ID}/url`)).status, 404);
    assert.equal((await api("GET", `/api/documents/${MISSING_ID}/view`)).status, 404);
  });

  test("unknown route", async () => {
    assert.deepEqual((await api("GET", "/nope")).body, { detail: "Not found" });
    assert.deepEqual((await api("GET", "/health")).body, { ok: true });
  });
});
