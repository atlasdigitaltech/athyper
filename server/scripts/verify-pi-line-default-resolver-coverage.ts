import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const serviceRoot = join(root, "packages", "services");

const INSERT_PATTERNS = [
  /INSERT\s+INTO\s+document\.purchase_invoice_line/i,
  /insertInto\(\s*["']document\.purchase_invoice_line["']\s*\)/i,
];

const DEFAULT_CALL = /applyPurchaseInvoiceLineDefaults\s*\(/;

const ALLOWED_PATH_PARTS = [
  `${sep}__tests__${sep}`,
  `${sep}_fixtures${sep}`,
];

const offenders: string[] = [];

for (const file of walk(serviceRoot)) {
  if (!file.endsWith(".ts")) continue;
  if (ALLOWED_PATH_PARTS.some((part) => file.includes(part))) continue;

  const text = readFileSync(file, "utf8");
  if (!INSERT_PATTERNS.some((pattern) => pattern.test(text))) continue;
  if (DEFAULT_CALL.test(text)) continue;

  offenders.push(relative(root, file).replaceAll("\\", "/"));
}

if (offenders.length > 0) {
  console.error([
    "Purchase invoice line default resolver coverage failed.",
    "Files that insert document.purchase_invoice_line must call applyPurchaseInvoiceLineDefaults in the same writer path:",
    ...offenders.map((file) => `  - ${file}`),
  ].join("\n"));
  process.exit(1);
}

console.log("PI line default resolver coverage OK");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      yield* walk(path);
    } else if (stat.isFile()) {
      yield path;
    }
  }
}
