import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  nativeOperationMember,
  nativeOperationSchema,
  nativeOperationNode,
} from "../../../server/packages/contracts/meta-entity-authoring/src/native-operation-contract.js";
import { contractJsonSchema } from "../../../server/packages/contracts/meta-entity-authoring/src/foundation-contract.js";
const root = new URL("../../../", import.meta.url);
const ddl = readFileSync(
  new URL("server/db/ddl/planes/studio/metadata/03_tables.sql", root),
  "utf8",
);
const body = ddl.match(
  /CREATE TABLE metadata\.entity_operation \(([\s\S]*?)\n\);/,
)?.[1];
if (!body) throw Error("NATIVE_OPERATION_BASE_DDL_MISSING");
const declarations = Object.fromEntries(
  Object.entries(nativeOperationMember.columns).map(([p, c]) => [
    p,
    {
      ...c,
      baseDeclaration:
        body.match(new RegExp("^    " + c.column + " +([^\\n]+)", "m"))?.[1] ??
        null,
    },
  ]),
);
const added = Object.values(declarations).filter(
  (c) => c.baseDeclaration === null,
);
const constraints = [...body.matchAll(/CONSTRAINT ([a-z_0-9]+)/g)].map(
  (m) => m[1],
);
const descriptor = {
  schema: "entity.authoring-native-operation-descriptor/1",
  columns: declarations,
  jsonSchema: nativeOperationSchema(),
  clientSchema: contractJsonSchema(nativeOperationNode(true)),
  clientPatchSchema: contractJsonSchema(nativeOperationNode(true, true)),
  baseConstraints: constraints,
  limitations: [
    "not native graph enrollment or operation commands",
    "existing protected-state persistence and initialization policy remain independent",
    "requiresPreflight derived from installed contract; absent while unresolved",
    "target/effect V1 compatibility excludes new/navigation/reveal",
    "no constraint retirement, cutover, product write or publication authority",
  ],
};
const contractHash = createHash("sha256")
  .update(JSON.stringify(descriptor))
  .digest("hex");
const sql =
  "-- GENERATED target-only additive operation columns. NOT a cutover migration; legacy constraints remain.\n" +
  added
    .map(
      (c) =>
        `ALTER TABLE metadata.entity_operation ADD COLUMN ${c.column} ${c.sqlType};`,
    )
    .join("\n") +
  "\nALTER TABLE metadata.entity_operation ADD CONSTRAINT entity_operation_native_pending_ck CHECK(" +
  added.map((c) => c.column + " IS NULL").join(" AND ") +
  ");\n";
const doc = new URL("docs/blueprints/entity-studio/blueprint.md", root),
  before = readFileSync(doc, "utf8"),
  start = "<!-- native-operation:generated:start -->",
  end = "<!-- native-operation:generated:end -->";
if (before.split(start).length !== 2 || before.split(end).length !== 2)
  throw Error("NATIVE_OPERATION_DOCUMENT_MARKERS_INVALID");
const block =
  start +
  "\nGenerated operation component contract hash: " +
  contractHash +
  ". " +
  Object.keys(declarations).length +
  " properties, " +
  added.length +
  " dormant target additions; no deployed qualification. Service-derived preflight and protected-state initialization remain separately governed.\n" +
  end;
let after =
  before.slice(0, before.indexOf(start)) +
  block +
  before.slice(before.indexOf(end) + end.length);
const heading = "### `metadata.entity_operation`",
  offset = after.indexOf(heading),
  next = after.indexOf("\n### ", offset + heading.length);
if (offset < 0 || next < 0) throw Error("NATIVE_OPERATION_DICTIONARY_INVALID");
const section = after.slice(offset, next),
  status =
    "**DDL status:** existing base table; " +
    added.length +
    " target additions declared in server/db/ddl/planes/studio/metadata/28_native_operation.generated.sql behind a pending check. Source presence is not applied cutover or qualification; base types/constraints require recorded retain/replace/retire dispositions.";
if ((section.match(/^\*\*DDL status:\*\*/gm) ?? []).length !== 1)
  throw Error("NATIVE_OPERATION_DICTIONARY_STATUS_INVALID");
after =
  after.slice(0, offset) +
  section.replace(/^\*\*DDL status:\*\*[^\n]*/m, status) +
  after.slice(next);
for (const [path, expected] of [
  [
    new URL(
      "server/packages/contracts/meta-entity-authoring/src/native-operation.generated.json",
      root,
    ),
    JSON.stringify({ contractHash, ...descriptor }, null, 2) + "\n",
  ],
  [
    new URL(
      "server/db/ddl/planes/studio/metadata/28_native_operation.generated.sql",
      root,
    ),
    sql,
  ],
  [doc, after],
] as const) {
  if (process.argv.includes("--write")) writeFileSync(path, expected);
  else if (readFileSync(path, "utf8") !== expected)
    throw Error("NATIVE_OPERATION_GENERATED_DRIFT: " + fileURLToPath(path));
}
console.log(
  "Native operation contract " +
    contractHash +
    ": " +
    (process.argv.includes("--write") ? "written" : "verified"),
);
