import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOwnershipGraph,
  computeEffectiveStakeInStartup,
  findOwnershipCycles,
  findOwnershipPath,
  getStartupNode,
  isUltimateOwner,
  resolveUltimateOwners,
} from "../src/lib/screening/graph";
import { classifyScore } from "../src/lib/screening/classify";
import {
  enrichEntityWithOwnershipExposure,
  isEntityBlockedBy50Rule,
} from "../src/lib/screening/ownershipExposure";
import { parseCapTable } from "../src/lib/screening/parseCapTable";
import { scoreScreeningConfidence } from "../src/lib/screening/screeningConfidence";
import { entity, sampleCsv } from "./helpers";

const graph = buildOwnershipGraph(parseCapTable(sampleCsv("sample-cap-table.csv")));
const startup = getStartupNode(graph);
const stake = (name: string) => computeEffectiveStakeInStartup(graph, startup, name);

test("startup node is the company that owns nothing", () => {
  assert.equal(startup, "NexaFlow AI Inc");
});

test("effective stakes multiply along chains", () => {
  assert.equal(stake("Emma Richardson"), 18);
  assert.equal(stake("Atlantic Bridge Ventures Ltd"), 20);
  // 12% Cascade × 100% × 100% × 100%
  assert.ok(Math.abs(stake("Ivan Petrovich Kozlov") - 12) < 1e-9);
  // 20% Atlantic × 65% Sterling × 100% × 100%
  assert.ok(Math.abs(stake("Johan Petrovitch Kozlov") - 13) < 1e-9);
  // 8% Riverside × 28%
  assert.ok(Math.abs(stake("Mohammed Al Rahman") - 2.24) < 1e-9);
});

test("hidden owner is found four layers deep", () => {
  assert.deepEqual(findOwnershipPath(graph, startup, "Ivan Petrovich Kozlov"), [
    "NexaFlow AI Inc",
    "Cascade Series A SPV LLC",
    "Meridian Offshore Holdings Ltd",
    "Ashford Family Trust",
    "Ivan Petrovich Kozlov",
  ]);
  assert.ok(resolveUltimateOwners(graph, "Cascade Series A SPV LLC").includes("Ivan Petrovich Kozlov"));
  assert.equal(isUltimateOwner(graph, "Ivan Petrovich Kozlov"), true);
  assert.equal(isUltimateOwner(graph, "Ashford Family Trust"), false);
});

test("circular ownership is detected and traversal terminates", () => {
  const cycles = findOwnershipCycles(graph);
  assert.ok(cycles.some((c) => c.includes("Apex Circular Holdings LP") && c.includes("Loopback Holdings Ltd")));
  assert.ok(Number.isFinite(stake("Robert Chen")));
});

test("score thresholds", () => {
  assert.equal(classifyScore(null), "clear");
  assert.equal(classifyScore(0.79), "clear");
  assert.equal(classifyScore(0.8), "review");
  assert.equal(classifyScore(0.949), "review");
  assert.equal(classifyScore(0.95), "flagged");
});

test("OFAC 50% rule propagates through 100% holding chains", () => {
  const sanctioned = new Set(["Ivan Petrovich Kozlov"]);
  assert.equal(isEntityBlockedBy50Rule(graph, "Ashford Family Trust", sanctioned), true);
  assert.equal(isEntityBlockedBy50Rule(graph, "Cascade Series A SPV LLC", sanctioned), true);
  // Johan holds Gamma 100% → Sterling 100% → Atlantic only 65%, but nobody in that chain is sanctioned here.
  assert.equal(isEntityBlockedBy50Rule(graph, "Atlantic Bridge Ventures Ltd", sanctioned), false);
  // Circular structure must not recurse forever.
  assert.equal(isEntityBlockedBy50Rule(graph, "Apex Circular Holdings LP", sanctioned), false);
});

// Blockable under the 50% rule counts as a hit: clear → review, then ofac_50 escalates review → flagged.
test("blockable company with no hit of its own is flagged", () => {
  const sanctioned = new Set(["Ivan Petrovich Kozlov"]);
  const enriched = enrichEntityWithOwnershipExposure(
    entity("Cascade Series A SPV LLC", {
      type: "company",
      ownershipPath: findOwnershipPath(graph, startup, "Cascade Series A SPV LLC"),
    }),
    graph,
    startup,
    sanctioned,
    new Map(),
  );
  assert.equal(enriched.riskLevel, "flagged");
  assert.deepEqual(enriched.ownershipRuleFlags, ["ofac_50"]);
  assert.equal(enriched.indirectOwnershipPct, 12);
});

test("review hit that meets the 50% rule is escalated to flagged", () => {
  const sanctioned = new Set(["Johan Petrovitch Kozlov"]);
  const enriched = enrichEntityWithOwnershipExposure(
    entity("Gamma Holdings Ltd", {
      type: "company",
      riskLevel: "review",
      topScore: 0.85,
      ownershipPath: findOwnershipPath(graph, startup, "Gamma Holdings Ltd"),
    }),
    graph,
    startup,
    sanctioned,
    new Map(),
  );
  assert.equal(enriched.riskLevel, "flagged");
  assert.ok(enriched.exposureStatement?.includes("13.0% of NexaFlow AI Inc"));
});

test("clear entities keep no exposure figures", () => {
  const enriched = enrichEntityWithOwnershipExposure(
    entity("Emma Richardson", { ownershipPath: [startup, "Emma Richardson"] }),
    graph,
    startup,
    new Set(),
    new Map(),
  );
  assert.equal(enriched.riskLevel, "clear");
  assert.equal(enriched.indirectOwnershipPct, null);
  assert.equal(enriched.ownershipRuleFlags, undefined);
});

test("screening confidence weights people double and review as half credit", () => {
  assert.equal(scoreScreeningConfidence([]).confidence, 0);
  assert.equal(scoreScreeningConfidence([entity("a"), entity("b", { type: "company" })]).confidence, 100);
  // person review: weight 2 × 0.5, company clear: weight 1 × 1 → 2/3
  assert.equal(
    scoreScreeningConfidence([entity("a", { riskLevel: "review" }), entity("b", { type: "company" })]).confidence,
    67,
  );
});
