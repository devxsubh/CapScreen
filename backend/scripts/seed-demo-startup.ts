/**
 * Seed a full NexaFlow demo startup into the local database:
 * - Extended cap-table CSV + co-investor / vendor rosters
 * - Live Watchman screening results
 * - Entity tabular review (all graph nodes) + sanctions triage queue
 * - Project documents (DD checklist, IC memo, screening analysis)
 *
 * Prerequisites:
 *   docker compose -f docker-compose.dev.yml up   # Watchman
 *   Data goes to ~/.capscreen (or CAPSCREEN_DATA_DIR — point it at the app's
 *   data folder to seed the desktop app while it is closed)
 *
 * Usage:
 *   cd backend && npx tsx scripts/seed-demo-startup.ts
 *   cd backend && npx tsx scripts/seed-demo-startup.ts --email you@example.com
 *   cd backend && npx tsx scripts/seed-demo-startup.ts --reset
 *   cd backend && npx tsx scripts/seed-demo-startup.ts --dry-run
 */
import { config } from "dotenv";
import { resolve } from "path";
import {
  DEMO_STARTUP_NAME,
  resolveSeedUser,
  seedDemoShowcase,
} from "./lib/seedDemoShowcase";

config({ path: resolve(__dirname, "../../.env") });

function parseArgs(argv: string[]) {
  let email: string | undefined;
  let reset = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--reset") reset = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--email" && argv[i + 1]) {
      email = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npx tsx scripts/seed-demo-startup.ts [options]

Options:
  --email <addr>   Seed for a registered user (default: preview-user)
  --reset          Delete existing "${DEMO_STARTUP_NAME}" for this user first
  --dry-run        Print actions without writing to MongoDB
  --help           Show this help
`);
      process.exit(0);
    }
  }

  return { email, reset, dryRun };
}

async function main() {
  const { email, reset, dryRun } = parseArgs(process.argv.slice(2));

  const { userId, userEmail } = await resolveSeedUser(email);

  console.log(`Seeding demo for user: ${userEmail} (${userId})`);
  if (reset) console.log("--reset: will replace existing demo startup");
  if (dryRun) console.log("--dry-run: no database writes");

  const result = await seedDemoShowcase({
    userId,
    userEmail,
    reset,
    dryRun,
  });

  if (dryRun) {
    console.log("\nDry run complete.");
    return;
  }

  console.log("\n✓ Demo startup seeded successfully\n");
  console.log(`  Startup:        ${DEMO_STARTUP_NAME}`);
  console.log(`  Startup ID:     ${result.startupId}`);
  console.log(`  Tabular review: ${result.entityReviewId} (${result.screening.capTable.totalEntities} rows)`);
  console.log(`  Triage queue:   ${result.triageReviewId}`);
  console.log(`  Screening:      ${result.screening.capTable.flaggedCount} flagged, ${result.screening.capTable.reviewCount} review`);
  console.log("\nOpen the app:");
  console.log(`  /startups/${result.startupId}     — project workspace`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  if (
    err instanceof Error &&
    /watchman|ECONNREFUSED|fetch failed/i.test(err.message)
  ) {
    console.error(
      "\nHint: start Watchman first:\n  docker compose -f docker-compose.dev.yml up",
    );
  }
  process.exit(1);
});
