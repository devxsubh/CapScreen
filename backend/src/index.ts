import "./loadEnv";
import { createApp } from "./app";
import { logRagStartupWarnings } from "./lib/rag/embed";
import { logWebSearchStartupWarnings } from "./lib/infra/webSearchConfig";
import { describeLlmConfig } from "./lib/llm/providers";
import { validateLlmLive } from "./lib/llm/validateLlm";
import { checkWatchmanHealth } from "./lib/screening/watchman";
import { startRescreenScheduler } from "./modules/portfolio/rescreen.service";
import { connectDb, disconnectDb } from "./lib/infra/db";
import { startFolderWatcher } from "./lib/infra/folderWatch";

const app = createApp();
const PORT = process.env.PORT ?? 3001;

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
