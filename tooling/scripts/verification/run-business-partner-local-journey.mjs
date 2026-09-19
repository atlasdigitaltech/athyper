#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const slice = process.argv.find((arg) => arg.startsWith("--slice="))?.slice(8);
const commands = {
  v1: "test:e2e:bp-v1-009",
  r2: "test:e2e:bp-r2",
  r3: "test:e2e:bp-r3",
};
if (!Object.hasOwn(commands, slice))
  throw new Error("Use --slice=v1, --slice=r2 or --slice=r3");
const coordinates = JSON.parse(
  readFileSync(
    `node_modules/.cache/bp-qualification/${slice}-environment.json`,
    "utf8",
  ),
);
if (
  Object.entries(coordinates).some(
    ([key, value]) =>
      !key.startsWith("PLAYWRIGHT_") || typeof value !== "string",
  )
)
  throw new Error(
    "Fixture file must contain only Playwright environment strings",
  );
if (
  new URL(coordinates.PLAYWRIGHT_BASE_URL).hostname !== "neon.dev.athyper.test"
)
  throw new Error("Local acceptance runner requires the dev target");
const child = spawn("pnpm", [commands[slice], "--workers=1", "--retries=0"], {
  env: { ...process.env, ...coordinates },
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
