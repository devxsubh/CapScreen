/**
 * Interactive MongoDB reset for interview / clean-slate prep.
 *
 * Modes:
 *   1) Complete erase — empty every collection (including users)
 *   2) Interview prep — keep users + NexaFlow demo sample data only
 *
 * Collections and indexes are preserved; only documents are deleted.
 *
 * Usage:
 *   cd backend && npx tsx scripts/reset-database.ts
 *   cd backend && npx tsx scripts/reset-database.ts --mode full --confirm "ERASE ALL"
 *   cd backend && npx tsx scripts/reset-database.ts --mode interview --confirm "KEEP DEMO"
 */
import { createInterface } from "readline";
import { config } from "dotenv";
import { resolve } from "path";
import { connectDb, disconnectDb } from "../src/lib/infra/db";
import {
  countAllDocuments,
  eraseAllData,
  eraseExceptUsersAndDemo,
  findDemoStartupIds,
  printResetSummary,
  type ResetMode,
} from "./lib/resetDatabase";
import { DEMO_STARTUP_NAME } from "./lib/seedDemoShowcase";

config({ path: resolve(__dirname, "../../.env") });

const FULL_CONFIRM = "ERASE ALL";
const INTERVIEW_CONFIRM = "KEEP DEMO";

function parseArgs(argv: string[]): {
  mode?: ResetMode;
  confirm?: string;
  help: boolean;
} {
  let mode: ResetMode | undefined;
  let confirm: string | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--mode" && argv[i + 1]) {
      const v = argv[++i].toLowerCase();
      if (v === "1" || v === "full") mode = "full";
      else if (v === "2" || v === "interview") mode = "interview";
      else throw new Error(`Unknown mode: ${v} (use full or interview)`);
    } else if (arg === "--confirm" && argv[i + 1]) {
      confirm = argv[++i];
    }
  }

  return { mode, confirm, help };
}

function ask(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function chooseMode(): Promise<ResetMode | null> {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              CapScreen — MongoDB Reset Tool                  ║
╚══════════════════════════════════════════════════════════════╝

This script deletes DOCUMENTS only. Collections, schemas, and indexes stay.

Select a mode:

  1) Complete erase
     Delete ALL data in every collection (including users and auth tokens).
     Use before a totally fresh deploy or empty Atlas cluster.

  2) Interview prep
     Keep registered users + seeded demo workspace only:
       • Users (login accounts)
       • "${DEMO_STARTUP_NAME}"
       • Demo CSVs, screening, tabular reviews, docs
     Delete everything else (test startups, stray chats, sessions).

  3) Cancel
`);

  const answer = await ask("Enter choice [1/2/3]: ");
  if (answer === "1") return "full";
  if (answer === "2") return "interview";
  if (answer === "3" || answer.toLowerCase() === "cancel") return null;
  console.error("Invalid choice.");
  return null;
}

async function printPreview(mode: ResetMode): Promise<void> {
  await connectDb();
  try {
    const counts = await countAllDocuments();
    const total = counts.reduce((n, c) => n + c.count, 0);
    console.log(`\nCurrent database: ${total} document(s) across ${counts.length} collection(s).`);

    if (mode === "interview") {
      const demoIds = await findDemoStartupIds();
      console.log(`\nDemo startups to KEEP: ${demoIds.length}`);
      for (const id of demoIds) {
        console.log(`  • ${id}  (${DEMO_STARTUP_NAME})`);
      }
      if (demoIds.length === 0) {
        console.log(
          `  ⚠ None found. Run "pnpm run seed:demo" after reset if you need sample data.`,
        );
      }
      console.log("\nWill DELETE: all other startups, chats, reviews, sessions, uploads.");
      console.log("Will KEEP:    users collection (all accounts).");
    } else {
      console.log("\nWill DELETE: every document in every collection.");
    }
  } finally {
    await disconnectDb();
  }
}

async function confirmMode(mode: ResetMode, preset?: string): Promise<boolean> {
  const expected = mode === "full" ? FULL_CONFIRM : INTERVIEW_CONFIRM;
  if (preset !== undefined) {
    return preset === expected;
  }

  console.log("");
  const typed = await ask(
    mode === "full"
      ? `Type ${FULL_CONFIRM} to permanently delete ALL data: `
      : `Type ${INTERVIEW_CONFIRM} to delete test data (users + demo kept): `,
  );
  return typed === expected;
}

async function main() {
  const { mode: modeArg, confirm, help } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log(`Usage: npx tsx scripts/reset-database.ts [options]

Options:
  --mode full|interview|1|2   Skip interactive mode menu
  --confirm "<phrase>"        Skip confirmation prompt
                              full: "${FULL_CONFIRM}"
                              interview: "${INTERVIEW_CONFIRM}"
  --help                      Show this help
`);
    process.exit(0);
  }

  const mode = modeArg ?? (await chooseMode());
  if (!mode) {
    console.log("Cancelled.");
    process.exit(0);
  }

  const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/vc-screener";
  const safeUri = uri.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
  console.log(`\nTarget: ${safeUri}`);

  await printPreview(mode);

  const ok = await confirmMode(mode, confirm);
  if (!ok) {
    console.log("\nConfirmation failed — no changes made.");
    process.exit(1);
  }

  console.log("\nResetting…");
  await connectDb();
  let result;
  try {
    result =
      mode === "full"
        ? await eraseAllData()
        : await eraseExceptUsersAndDemo();
  } finally {
    await disconnectDb();
  }

  printResetSummary(mode, result);
}

main().catch((err) => {
  console.error("\nReset failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
