import type { Request, Response } from "express";
import { asBody, str } from "../../http/body";
import { currentUser } from "../../http/currentUser";
import { badRequest } from "../../http/httpError";
import type { RiskLevel } from "../../lib/screening/classify";
import type { WatchmanMatch } from "../../lib/screening/watchman";
import { accessibleStartup } from "../startups/startupAccess";
import { toStartup } from "../startups/startups.serializer";
import * as screeningService from "./screening.service";

export async function screen(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const result = await screeningService.screenStartup(
    accessibleStartup(res),
    { csvId: str(body.csvId) || undefined, purpose: str(body.purpose) || undefined },
    currentUser(res),
  );
  res.json({ ...result, startup: toStartup(result.startup) });
}

export async function delta(_req: Request, res: Response): Promise<void> {
  res.json(await screeningService.getDelta(accessibleStartup(res)));
}

/** JSON by default; `?format=csv` downloads one row per entity. */
export async function report(req: Request, res: Response): Promise<void> {
  const startup = accessibleStartup(res);
  const result = screeningService.latestResult(startup);

  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${(startup.name as string).replace(/\s+/g, "-")}-screening.csv"`,
    );
    res.send(screeningService.reportCsv(result));
    return;
  }
  res.json({ startupName: startup.name, screenedAt: startup.lastScreenedAt, screeningResult: result });
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

export async function explain(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const name = str(body.name).trim();
  const type = body.type === "person" || body.type === "company" ? body.type : null;
  const riskLevel = body.riskLevel as RiskLevel | undefined;
  if (!name || !type || !riskLevel) throw badRequest("name, type, and riskLevel are required");

  const explanation = await screeningService.explain({
    name,
    type,
    riskLevel,
    matches: Array.isArray(body.matches) ? (body.matches as WatchmanMatch[]) : [],
    ownershipPath: strings(body.ownershipPath),
    context: {
      startupName: str(body.startupName) || undefined,
      role: str(body.role) || undefined,
      indirectOwnershipPct: typeof body.indirectOwnershipPct === "number" ? body.indirectOwnershipPct : null,
      exposureStatement: str(body.exposureStatement) || undefined,
      ownershipRuleFlags: Array.isArray(body.ownershipRuleFlags) ? strings(body.ownershipRuleFlags) : undefined,
    },
  });
  res.json({ explanation });
}
