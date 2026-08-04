import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const roots = ["server/db/ddl", "server/db/seed", "server/packages", "packages/shared"];
const extensions = new Set([".sql", ".ts", ".tsx", ".md", ".json"]);
const replacements = [
  [/\bmaster\.comment_type\b/g, "document.comment_type"],
  [/\bmaster\.comment_intent\b/g, "document.comment_intent"],
  [/\bmaster\.reaction_type\b/g, "document.reaction_type"],
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
    if (file.endsWith("000_lookup_domains.sql")) {
      after = after.replace(
        /     'is_extensible=true[^\r\n]*\r?\n     'added without DDL\.',/,
        "     'The platform context taxonomy is intentionally not tenant extensible.',",
      );
    }
    if (after !== before) {
      await writeFile(file, after);
      changed += 1;
    }
  }
}
console.log(`Updated collaboration domain codes in ${changed} files.`);
