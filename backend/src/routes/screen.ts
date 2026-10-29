import express from "express";
import { friendlyLlmError } from "../lib/llm/friendlyError";
import { explainMatch } from "../lib/screening/explain";
import { requireAuth } from "../middleware/requireAuth";
import type { RiskLevel } from "../lib/screening/classify";
import type { WatchmanMatch } from "../lib/screening/watchman";

export const screenRouter = express.Router();

screenRouter.use(requireAuth);

screenRouter.post("/explain", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = body.type === "person" || body.type === "company" ? body.type : null;
  const riskLevel = body.riskLevel as RiskLevel | undefined;

  if (!name || !type || !riskLevel) {
    res.status(400).json({ detail: "name, type, and riskLevel are required" });
    return;
  }

  const matches = Array.isArray(body.matches) ? (body.matches as WatchmanMatch[]) : [];
  const ownershipPath = Array.isArray(body.ownershipPath)
    ? body.ownershipPath.filter((p): p is string => typeof p === "string")
    : [];

  try {
    const explanation = await explainMatch(
      { name, type },
      matches,
      ownershipPath,
      riskLevel,
      {
        startupName: typeof body.startupName === "string" ? body.startupName : undefined,
        role: typeof body.role === "string" ? body.role : undefined,
        indirectOwnershipPct:
          typeof body.indirectOwnershipPct === "number"
            ? body.indirectOwnershipPct
            : null,
        exposureStatement:
          typeof body.exposureStatement === "string"
            ? body.exposureStatement
            : undefined,
        ownershipRuleFlags: Array.isArray(body.ownershipRuleFlags)
          ? body.ownershipRuleFlags.filter((f): f is string => typeof f === "string")
          : undefined,
      },
    );
    res.json({ explanation });
  } catch (err) {
    res.status(500).json({ detail: friendlyLlmError(err) });
  }
});
