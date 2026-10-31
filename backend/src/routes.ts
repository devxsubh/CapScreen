import { Router } from "express";
import { aiControlCenterRouter } from "./modules/aiControlCenter/aiControlCenter.routes";
import { assistantRouter } from "./modules/assistant/assistant.routes";
import { auditLogsRouter } from "./modules/auditLogs/auditLogs.routes";
import { capTablesRouter, csvPreviewRouter } from "./modules/capTables/capTables.routes";
import { chatsRouter, startupChatRouter } from "./modules/chats/chats.routes";
import { configRouter } from "./modules/config/config.routes";
import { desktopRouter } from "./modules/desktop/desktop.routes";
import {
  generatedDocumentsRouter,
  icMemoRouter,
  projectDocumentsRouter,
  ragDocumentsRouter,
  startupDocumentsRouter,
  storedDocumentsRouter,
} from "./modules/documents/documents.routes";
import { entityReviewsRouter } from "./modules/entityReviews/entityReviews.routes";
import { filesRouter } from "./modules/files/files.routes";
import { portfolioRouter } from "./modules/portfolio/portfolio.routes";
import { projectsRouter } from "./modules/projects/projects.routes";
import { screenRouter, startupScreeningRouter } from "./modules/screening/screening.routes";
import { requireStartupAccess } from "./modules/startups/startupAccess";
import { startupCollectionRouter, startupRouter } from "./modules/startups/startups.routes";
import { tabularReviewsRouter } from "./modules/tabularReviews/tabularReviews.routes";
import { workflowsRouter } from "./modules/workflows/workflows.routes";

/**
 * Every URL the desktop API serves. Each module owns its routes →
 * controller → service → repository; this file only decides where they mount.
 */

/** /api/startups — a startup and everything that belongs to it. */
const startups = Router();
startups.use(startupCollectionRouter);
startups.use("/analyze-csv", csvPreviewRouter);
// Everything below is about one startup: load it (owned or a shared sample) or 404.
startups.use("/:id", requireStartupAccess);
startups.use("/:id", startupRouter);
startups.use("/:id", startupScreeningRouter);
startups.use("/:id/csvs", capTablesRouter);
startups.use("/:id/entity-reviews", entityReviewsRouter);
startups.use("/:id/ic-memo", icMemoRouter);
startups.use("/:id/documents", startupDocumentsRouter);
startups.use("/:id/rag-documents", ragDocumentsRouter);
startups.use("/:id/chat", startupChatRouter);

export const apiRouter = Router();

apiRouter.use("/chat", assistantRouter);
apiRouter.use("/api/startups", startups);
apiRouter.use("/api/screen", screenRouter);
apiRouter.use("/api/chats", chatsRouter);
apiRouter.use("/api/documents", generatedDocumentsRouter);
apiRouter.use("/api/portfolio", portfolioRouter);
apiRouter.use("/api/audit-logs", auditLogsRouter);
apiRouter.use("/api/config", configRouter);
apiRouter.use("/api/ai", aiControlCenterRouter);
apiRouter.use("/api/desktop", desktopRouter);
apiRouter.use("/api/files", filesRouter);
apiRouter.use("/projects", projectsRouter);
apiRouter.use("/projects/:projectId/documents", projectDocumentsRouter);
apiRouter.use("/single-documents", storedDocumentsRouter);
apiRouter.use("/tabular-review", tabularReviewsRouter);
apiRouter.use("/workflows", workflowsRouter);

apiRouter.get("/health", (_req, res) => res.json({ ok: true }));
