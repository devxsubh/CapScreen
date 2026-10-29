import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { after, before, describe, it } from "node:test";
import { readSettings, validateScreeningSettings, writeSettings, type ScreeningSettings } from "../src/lib/infra/settings";
import { getScreeningThresholds, screeningThresholdsSnapshot } from "../src/lib/screening/screeningConfig";
import { classifyScore } from "../src/lib/screening/classify";

const VALID: ScreeningSettings = {
  watchmanMinMatch: 0.75,
  reviewMinScore: 0.8,
  flaggedMinScore: 0.9,
  beneficialOwnerPct: 10,
  ofacOwnershipRulePct: 40,
  watchmanResultLimit: 20,
};

describe("screening settings", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "capscreen-settings-"));
  const prev = process.env.CAPSCREEN_DATA_DIR;
  before(() => {
    process.env.CAPSCREEN_DATA_DIR = dataDir;
  });
  after(() => {
    if (prev === undefined) delete process.env.CAPSCREEN_DATA_DIR;
    else process.env.CAPSCREEN_DATA_DIR = prev;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("accepts stricter ownership thresholds but never looser than OFAC 50% / UBO 25%", () => {
    assert.ok("value" in validateScreeningSettings(VALID));
    assert.ok("error" in validateScreeningSettings({ ...VALID, ofacOwnershipRulePct: 60 }));
    assert.ok("error" in validateScreeningSettings({ ...VALID, beneficialOwnerPct: 30 }));
  });

  it("keeps the score thresholds in order", () => {
    assert.ok("error" in validateScreeningSettings({ ...VALID, reviewMinScore: 0.7 }));
    assert.ok("error" in validateScreeningSettings({ ...VALID, flaggedMinScore: 0.79 }));
    assert.ok("error" in validateScreeningSettings({ ...VALID, watchmanResultLimit: 0 }));
  });

  it("uses saved thresholds for classification and records them, until reset", () => {
    assert.equal(classifyScore(0.92), "review");
    assert.equal(screeningThresholdsSnapshot().source, "default");

    writeSettings({ screening: VALID });
    assert.equal(getScreeningThresholds().ofacOwnershipRulePct, 40);
    assert.equal(classifyScore(0.92), "flagged");
    assert.deepEqual(screeningThresholdsSnapshot(), { ...VALID, source: "settings" });

    writeSettings({ screening: null });
    assert.equal(readSettings().screening, null);
    assert.equal(classifyScore(0.92), "review");
  });

  it("ignores hand-edited thresholds that fail validation", () => {
    fs.writeFileSync(path.join(dataDir, "settings.json"), JSON.stringify({ screening: { ...VALID, ofacOwnershipRulePct: 90 } }));
    assert.equal(readSettings().screening, null);
    assert.equal(getScreeningThresholds().ofacOwnershipRulePct, 50);
  });
});
