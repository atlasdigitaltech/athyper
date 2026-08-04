import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
const violations = [];

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      inspect(path);
      continue;
    }
    if (![".ts", ".tsx"].includes(extname(entry.name))) continue;
    const source = readFileSync(path, "utf8");
    const checks = [
      [/(?:style|dangerouslySetInnerHTML)\s*=/, "inline styling or HTML injection"],
      [/(?:#(?:[0-9a-f]{3}){1,2}|rgb\(|hsl\()/i, "hard-coded color"],
      [/[a-z-]+-\[[^\]]+\]/, "arbitrary utility value"],
      [/\b(?:bg|text|border)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/, "palette utility instead of semantic token"],
    ];
    for (const [pattern, label] of checks) {
      if (pattern.test(source)) violations.push(`${path}: ${label}`);
    }
  }
}

inspect(sourceRoot);

if (violations.length) {
  throw new Error(`Meta Entity Studio theme policy failed:\n${violations.join("\n")}`);
}

process.stdout.write("Meta Entity Studio theme policy passed.\n");
