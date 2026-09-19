import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const inventory = JSON.parse(
  readFileSync(resolve(root, "server/db/migrations/inventory.json"), "utf8"),
);
// Ledger names remain immutable; only the on-disk source location is resolved.
export function migrationSourcePath(name) {
  if (!/^[a-zA-Z0-9_.-]+\.sql$/.test(name))
    throw new Error(`Invalid migration name: ${name}`);
  const entry = inventory.entries.find(
    (item) => item.originalPath === `migrations/${name}`,
  );
  if (!entry?.path)
    throw new Error(
      `No retained upgrade source for ${name}; use the canonical foundation`,
    );
  return resolve(root, "server/db", entry.path);
}
