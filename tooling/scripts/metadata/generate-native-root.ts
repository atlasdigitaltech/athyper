import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  nativeRootMember,
  nativeRootSchema,
} from "../../../server/packages/contracts/meta-entity-authoring/src/native-root-contract.js";
const root = new URL("../../../", import.meta.url);
// Owned-label locale columns have already been declared by their independent slice.
const base = readFileSync(
  new URL("server/db/ddl/planes/studio/metadata/03_tables.sql", root),
  "utf8",
);
const body = base.match(
  /CREATE TABLE metadata\.entity_change_set \(([\s\S]*?)\n\);/,
)?.[1];
if (!body) throw Error("NATIVE_ROOT_BASE_DDL_MISSING");
const columns = Object.fromEntries(
  Object.entries(nativeRootMember.columns).map(([key, c]) => [
    key,
    {
      ...c,
      existing:
        ["default_locale", "required_locales"].includes(c.column) ||
        new RegExp("^    " + c.column + " +", "m").test(body),
    },
  ]),
);
const added = Object.values(columns).filter((c) => !c.existing);
const descriptor = {
  schema: "entity.authoring-native-root-descriptor/1",
  columns,
  jsonSchema: nativeRootSchema(),
  limitations: [
    "typed enrollment shape only; registered descriptor and baseline ownership require independent evidence",
    "nullable dormant columns; no legacy root enrollment, grants, native guard or cutover",
    "existing revision, governance and independent-review controls remain authoritative",
  ],
};
const contractHash = createHash("sha256")
  .update(JSON.stringify(descriptor))
  .digest("hex");
const sql =
  "-- GENERATED dormant native authoring root columns. Not enrollment or cutover.\n" +
  added
    .map(
      (c) =>
        `ALTER TABLE metadata.entity_change_set ADD COLUMN ${c.column} ${c.sqlType};`,
    )
    .join("\n") +
  "\nALTER TABLE metadata.entity_change_set ADD CONSTRAINT entity_change_set_native_pending_ck CHECK (" +
  added.map((c) => c.column + " IS NULL").join(" AND ") +
  ");\n";
const blueprintPath = "docs/blueprints/entity-studio/blueprint.md";
const blueprint = readFileSync(new URL(blueprintPath, root), "utf8");
const start = "<!-- native-root:generated:start -->",
  end = "<!-- native-root:generated:end -->";
if (blueprint.split(start).length !== 2 || blueprint.split(end).length !== 2)
  throw Error("NATIVE_ROOT_DOCUMENT_MARKERS_INVALID");
const block =
  start +
  "\nGenerated native root component contract hash: `" +
  contractHash +
  "`. " +
  Object.keys(columns).length +
  " typed properties; " +
  added.length +
  " dormant additions. Source shape is not enrollment or deployed qualification.\n" +
  end;
const document =
  blueprint.slice(0, blueprint.indexOf(start)) +
  block +
  blueprint.slice(blueprint.indexOf(end) + end.length);
for (const [path, content] of [
  [blueprintPath, document],
  [
    "server/packages/contracts/meta-entity-authoring/src/native-root.generated.json",
    JSON.stringify({ contractHash, ...descriptor }, null, 2) + "\n",
  ],
  ["server/db/ddl/planes/studio/metadata/29_native_root.generated.sql", sql],
]) {
  const target = new URL(path, root);
  if (process.argv.includes("--write")) writeFileSync(target, content);
  else if (readFileSync(target, "utf8") !== content)
    throw Error("NATIVE_ROOT_GENERATED_DRIFT: " + path);
}
console.log(
  "Native root contract " +
    contractHash +
    (process.argv.includes("--write") ? " written" : " verified"),
);
