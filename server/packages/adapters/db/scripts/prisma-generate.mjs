#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "pnpm",
  ["exec", "prisma", "generate", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      CHECKPOINT_DISABLE: process.env.CHECKPOINT_DISABLE ?? "1",
    },
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
