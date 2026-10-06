import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  nativeStructuralMembers,
  nativeStructuralSchema,
} from "../../../server/packages/contracts/meta-entity-authoring/src/native-structural-contract.js";
const root = new URL("../../../", import.meta.url);
const ddl = readFileSync(
  new URL("server/db/ddl/planes/studio/metadata/03_tables.sql", root),
  "utf8",
);
const mappings = Object.fromEntries(
  Object.entries(nativeStructuralMembers).map(([family, d]) => {
    const body = ddl.match(
      new RegExp(`CREATE TABLE metadata\\.${d.table} \\(([\\s\\S]*?)\\n\\);`),
    )?.[1];
    if (!body) throw Error(`NATIVE_STRUCTURAL_DDL_TABLE_MISSING: ${d.table}`);
    const columns = Object.fromEntries(
      Object.entries(d.columns).map(([property, c]) => {
        const declaration = body
          .match(new RegExp(`^    ${c.column} +([^\\n]+)`, "m"))?.[1]
          ?.replace(/,$/, "")
          .trim();
        if (!declaration)
          throw Error(
            `NATIVE_STRUCTURAL_DDL_COLUMN_MISSING: ${d.table}.${c.column}`,
          );
        return [property, { column: c.column, ddlDeclaration: declaration }];
      }),
    );
    return [
      family,
      {
        table: `metadata.${d.table}`,
        columns,
        required: d.required,
        unique: d.unique,
        ...(d.order ? { order: d.order } : {}),
      },
    ];
  }),
);
const generated = {
  schema: "entity.authoring-native-structural-descriptor/1",
  positionConvention: "one-based",
  families: Object.keys(nativeStructuralMembers),
  jsonSchema: nativeStructuralSchema(),
  mappings,
  compiler: {
    schema: "entity.native-structural-compilation/1",
    weight: "validated numeric(6,3) string -> bounded runtime number",
    targetEntityCode: "derived from independent target key evidence",
  },
  limitations: [
    "not a whole-graph contract",
    "no field/runtime/surface blob qualification",
    "no permission or protected-state initialization",
    "no publication or host qualification",
  ],
};
const hash = createHash("sha256")
  .update(JSON.stringify(generated))
  .digest("hex");
const output =
  JSON.stringify({ contractHash: hash, ...generated }, null, 2) + "\n";
const target = new URL(
  "server/packages/contracts/meta-entity-authoring/src/native-structural.generated.json",
  root,
);
const doc = new URL("docs/blueprints/entity-studio/blueprint.md", root);
const start = "<!-- native-structural:generated:start -->";
const end = "<!-- native-structural:generated:end -->";
const block = `${start}\nGenerated scalar native-family contract; hash: \`${hash}\`. These seven families already use relational columns. This is component contract/codec/compiler evidence, not full native-graph or publication qualification.\n\n| Family | Table | Properties |\n| --- | --- | --- |\n${Object.entries(
  nativeStructuralMembers,
)
  .map(
    ([family, d]) =>
      `| ${family} | metadata.${d.table} | ${Object.keys(d.columns).length} |`,
  )
  .join("\n")}\n${end}`;
const before = readFileSync(doc, "utf8");
if (before.split(start).length !== 2 || before.split(end).length !== 2)
  throw Error("NATIVE_STRUCTURAL_DOCUMENT_MARKERS_INVALID");
const after =
  before.slice(0, before.indexOf(start)) +
  block +
  before.slice(before.indexOf(end) + end.length);
if (process.argv.includes("--write")) {
  writeFileSync(target, output);
  writeFileSync(doc, after);
} else
  for (const [url, expected] of [
    [target, output],
    [doc, after],
  ] as const)
    if (readFileSync(url, "utf8") !== expected)
      throw Error(`NATIVE_STRUCTURAL_GENERATED_DRIFT: ${fileURLToPath(url)}`);
console.log(
  `Native structural generated contract ${hash}: ${process.argv.includes("--write") ? "written" : "verified"}`,
);
