import { config } from "dotenv";
import path from "path";

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

// Launched by the desktop shell: all configuration arrives via the environment
// and model keys come from the AI Control Center — never read a developer .env.
if (!process.env.CAPSCREEN_DESKTOP_TOKEN) {
  /** Monorepo root `.env` — single source of truth for `pnpm dev`. */
  config({ path: path.join(repoRoot, ".env") });
  config({ path: path.join(repoRoot, ".env.local"), override: true });

  /** Optional per-package overrides (legacy); prefer editing root `.env`. */
  config({ path: path.join(backendRoot, ".env"), override: true });
  config({ path: path.join(backendRoot, ".env.local"), override: true });
}
