import assert from "node:assert/strict";
import { test } from "node:test";
import { ingestCsv } from "../src/lib/screening/csvIngest";
import { parseCapTableDetailed } from "../src/lib/screening/parseCapTable";
import { sampleCsv } from "./helpers";

test("strict cap table: sample-cap-table.csv", async () => {
  const result = await ingestCsv(sampleCsv("sample-cap-table.csv"), "sample-cap-table.csv");
  assert.equal(result.csvKind, "ownership_cap_table");
  assert.equal(result.parseSource, "strict");
  assert.equal(result.canScreen, true);
  assert.equal(result.records.length, 38);
  assert.deepEqual(result.errors, []);
});

test("shareholder schedule becomes an entity roster without AI", async () => {
  const result = await ingestCsv(sampleCsv("sample-entity-roster.csv"), "sample-entity-roster.csv");
  assert.equal(result.csvKind, "entity_roster");
  assert.equal(result.parseSource, "heuristic");
  assert.equal(result.canScreen, true);
  assert.deepEqual(
    result.rosterEntities.map((e) => e.name),
    ["Alpha Holdings Inc", "John Doe", "Jane Smith", "Shadow Entity Ltd"],
  );
});

test("name/type/role roster is detected by header aliases", async () => {
  const result = await ingestCsv(sampleCsv("sample-co-investors.csv"), "sample-co-investors.csv");
  assert.equal(result.csvKind, "entity_roster");
  assert.equal(result.canScreen, true);
  assert.equal(result.rosterEntities.length, 4);
  assert.ok(result.rosterEntities.every((e) => e.type === "company"));
});

test("aliased cap-table headers map heuristically", async () => {
  const csv = [
    "Company,Company_Type,Shareholder,Shareholder_Type,Percentage",
    "Acme Inc,company,Jane Founder,person,60",
    "Acme Inc,company,Seed Fund LP,company,40",
  ].join("\n");
  const result = await ingestCsv(csv, "acme.csv");
  assert.equal(result.csvKind, "ownership_cap_table");
  assert.equal(result.parseSource, "heuristic");
  assert.equal(result.canScreen, true);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[1].ownershipPct, 40);
});

test("dataset catalogs are blocked as reference metadata", async () => {
  const csv = [
    "dataset,publisher,url",
    "us_ofac_sdn,US Treasury,https://example.com/sdn.csv",
    "eu_fsf,European Commission,https://example.com/eu.csv",
  ].join("\n");
  const result = await ingestCsv(csv, "sources.csv");
  assert.equal(result.csvKind, "reference_metadata");
  assert.equal(result.canScreen, false);
});

test("header-only CSV is rejected", async () => {
  const result = await ingestCsv("entity,entity_type,owner,owner_type,ownership_pct\n", "empty.csv");
  assert.equal(result.canScreen, false);
  assert.equal(result.errors.length, 1);
});

test("strict parser reports bad rows instead of guessing", () => {
  const csv = [
    "entity,entity_type,owner,owner_type,ownership_pct",
    "Acme Inc,company,Jane,person,not-a-number",
    "Acme Inc,company,Bob,person,30",
  ].join("\n");
  const parsed = parseCapTableDetailed(csv);
  assert.equal(parsed.records.length, 1);
  assert.ok(parsed.errors.some((e) => e.row === 2));
});
