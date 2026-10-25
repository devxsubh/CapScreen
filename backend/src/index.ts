import "./loadEnv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { logRagStartupWarnings } from "./lib/rag/embed";
import { logWebSearchStartupWarnings } from "./lib/infra/webSearchConfig";
import {
  projectDocumentsRouter,
  singleDocumentsRouter,
} from "./routes/documents/singleDocuments";
import { projectsRouter } from "./routes/projects/index";
import { screenRouter } from "./routes/screen";
import { chatRouter } from "./routes/chat";
import { assistantChatRouter } from "./routes/assistantChat";
import { workflowsRouter } from "./routes/workflows";
import { startupsRouter } from "./routes/startups/index";
import { auditLogsRouter } from "./routes/auditLogs";
import { chatsRouter } from "./routes/chats";
import { configRouter } from "./routes/config";
import { tabularReviewRouter } from "./routes/tabularReview";
import { portfolioRouter } from "./routes/portfolioMonitoring";
import { userRouter } from "./routes/user";
import { describeLlmConfig } from "./lib/llm/providers";
import { validateLlmLive } from "./lib/llm/validateLlm";
import { checkWatchmanHealth } from "./lib/screening/watchman";
import { startRescreenScheduler } from "./lib/portfolio/rescreenScheduler";
import { disconnectDb } from "./lib/infra/db";
import { startupDocumentDownloadRouter } from "./routes/documents/startupDocumentDownload";
import { requireAuth } from "./middleware/requireAuth";
import {
  assistantChatLimiter,
  screenerChatLimiter,
} from "./lib/infra/chatRateLimits";
import { desktopToken } from "./middleware/desktopToken";
import { aiControlCenterRouter } from "./routes/aiControlCenter";
import { desktopDataRouter } from "./routes/desktopData";
import { startFolderWatcher } from "./lib/infra/folderWatch";
import { fileDownloadRouter } from "./lib/infra/fileStorage";
import { connectDb } from "./lib/infra/db";

const app = express();
const PORT = process.env.PORT ?? 3001;
const isProduction = process.env.NODE_ENV === "production";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function minutes(value: number): number {
  return value * 60 * 1000;
}

const generalLimiter = rateLimit({
  windowMs: minutes(envInt("RATE_LIMIT_GENERAL_WINDOW_MINUTES", 15)),
  max: envInt("RATE_LIMIT_GENERAL_MAX", 300),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: { detail: "Too many requests. Please try again later." },
});

const screenLimiter = rateLimit({
  windowMs: minutes(15),
  max: 20,
  message: { detail: "Too many screening requests. Please try again later." },
});

app.disable("x-powered-by");
app.set("trust proxy", false); // loopback desktop API — no reverse proxy

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: isProduction
      ? { maxAge: 15552000, includeSubDomains: true }
      : false,
    referrerPolicy: { policy: "no-referrer" },
  }),
);

// The desktop token (below) is the real gate; CORS just admits the app's own
// origin and loopback dev servers, whose ports change every launch.
const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
app.use(
  cors({
    origin: (origin, cb) =>
      cb(null, !origin || origin === process.env.FRONTEND_URL || origin === "capscreen://app" || LOOPBACK_ORIGIN.test(origin)),
    credentials: true,
  }),
);

app.use(desktopToken);
app.use(generalLimiter);
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));

app.post("/api/screen", screenLimiter);
app.use("/api/screen", screenRouter);

// Separate per-user rate buckets — screener and assistant do not share limits.
app.use("/api/chat", requireAuth, screenerChatLimiter, chatRouter);
app.use("/chat", requireAuth, assistantChatLimiter, assistantChatRouter);

app.use("/workflows", workflowsRouter);
app.use("/single-documents", singleDocumentsRouter);
app.use("/projects", projectsRouter);
app.use("/projects", projectDocumentsRouter);

app.use("/api/startups", startupsRouter);
app.use("/api/documents", startupDocumentDownloadRouter);
app.use("/api/chats", chatsRouter);
app.use("/api/audit-logs", auditLogsRouter);
app.use("/api/config", configRouter);
app.use("/api/portfolio", portfolioRouter);
app.use("/tabular-review", tabularReviewRouter);
app.use("/api/ai", requireAuth, aiControlCenterRouter);
app.use("/api/desktop", requireAuth, desktopDataRouter);
app.use("/api/files", fileDownloadRouter);
app.use("/user", userRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

// 404 — must come after all route registrations
app.use((_req, res) => {
  res.status(404).json({ detail: "Not found" });
});

// Global error handler — the 4-arg signature is what tells Express this is an error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;

  // Respect status codes carried on the error (http-errors / body-parser style)
  const rawStatus = (err as Record<string, unknown>)?.status ?? (err as Record<string, unknown>)?.statusCode;
  const status: number =
    typeof rawStatus === "number" && rawStatus >= 400 && rawStatus < 600
      ? rawStatus
      : err instanceof SyntaxError
        ? 400
        : 500;

  if (status >= 500) {
    console.error(err);
  }

  const message =
    isProduction && status >= 500
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : "An error occurred";

  res.status(status).json({ detail: message });
});

// Loopback only: the API is for this machine's CapScreen window, never the network.
const HOST = process.env.HOST ?? "127.0.0.1";

const server = app.listen(Number(PORT), HOST, () => {
  console.log(`Backend running on http://${HOST}:${PORT}`);
  // Open the local database before the first request and so the TTL sweeper runs.
  void connectDb();
  logRagStartupWarnings();
  logWebSearchStartupWarnings();
  const agentLlm = describeLlmConfig().roles.agent;
  console.log(`LLM: ${agentLlm ? `${agentLlm.provider}/${agentLlm.model}${agentLlm.local ? " (local)" : ""}` : "not configured"}`);
  console.log("IC memo: POST /api/startups/:id/ic-memo");
  void validateLlmLive();
  void checkWatchmanHealth();
  startRescreenScheduler();
  startFolderWatcher();
});

function shutdown(signal: string): void {
  console.log(`${signal} received — starting graceful shutdown`);

  // Force-exit if drain takes too long (e.g. hung keep-alive or SSE stream)
  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 10_000);
  // Don't let this timer alone keep the process alive
  forceExit.unref();

  server.close(() => {
    disconnectDb()
      .then(() => {
        clearTimeout(forceExit);
        process.exit(0);
      })
      .catch((err) => {
        console.error("Error closing local database:", err);
        process.exit(1);
      });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
