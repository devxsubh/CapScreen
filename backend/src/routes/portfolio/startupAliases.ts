import { Router } from "express";
import { runPortfolioRescreen } from "../../lib/portfolio/rescreenScheduler";
import { Startup } from "../../models";
import { visibleStartupFilter } from "../startups/middleware";
import { toScreeningSummary } from "../startups/serializers";

/** Legacy paths kept under /api/startups for frontend compatibility. */
export const portfolioStartupAliasesRouter = Router();

portfolioStartupAliasesRouter.get("/screening-summary", async (req, res) => {
  const userId = res.locals.userId as string;
  const list = await Startup.find(visibleStartupFilter(userId))
    .sort({ createdAt: -1 })
    .lean();
  res.json(list.map(toScreeningSummary));
});

portfolioStartupAliasesRouter.post("/rescreen-all", async (req, res) => {
  const userId = res.locals.userId as string;
  const userEmail = res.locals.userEmail as string;
  const result = await runPortfolioRescreen({ ownerId: userId, userEmail });
  res.json({
    rescreened: result.rescreened,
    total: result.total,
    digestId: result.digestId,
    results: [],
  });
});
