import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const canonicalPath = resolve(root, "ddl/common/document/03_foundation_tables.sql");
const planePaths = ["neon", "mesh", "studio"].map(plane => resolve(root, `ddl/planes/${plane}/document/03_tables.sql`));
const tableNames = [
  "attachment_series", "attachment", "attachment_folder", "attachment_link",
  "comment", "comment_draft", "comment_feed_cursor", "comment_mention", "comment_reaction",
  "content_item", "content_item_link", "attachment_legal_hold", "attachment_legal_hold_event",
  "attachment_derivative",
];
const write = process.argv.includes("--write");

function tableBlock(source, name) {
  const marker = `CREATE TABLE document.${name} (`;
  const start = source.indexOf(marker);
  if (start < 0) return null;
  let depth = 0, quote = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "'" && source[index - 1] !== "\\") quote = !quote;
    if (quote) continue;
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0 && char === ";") return { start, end: index + 1, text: source.slice(start, index + 1) };
  }
  throw new Error(`Unterminated document.${name} definition`);
}

function removeBlocks(source) {
  const blocks = tableNames.map(name => tableBlock(source, name)).filter(Boolean).sort((a, b) => b.start - a.start);
  let result = source;
  for (const block of blocks) result = `${result.slice(0, block.start)}${result.slice(block.end)}`;
  return result.replace(/\n{4,}/g, "\n\n\n");
}

let canonical;
try {
  canonical = await readFile(canonicalPath, "utf8");
} catch (error) {
  if (!write || error?.code !== "ENOENT") throw error;
  const source = await readFile(planePaths[0], "utf8");
  const blocks = tableNames.map(name => {
    const block = tableBlock(source, name);
    if (!block) throw new Error(`Canonical source is missing document.${name}`);
    return block.text;
  });
  canonical = `-- Generated canonical attachment, content, and collaboration foundation.\n-- Run: node scripts/checks/ddl/sync-document-foundation.mjs --write\n\n${blocks.join("\n\n")}\n`;
  await writeFile(canonicalPath, canonical);
}

for (const name of tableNames) {
  if (!tableBlock(canonical, name)) throw new Error(`Canonical foundation is missing document.${name}`);
}
for (const path of planePaths) {
  const source = await readFile(path, "utf8");
  const found = tableNames.filter(name => tableBlock(source, name));
  if (!found.length) continue;
  if (!write) throw new Error(`${path} duplicates canonical tables: ${found.join(", ")}`);
  await writeFile(path, removeBlocks(source));
}

process.stdout.write("Document foundation is canonical across neon, mesh, and studio.\n");
