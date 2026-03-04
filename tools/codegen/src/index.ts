#!/usr/bin/env node
/**
 * athyper-codegen CLI entry point
 *
 * Runs prisma generate to produce Kysely type definitions
 * from the Prisma schema in framework/adapters/db.
 *
 * Usage:
 *   pnpm codegen         - Run once
 *   pnpm codegen:watch   - Watch schema.prisma for changes
 */

import {
  DB_DIR,
  SCHEMA_PATH,
  run,
} from "./lib.js";

const args = new Set(process.argv.slice(2));
const WATCH = args.has("--watch");

async function mainOnce(): Promise<void> {
  console.log("\n[Athyper] Running prisma generate...");
  await run("pnpm", ["prisma", "generate"], { cwd: DB_DIR });
  console.log("\n[Athyper] Done: Kysely types regenerated.");
}

async function main(): Promise<void> {
  if (!WATCH) {
    await mainOnce();
  } else {
    console.log(`[Athyper] Watch mode: ${SCHEMA_PATH}`);
    await mainOnce();

    const fsWatch = await import("node:fs");
    let timer: NodeJS.Timeout | null = null;
    fsWatch.watch(SCHEMA_PATH, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        mainOnce().catch((e) => console.error(e));
      }, 250);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
