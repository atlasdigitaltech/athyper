#!/usr/bin/env node
// Wrapper for `prisma db pull` that selects the right DATABASE_URL per plane
// and passes it directly via --url (avoids requiring a local prisma install).
//
// Owned by @athyper/server-db. Run from server/db (via package.json scripts):
//   node prisma/prisma-pull.mjs --target=neon   --schema prisma/schema.neon.prisma --force
//   node prisma/prisma-pull.mjs --target=mesh   --schema prisma/schema.mesh.prisma --force
//   node prisma/prisma-pull.mjs --target=studio --schema prisma/schema.studio.prisma --force
// (or: `pnpm run db:codegen:pull:{neon,mesh,studio}` / `pnpm run db:codegen:sync`.)
import { spawnSync, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);

// Resolve the prisma CLI entrypoint. `prisma` is a direct devDependency of
// @athyper/server-db, so require.resolve finds it via the workspace install.
// Fall back to a global npm install.
function resolvePrismaCli() {
  try {
    return require.resolve("prisma/build/index.js");
  } catch {}
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
    const globalPath = resolve(globalRoot, "prisma/build/index.js");
    if (existsSync(globalPath)) return globalPath;
  } catch {}
  throw new Error("Cannot locate prisma/build/index.js — run `pnpm install` at the repo root, or install prisma globally.");
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

// NODE_PATH: add the node_modules that holds prisma + global npm so a
// prisma.config.ts (if introduced) can resolve 'prisma/config'.
const sep = process.platform === "win32" ? ";" : ":";
// PRISMA_CLI is <node_modules>/prisma/build/index.js → <node_modules> is 3 up.
const prismaNodeModules = resolve(dirname(PRISMA_CLI), "../../..");
const extraPaths = [prismaNodeModules].filter(existsSync);
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
