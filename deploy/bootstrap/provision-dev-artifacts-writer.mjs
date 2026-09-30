#!/usr/bin/env node
// Adds only the v6 writer pair to an existing DEV installation; never rotates secrets.
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(
  process.env.ATHYPER_RUNTIME_ROOT || join(homedir(), ".athyper"),
);
const instance = process.argv[2] ?? "dev";
if (!["dev", "qa"].includes(instance) || process.argv.length > 3)
  throw new Error("Use provision-dev-artifacts-writer.mjs [dev|qa]");
const directory = join(root, "instances", instance, "secrets");
if (!existsSync(directory))
  throw new Error(
    "Existing instance secrets directory required; use fresh bootstrap for a new installation",
  );
const names = [
  "objectstorage-artifacts-writer-access-key",
  "objectstorage-artifacts-writer-secret-key",
];
const lock = join(directory, ".artifacts-writer-provision.lock");
mkdirSync(lock, { mode: 0o700 });
try {
  const present = names.map((name) => existsSync(join(directory, name)));
  if (present.some(Boolean) && !present.every(Boolean))
    throw new Error(
      "Incomplete writer pair: reconcile it before provisioning; no secrets changed",
    );
  if (present.every(Boolean)) {
    for (const name of names) {
      if (!readFileSync(join(directory, name), "utf8").trim())
        throw new Error("Empty writer secret; no secrets rotated");
      chmodSync(join(directory, name), 0o600);
    }
    console.log("Existing instance artifacts writer pair preserved");
  } else {
    for (const [index, name] of names.entries())
      writeFileSync(
        join(lock, name),
        randomBytes(index === 0 ? 10 : 32).toString("hex") + "\n",
        { mode: 0o600, flag: "wx" },
      );
    // A crash between renames is detected as an incomplete pair on the next run.
    for (const name of names)
      renameSync(join(lock, name), join(directory, name));
    console.log(
      "Instance artifacts writer pair provisioned; re-run objectstorage-init before starting applications",
    );
  }
} finally {
  rmSync(lock, { recursive: true, force: true });
}
