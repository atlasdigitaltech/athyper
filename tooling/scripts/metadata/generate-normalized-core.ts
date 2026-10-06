import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  normalizedCoreMembers,
  normalizedCoreSchema,
} from "../../../server/packages/contracts/meta-entity-authoring/src/normalized-core-contract.js";
import {
  normalizedLayoutMembers,
  normalizedLayoutSchema,
} from "../../../server/packages/contracts/meta-entity-authoring/src/normalized-layout-contract.js";
import { nativeCoreLayoutCommandSchema } from "../../../server/packages/contracts/meta-entity-authoring/src/native-core-layout-commands.js";
const root = new URL("../../../", import.meta.url);
const ddl = readFileSync(
  new URL("server/db/ddl/planes/studio/metadata/03_tables.sql", root),
  "utf8",
);
const families = Object.fromEntries(
  Object.entries({ ...normalizedCoreMembers, ...normalizedLayoutMembers }).map(
    ([kind, member]) => {
      const body = ddl.match(
        new RegExp(
          `CREATE TABLE metadata\\.${member.table} \\(([\\s\\S]*?)\\n\\);`,
        ),
      )?.[1];
      if (!body)
        throw new Error(
          `NORMALIZED_CORE_EXISTING_TABLE_MISSING: ${member.table}`,
        );
      return [
        kind,
        {
          table: `metadata.${member.table}`,
          columns: Object.fromEntries(
            Object.entries(member.columns).map(([property, c]) => {
              const declaration =
                body
                  .match(new RegExp(`^    ${c.column} +([^\\n]+)`, "m"))?.[1]
                  ?.replace(/,$/, "")
                  .trim() ?? null;
              return [
                property,
                {
                  column: c.column,
                  targetSqlType: c.sqlType,
                  reference: "reference" in c ? c.reference : null,
                  serviceOwned: c.serviceOwned,
                  baseDdlDeclaration: declaration,
                  status: declaration
                    ? "existing-column-requires-cutover-review"
                    : "supplemental-column-pending-native-cutover",
                },
              ];
            }),
          ),
          // Every existing constraint needs its own retain/replace/retire disposition.
          // This inventory deliberately does not auto-classify or drop constraints.
          existingConstraints: Array.from(
            body.matchAll(/CONSTRAINT\s+([a-zA-Z0-9_]+)/g),
            (m) => m[1],
          ),
        },
      ];
    },
  ),
);
const anchors = [
  "24_reference_members.generated.sql",
  "25_reference_member_guards.sql",
]
  .map((file) =>
    readFileSync(
      new URL("server/db/ddl/planes/studio/metadata/" + file, root),
      "utf8",
    ),
  )
  .join("\n");
// Schema preparation is deliberately dormant. Keep each pre-existing column and
// legacy constraint intact. No native member value is admitted until a separate
// reviewed cutover replaces these guards together with the canonical writer.
const prepared = Object.entries(families).map(([family, d]) => {
  const columns = Object.values(d.columns).filter(
    (c) =>
      c.baseDdlDeclaration === null &&
      !anchors.includes(`ALTER TABLE ${d.table} ADD COLUMN ${c.column} `),
  );
  return { family, table: d.table, columns };
});
const preparation = [
  "-- Generated from the typed core/layout descriptor. Installation is not cutover qualification.",
  "-- No history conversion, grants, protected-state initialization or legacy constraint relaxation.",
  "SET LOCAL lock_timeout='5s';",
  ...prepared.flatMap((d) => [
    ...d.columns.map(
      (c) =>
        `ALTER TABLE ${d.table} ADD COLUMN ${c.column} ${c.targetSqlType};`,
    ),
    `ALTER TABLE ${d.table} ADD CONSTRAINT ${d.table.replace("metadata.", "")}_native_pending_ck CHECK (num_nonnulls(${d.columns.map((c) => c.column).join(",")}) = 0);`,
    `COMMENT ON CONSTRAINT ${d.table.replace("metadata.", "")}_native_pending_ck ON ${d.table} IS 'Native core/layout values remain unavailable until coordinated history-preserving constraint, writer, compiler and governance cutover qualification.';`,
  ]),
  "",
].join("\n");
const preparationTarget = new URL(
  "server/db/ddl/planes/studio/metadata/26_native_column_preparation.generated.sql",
  root,
);
const descriptor = {
  schema: "entity.authoring-normalized-core-layout-descriptor/2",
  jsonSchema: {
    core: normalizedCoreSchema(),
    layout: normalizedLayoutSchema(),
    commands: nativeCoreLayoutCommandSchema(),
  },
  families,
  completeness: {
    rowShape: "closed",
    incompleteDrafts:
      "explicit nullable properties; applicability and paired values still checked",
    semanticValidation: "trusted-context component validation only",
    publication: "unqualified",
    storage: "scoped native repository adapter behind cutover/host admission; not deployed",
  },
  limitations: [
    "not a whole-graph codec or release compiler",
    "existing legacy constraints and required columns still need explicit migration dispositions",
    "component/catalogue context is not installed provider or authorization evidence",
    "no protected-state initialization, product write authority, host enablement or deployed F6/F8/F9 qualification",
  ],
};
const hash = createHash("sha256")
  .update(JSON.stringify(descriptor))
  .digest("hex");
const content =
  JSON.stringify({ contractHash: hash, ...descriptor }, null, 2) + "\n";
const target = new URL(
  "server/packages/contracts/meta-entity-authoring/src/normalized-core.generated.json",
  root,
);
const doc = new URL("docs/blueprints/entity-studio/blueprint.md", root);
const start = "<!-- normalized-core:generated:start -->",
  end = "<!-- normalized-core:generated:end -->";
const block = `${start}\nGenerated target core/layout descriptor hash: \`${hash}\`. Counts describe component contract properties, not deployed coverage. Base CREATE TABLE declarations and the complete existing constraint-name inventory are recorded in \`normalized-core.generated.json\`; each constraint still requires an explicit cutover disposition.\n\n| Family | Target table | Typed properties | Base CREATE TABLE columns | Supplemental columns |\n| --- | --- | --- | --- | --- |\n${Object.entries(
  families,
)
  .map(([k, f]) => {
    const columns = Object.values(f.columns);
    const current = columns.filter((c) => c.baseDdlDeclaration !== null).length;
    return `| ${k} | ${f.table} | ${columns.length} | ${current} | ${columns.length - current} |`;
  })
  .join("\n")}\n${end}`;
const before = readFileSync(doc, "utf8");
if (before.split(start).length !== 2 || before.split(end).length !== 2)
  throw new Error("NORMALIZED_CORE_DOCUMENT_MARKERS_INVALID");
const after =
  before.slice(0, before.indexOf(start)) +
  block +
  before.slice(before.indexOf(end) + end.length);
if (process.argv.includes("--write")) {
  writeFileSync(target, content);
  writeFileSync(preparationTarget, preparation);
  writeFileSync(doc, after);
} else
  for (const [url, expected] of [
    [target, content],
    [preparationTarget, preparation],
    [doc, after],
  ] as const)
    if (readFileSync(url, "utf8") !== expected)
      throw new Error(`NORMALIZED_CORE_GENERATED_DRIFT: ${fileURLToPath(url)}`);
console.log(
  `Normalized core descriptor ${hash}: ${process.argv.includes("--write") ? "written" : "verified"}`,
);
