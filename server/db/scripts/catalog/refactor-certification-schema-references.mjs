import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const roots = [
  "server/db/ddl/planes/neon/master",
  "server/db/seed",
  "server/db/scripts",
  "server/packages",
  "config/governance",
];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".json", ".prisma", ".md"]);
// Neon owns certification as tenant master data. Mesh has a separate
// account-scoped projection under the existing mesh schema. This refactor only
// targets Neon/runtime sources; Mesh desired-state DDL is authored separately.
const replacements = [
  [/\bcertification\.certification_type\b/g, "master.certification_type"],
  [/\bcertification\.certification\b/g, "master.certification"],
];

async function filesUnder(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "generated") continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(child));
    else if (extensions.has(extname(entry.name))) files.push(child);
  }
  return files;
}

let changed = 0;
for (const root of roots) {
  for (const file of await filesUnder(resolve(root))) {
    const before = await readFile(file, "utf8");
    let after = before;
    for (const [pattern, replacement] of replacements) {
      after = after.replace(pattern, replacement);
    }
    if (after !== before) {
      await writeFile(file, after);
      changed += 1;
    }
  }
}

console.log(`Updated certification schema references in ${changed} files.`);
