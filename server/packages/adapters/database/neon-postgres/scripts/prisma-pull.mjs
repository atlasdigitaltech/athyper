#!/usr/bin/env node
// Wrapper for `prisma db pull` that selects the right DATABASE_URL per plane
// and passes it directly via --url (avoids requiring a local prisma install).
//
// Usage (via package.json):
//   node scripts/prisma-pull.mjs --target=neon   --schema src/prisma/schema.neon.prisma --force
//   node scripts/prisma-pull.mjs --target=mesh   --schema src/prisma/schema.mesh.prisma --force
//   node scripts/prisma-pull.mjs --target=studio --schema src/prisma/schema.studio.prisma --force
import { spawnSync, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve prisma CLI: check pnpm hoisted store first, then fall back to global npm.
function resolvePrismaCli() {
  const candidates = [
    // pnpm hoisted store (workspace install)
    resolve(__dirname, "../../../../../../node_modules/.pnpm/node_modules/prisma/build/index.js"),
    // pnpm flat store
    resolve(__dirname, "../../../../../../node_modules/prisma/build/index.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // Fall back to global npm install
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
    const globalPath = resolve(globalRoot, "prisma/build/index.js");
    if (existsSync(globalPath)) return globalPath;
  } catch {}
  throw new Error("Cannot locate prisma/build/index.js — install prisma globally or run pnpm install");
}

const PRISMA_CLI = resolvePrismaCli();

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

// NODE_PATH: add pnpm hoisted store (if present) + global npm so prisma.config.ts can resolve 'prisma/config'.
const sep = process.platform === "win32" ? ";" : ":";
const extraPaths = [
  resolve(__dirname, "../../../../../../node_modules/.pnpm/node_modules"),
  resolve(__dirname, "../../../../../../node_modules"),
].filter(existsSync);
try {
  const globalRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
  extraPaths.push(globalRoot);
} catch {}
const nodePath = [
  ...extraPaths,
  ...(process.env.NODE_PATH ? process.env.NODE_PATH.split(sep) : []),
].join(sep);

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
