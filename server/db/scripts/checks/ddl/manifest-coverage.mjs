// Every .sql under ddl/ must be installed by a plane manifest, directly or through a
// psql \ir include reachable from a manifest entry. Unreferenced files are silently
// skipped by the foundation runner, so an orphan is a fresh-build gap.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";

const ddl = resolve(import.meta.dirname, "../../../ddl");
const PLANES = ["studio", "neon", "mesh"];
const errors = [];

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name))
      : entry.name.endsWith(".sql")
        ? [join(dir, entry.name)]
        : [],
  );

const reached = new Set();
const visit = (file, via) => {
  if (reached.has(file)) return;
  if (!existsSync(file)) {
    errors.push(`Missing SQL referenced by ${via}: ${relative(ddl, file)}`);
    return;
  }
  reached.add(file);
  for (const line of readFileSync(file, "utf8").split(/\r?\n/u)) {
    const include = line.match(/^\s*\\ir\s+(.+?)\s*$/u);
    if (include)
      visit(
        resolve(dirname(file), include[1].replace(/^["']|["']$/gu, "")),
        relative(ddl, file),
      );
  }
};

for (const plane of PLANES) {
  const manifest = `planes/${plane}/_manifest.txt`;
  const lines = readFileSync(resolve(ddl, manifest), "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  for (const line of lines) visit(resolve(ddl, line), manifest);
}

for (const file of walk(ddl).sort())
  if (!reached.has(file))
    errors.push(`Orphan SQL not installed by any plane manifest: ${relative(ddl, file)}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`DDL manifest coverage OK: ${reached.size} SQL files reachable.`);
