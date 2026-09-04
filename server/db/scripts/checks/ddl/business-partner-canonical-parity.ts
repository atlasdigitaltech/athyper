#!/usr/bin/env tsx

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type RelationKind = "table" | "view";
type Disposition =
  "canonical" | "canonical_clean_build_only" | "compatibility_view" | "retired";

interface DispositionConfig {
  schemaVersion: number;
  scope: { schemas: string[]; namePattern: string };
  compatibilityViews: string[];
  retiredRelations: string[];
  requiredTypedRequestRelations: string[];
  requiredMigrationParityRelations: string[];
}

interface RelationOccurrence {
  kind: RelationKind;
  source: string;
}

interface InventoryEntry {
  relation: string;
  disposition: Disposition;
  canonicalKind: RelationKind | null;
  canonicalSources: string[];
  migrationSources: string[];
}

const databaseRoot = resolve(import.meta.dirname, "../../..");
const dispositionPath = resolve(
  databaseRoot,
  "ddl/planes/neon/business-partner-ddl-disposition.v1.json",
);
const inventoryPath = resolve(
  databaseRoot,
  "ddl/planes/neon/business-partner-ddl-inventory.generated.json",
);

const readManifest = async (path: string): Promise<string[]> =>
  (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

const relationCreates = (
  sql: string,
  source: string,
  config: DispositionConfig,
): Map<string, RelationOccurrence> => {
  const result = new Map<string, RelationOccurrence>();
  const schemas = config.scope.schemas.join("|");
  const expression = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?(TABLE|VIEW)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?((${schemas})\\.([a-z0-9_]+))`,
    "gi",
  );
  const namePattern = new RegExp(config.scope.namePattern, "i");
  for (const match of sql.matchAll(expression)) {
    const relation = match[2]!.toLowerCase();
    if (namePattern.test(relation.split(".")[1]!)) {
      result.set(relation, {
        kind: match[1]!.toLowerCase() as RelationKind,
        source,
      });
    }
  }
  return result;
};

const mergeOccurrences = (
  target: Map<string, RelationOccurrence[]>,
  additions: Map<string, RelationOccurrence>,
): void => {
  for (const [relation, occurrence] of additions) {
    target.set(relation, [...(target.get(relation) ?? []), occurrence]);
  }
};

const loadSources = async (
  entries: string[],
  base: string,
  config: DispositionConfig,
): Promise<Map<string, RelationOccurrence[]>> => {
  const relations = new Map<string, RelationOccurrence[]>();
  for (const entry of entries) {
    const sql = await readFile(resolve(base, entry), "utf8");
    mergeOccurrences(relations, relationCreates(sql, entry, config));
  }
  return relations;
};

const config = JSON.parse(
  await readFile(dispositionPath, "utf8"),
) as DispositionConfig;
const canonicalEntries = await readManifest(
  resolve(databaseRoot, "ddl/planes/neon/_manifest.txt"),
);
const migrationEntries = await readManifest(
  resolve(databaseRoot, "migrations/manifests/neon.txt"),
);
const canonical = await loadSources(
  canonicalEntries,
  resolve(databaseRoot, "ddl"),
  config,
);
const migrations = await loadSources(
  migrationEntries,
  resolve(databaseRoot, "migrations"),
  config,
);
const migrationSql = (
  await Promise.all(
    migrationEntries.map((entry) =>
      readFile(resolve(databaseRoot, "migrations", entry), "utf8"),
    ),
  )
).join("\n");

const compatibilityViews = new Set(config.compatibilityViews);
const retiredRelations = new Set(config.retiredRelations);
const failures: string[] = [];
const allRelations = [
  ...new Set([...canonical.keys(), ...migrations.keys()]),
].sort();
const inventory: InventoryEntry[] = allRelations.map((relation) => {
  const canonicalOccurrences = canonical.get(relation) ?? [];
  const migrationOccurrences = migrations.get(relation) ?? [];
  const canonicalKind = canonicalOccurrences.at(-1)?.kind ?? null;
  let disposition: Disposition;

  if (compatibilityViews.has(relation)) {
    disposition = "compatibility_view";
    if (canonicalKind !== "view") {
      failures.push(
        `${relation} is declared as compatibility but is not a canonical view`,
      );
    }
  } else if (canonicalKind === "table") {
    disposition =
      migrationOccurrences.length > 0
        ? "canonical"
        : "canonical_clean_build_only";
  } else if (retiredRelations.has(relation)) {
    disposition = "retired";
    const leaf = relation.split(".")[1]!;
    if (
      !new RegExp(
        `DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:document|master)\\.${leaf}\\b`,
        "i",
      ).test(migrationSql)
    ) {
      failures.push(
        `${relation} is declared retired without an active DROP TABLE`,
      );
    }
  } else if (canonicalKind === "view") {
    disposition = "canonical_clean_build_only";
  } else {
    disposition = "retired";
    failures.push(
      `${relation} exists only in migration history and has no explicit disposition`,
    );
  }

  return {
    relation,
    disposition,
    canonicalKind,
    canonicalSources: canonicalOccurrences.map(({ source }) => source),
    migrationSources: migrationOccurrences.map(({ source }) => source),
  };
});

for (const relation of retiredRelations) {
  if (canonical.get(relation)?.some(({ kind }) => kind === "table")) {
    failures.push(`${relation} is retired but remains a canonical table`);
  }
}

const canonicalLayers = [
  "03_tables.sql",
  "05_constraints.sql",
  "06_indexes.sql",
  "08_triggers.sql",
  "10_rls.sql",
  "11_grants.sql",
].map((file) => resolve(databaseRoot, "ddl/planes/neon/document", file));
const layerSql = await Promise.all(
  canonicalLayers.map((path) => readFile(path, "utf8")),
);
const functionSql = await readFile(
  resolve(databaseRoot, "ddl/planes/neon/document/07_functions.sql"),
  "utf8",
);
for (const relation of config.requiredTypedRequestRelations) {
  const tableName = relation.split(".")[1]!;
  if (canonical.get(relation)?.at(-1)?.kind !== "table") {
    failures.push(`${relation} is absent from canonical tables`);
  }
  for (const [index, sql] of layerSql.entries()) {
    if (!sql.includes(tableName)) {
      failures.push(`${relation} is absent from ${canonicalLayers[index]}`);
    }
  }
}
for (const relation of config.requiredMigrationParityRelations) {
  if (canonical.get(relation)?.at(-1)?.kind !== "table") {
    failures.push(`${relation} is absent from canonical tables`);
  }
  if (!migrations.has(relation)) {
    failures.push(`${relation} has no supported-upgrade migration source`);
  }
}
for (const column of [
  "extension_mode",
  "extension_fingerprint",
  "extension_counts",
]) {
  if (!layerSql[0]!.includes(column)) {
    failures.push(`document.business_partner_request is missing ${column}`);
  }
}
for (const functionName of [
  "fn_business_partner_payload_has_restricted_key",
  "trg_guard_business_partner_request_payload_boundary",
  "trg_guard_business_partner_request_extension",
]) {
  if (!functionSql.includes(`FUNCTION document.${functionName}`)) {
    failures.push(`canonical function ${functionName} is missing`);
  }
}

const output = `${JSON.stringify(
  {
    schemaVersion: config.schemaVersion,
    generatedFrom: {
      canonicalManifest: "ddl/planes/neon/_manifest.txt",
      migrationManifest: "migrations/manifests/neon.txt",
      disposition: "ddl/planes/neon/business-partner-ddl-disposition.v1.json",
    },
    counts: inventory.reduce<Record<Disposition, number>>(
      (counts, entry) => ({
        ...counts,
        [entry.disposition]: counts[entry.disposition] + 1,
      }),
      {
        canonical: 0,
        canonical_clean_build_only: 0,
        compatibility_view: 0,
        retired: 0,
      },
    ),
    relations: inventory,
  },
  null,
  2,
)}\n`;

if (process.argv.includes("--write")) {
  await writeFile(inventoryPath, output, "utf8");
  process.stdout.write(`WROTE ${inventoryPath}\n`);
} else {
  let current = "";
  try {
    current = await readFile(inventoryPath, "utf8");
  } catch {
    failures.push(
      "generated Business Partner DDL inventory is missing; run with --write",
    );
  }
  if (current !== output) {
    failures.push(
      "generated Business Partner DDL inventory is stale; run with --write",
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `PASS ${inventory.length} Business Partner relations have an explicit canonical disposition\n`,
  );
  process.stdout.write(
    "PASS typed request relations cover every canonical DDL layer\n",
  );
}
