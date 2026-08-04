#!/usr/bin/env node
// Wrapper for `prisma db pull` that sets PRISMA_TARGET so prisma.config.ts
// picks the right DATABASE_URL for the requested plane.
//
// Usage (via package.json):
//   node scripts/prisma-pull.mjs --target=neon  --schema src/prisma/schema.prisma
//   node scripts/prisma-pull.mjs --target=mesh  --schema src/prisma/schema.mesh.prisma
//   node scripts/prisma-pull.mjs --target=admin --schema src/prisma/schema.admin.prisma
import { spawnSync } from "node:child_process";

const targetArg = process.argv.find((a) => a.startsWith("--target="));
const target = targetArg ? targetArg.split("=")[1] : "neon";
const remainingArgs = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--target="));

const result = spawnSync(
  "pnpm",
  ["exec", "prisma", "db", "pull", ...remainingArgs],
  {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      CHECKPOINT_DISABLE: process.env.CHECKPOINT_DISABLE ?? "1",
      PRISMA_TARGET: target,
    },
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
