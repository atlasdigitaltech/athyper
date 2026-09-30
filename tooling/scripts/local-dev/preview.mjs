#!/usr/bin/env node
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
const root = join(homedir(), ".athyper/instances/dev/workspace/preview");
const action = process.argv[2];
if (process.argv.length !== 3 || !["status", "reset"].includes(action))
  throw new Error("Use pnpm dev:preview status|reset");
if (!existsSync(root))
  throw new Error("Initialize the personal DEV preview first");
if (action === "status")
  console.log(
    JSON.stringify(
      readdirSync(root)
        .filter((name) => /^[a-f0-9]{64}\.status\.json$/.test(name))
        .map((name) => JSON.parse(readFileSync(join(root, name), "utf8"))),
      null,
      2,
    ),
  );
else {
  const epoch = randomUUID(),
    history = join(root, `reset-${Date.now()}-${epoch}`);
  mkdirSync(history, { mode: 0o700 });
  const tmp = join(root, `epoch-${epoch}.tmp`);
  writeFileSync(tmp, epoch, { mode: 0o600, flag: "wx" });
  renameSync(tmp, join(root, "epoch"));
  for (const name of readdirSync(root).filter((name) =>
    /^[a-f0-9]{64}\.(active|status)\.json$/.test(name),
  ))
    renameSync(join(root, name), join(history, name));
  console.log(
    "Local preview returned to its signed baseline. Authoring drafts, release records and keys were preserved.",
  );
}
