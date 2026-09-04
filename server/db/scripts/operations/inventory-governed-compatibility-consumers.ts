#!/usr/bin/env tsx
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
const args = new Map(
    process.argv.slice(2).map((value) => {
      const [key, ...rest] = value.split("=");
      return [key, rest.join("=") || "true"];
    }),
  ),
  root = resolve(import.meta.dirname, "../../../.."),
  output = args.get("--output");
if (!output || args.get("--confirm") !== "RECORD-G6-CONSUMER-INVENTORY")
  throw new Error(
    "--output and --confirm=RECORD-G6-CONSUMER-INVENTORY are required",
  );
const target = resolve(root, output);
if (!target.startsWith(resolve(root, "docs/architecture/reports/g6") + "/"))
  throw new Error("output must be under docs/architecture/reports/g6");
const roots = ["apps", "packages", "server/apps", "server/packages"],
  extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql"]),
  patterns: Record<string, RegExp[]> = {
    business_partner_request_family: [
      /\bdocument\.business_partner_request(?:_[a-z_]+)?\b/iu,
    ],
    business_partner_aliases_cache: [
      /\b(?:business_partner|bp)\.aliases\b/iu,
      /\b(?:INSERT\s+INTO|UPDATE)\s+master\.business_partner\b[^;]{0,1000}\baliases\b/isu,
    ],
    flattened_decision_scope: [
      /\b(?:qualification|preference|designation|review)\.(?:operating_organization_id|company_code_id|commodity_capability_id|commodity_category_id)\b/iu,
      /\bSELECT\s+(?:\*|(?:qualification|preference|designation|review)\.\*)\s+FROM\s+control\.(?:business_partner_qualification|supplier_preference_designation|customer_account_designation|customer_credit_review)\b/iu,
      /\bFROM\s+control\.(?:business_partner_qualification|supplier_preference_designation|customer_account_designation|customer_credit_review)\s+WHERE\b[^;`]{0,1200}\b(?:operating_organization_id|company_code_id|commodity_capability_id|commodity_category_id)\b/isu,
      /\bFROM\s+control\.(?:business_partner_qualification|supplier_preference_designation|customer_account_designation|customer_credit_review)\s+value\b[^;`]{0,1200}\bvalue\.(?:operating_organization_id|company_code_id|commodity_capability_id|commodity_category_id)\b/isu,
      /\bINSERT\s+INTO\s+control\.(?:business_partner_qualification|supplier_preference_designation|customer_account_designation|customer_credit_review)\s*\([^)]*\b(?:operating_organization_id|company_code_id|commodity_capability_id|commodity_category_id)\b/isu,
    ],
    workforce_iam_projection: [/\bworkforce_iam_projection\b/iu],
    business_partner_person_group_compatibility: [
      /\bperson_business_partner_legacy_link\b/iu,
      /partner_category[^;`]{0,500}\b(?:person|group)\b/isu,
    ],
    temporary_implementation_inventory: [
      /governed-entity-lifecycle-implementation-inventory\.md/iu,
    ],
  };
const files: string[] = [];
async function walk(path: string) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === ".next" ||
      entry.name === "__tests__"
    )
      continue;
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) await walk(child);
    else if (extensions.has(extname(entry.name))) files.push(child);
  }
}
for (const path of roots) await walk(resolve(root, path));
const results = [];
for (const [surfaceCode, expressions] of Object.entries(patterns)) {
  const runtime: string[] = [],
    nonRuntime: Array<{ file: string; classification: string }> = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (!expressions.some((expression) => expression.test(source))) continue;
    const path = relative(root, file),
      classification = /(?:^|\/)generated(?:\/|$)/u.test(path)
        ? "generated_type"
        : /\.(?:test|spec)\.[^.]+$/u.test(path)
          ? "test_source"
          : "runtime_candidate";
    if (classification === "runtime_candidate") runtime.push(path);
    else nonRuntime.push({ file: path, classification });
  }
  runtime.sort();
  nonRuntime.sort((a, b) => a.file.localeCompare(b.file));
  results.push({
    surfaceCode,
    referenceFileCount: runtime.length + nonRuntime.length,
    activeConsumerFileCount: runtime.length,
    files: runtime,
    nonRuntimeReferenceFiles: nonRuntime,
  });
}
const report = {
  schemaVersion: 2,
  kind: "athyper.g6-compatibility-consumer-inventory",
  capturedAt: new Date().toISOString(),
  scope: roots,
  excluded: [
    "**/__tests__/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "docs",
    "server/db/ddl",
    "server/db/migrations",
  ],
  classification: {
    runtime_candidate:
      "Direct compatibility-coordinate reference in deployable source; requires owner review or cutover.",
    test_source:
      "Test-only reference; retained as evidence but not counted as an active production consumer.",
    generated_type:
      "Generated database shape; regenerate after migration and do not count as a production reader.",
  },
  results,
};
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
for (const result of results)
  process.stdout.write(
    `G6_CONSUMER_USAGE ${result.surfaceCode} runtime=${result.activeConsumerFileCount} total_references=${result.referenceFileCount}\n`,
  );
