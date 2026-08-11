#!/usr/bin/env node
// Wrapper for `prisma db pull` that selects the right DATABASE_URL per plane
// and passes it directly via --url (avoids requiring a local prisma install).
//
// Usage (via package.json):
//   node scripts/prisma-pull.mjs --target=neon   --schema src/prisma/schema.neon.prisma --force
//   node scripts/prisma-pull.mjs --target=mesh   --schema src/prisma/schema.mesh.prisma --force
//   node scripts/prisma-pull.mjs --target=studio --schema src/prisma/schema.studio.prisma --force
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 6 levels up from scripts/ reaches the monorepo root (athyper/).
const PRISMA_CLI = resolve(
  __dirname,
  "../../../../../../node_modules/.pnpm/node_modules/prisma/build/index.js"
);

const targetArg = process.argv.find((a) => a.startsWith("--target="));
const target = targetArg ? targetArg.split("=")[1] : "neon";
const schemaArgs = process.argv.slice(2).filter((a) => !a.startsWith("--target="));

const url = (() => {
  if (target === "studio") {
    return (
      process.env.ATHYPER_PLATFORM_DATABASE_URL ??
      process.env.DATABASE_ADMIN_URL ??
      null
    );
  }
  if (target === "mesh") {
    return process.env.MESH_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
  }
  return process.env.DATABASE_URL ?? null;
})();

if (!url) {
  console.error(`[prisma-pull] No database URL found for target="${target}". Set DATABASE_URL / MESH_DATABASE_URL / ATHYPER_PLATFORM_DATABASE_URL.`);
  process.exit(1);
}

// NODE_PATH pointing to the pnpm hoisted store so prisma.config.ts can resolve 'prisma/config' if present.
const PNPM_HOISTED = resolve(__dirname, "../../../../../../node_modules/.pnpm/node_modules");
const nodePath = process.env.NODE_PATH
  ? `${PNPM_HOISTED}${process.platform === "win32" ? ";" : ":"}${process.env.NODE_PATH}`
  : PNPM_HOISTED;

const result = spawnSync(
  process.execPath,
  [PRISMA_CLI, "db", "pull", "--url", url, ...schemaArgs],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CHECKPOINT_DISABLE: process.env.CHECKPOINT_DISABLE ?? "1",
      NODE_PATH: nodePath,
    },
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
