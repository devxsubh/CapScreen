import assert from "node:assert/strict";
import { test } from "node:test";
import { computeScreeningDelta, decodeRiskKey, encodeRiskKey, saveScreeningSnapshot } from "../src/lib/screening/screeningDelta";
import { Startup } from "../src/models";
import type { ScreeningResult } from "../src/types/screening";
import { entity, useTempDatabase } from "./helpers";

useTempDatabase();

function result(entities: ReturnType<typeof entity>[]): ScreeningResult {
  return {
    totalEntities: entities.length,
    flaggedCount: entities.filter((e) => e.riskLevel === "flagged").length,
    reviewCount: entities.filter((e) => e.riskLevel === "review").length,
    clearCount: entities.filter((e) => e.riskLevel === "clear").length,
    entities,
    edges: [],
  } as unknown as ScreeningResult;
}

test("risk keys round-trip, including dots, dollars and percent signs", () => {
  for (const name of ["Acme Inc.", "Dr. Anya Petrov", "$Coin Holdings", "50% Partners", "Plain Name"]) {
    assert.equal(decodeRiskKey(encodeRiskKey(name)), name);
    assert.ok(!/[.$]/.test(encodeRiskKey(name)));
  }
});

test("snapshots save entity names with dots and the next delta matches them", async () => {
  const s = await Startup.create({ name: "Dotted Co", ownerId: "local-user" });
  const id = String(s._id);
  await saveScreeningSnapshot(id, "cap_table", result([entity("Dr. Anya Petrov"), entity("Acme Inc.")]));

  const delta = await computeScreeningDelta(
    id,
    result([entity("Dr. Anya Petrov"), entity("Acme Inc.", { riskLevel: "review" })]),
  );
  assert.equal(delta.hasPrevious, true);
  // Only Acme changed; Dr. Anya Petrov is recognised as the same entity, not a new one.
  assert.deepEqual(
    delta.changes.map((c) => [c.entityName, c.previousRisk, c.newRisk]),
    [["Acme Inc.", "clear", "review"]],
  );
});
