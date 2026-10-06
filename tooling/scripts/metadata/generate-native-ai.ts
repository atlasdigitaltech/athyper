import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  nativeAiMembers,
  nativeAiSchema,
} from "../../../server/packages/contracts/meta-entity-authoring/src/native-ai-contract.js";
import { nativeAiDdl } from "../../../server/packages/contracts/meta-entity-authoring/src/native-ai-ddl.js";
import { referenceDdlStatus } from "./reference-ddl-status.js";
const root = new URL("../../../", import.meta.url);
const descriptor = {
  schema: "entity.authoring-native-ai-descriptor/1",
  members: nativeAiMembers,
  jsonSchema: nativeAiSchema(),
  limitations: [
    "component only; native graph enrollment and atomic persistence pending",
    "vocabulary and registered-collection adapters unavailable",
    "no provider installation, record-read authorization, product-write or deployed qualification",
  ],
};
const contractHash = createHash("sha256")
  .update(JSON.stringify(descriptor))
  .digest("hex");
const doc = new URL("docs/blueprints/entity-studio/blueprint.md", root);
const before = readFileSync(doc, "utf8"),
  start = "<!-- native-ai:generated:start -->",
  end = "<!-- native-ai:generated:end -->";
if (before.split(start).length !== 2 || before.split(end).length !== 2)
  throw Error("NATIVE_AI_DOCUMENT_MARKERS_INVALID");
const block =
  start +
  "\nGenerated AI component contract; hash: " +
  contractHash +
  ". Canonical target DDL exists; deployment, graph enrollment and cutover remain unqualified.\n\n| Family | Table | Properties |\n| --- | --- | --- |\n" +
  Object.entries(nativeAiMembers)
    .map(
      ([k, d]) =>
        `| ${k} | metadata.${d.table} | ${Object.keys(d.columns).length} |`,
    )
    .join("\n") +
  "\n" +
  end;
const ddlDirectory = new URL("server/db/ddl/planes/studio/metadata/", root);
const ddlPath =
  "server/db/ddl/planes/studio/metadata/27_native_ai.generated.sql";
const sources = readdirSync(ddlDirectory)
  .filter((p) => p.endsWith(".sql") && p !== "27_native_ai.generated.sql")
  .map((p) => ({
    path: "server/db/ddl/planes/studio/metadata/" + p,
    sql: readFileSync(new URL(p, ddlDirectory), "utf8"),
  }));
sources.push({ path: ddlPath, sql: nativeAiDdl() });
const after = referenceDdlStatus(
  before.slice(0, before.indexOf(start)) +
    block +
    before.slice(before.indexOf(end) + end.length),
  sources,
  Object.values(nativeAiMembers).map((d) => d.table),
);
const targets = [
  [
    new URL(
      "server/packages/contracts/meta-entity-authoring/src/native-ai.generated.json",
      root,
    ),
    JSON.stringify({ contractHash, ...descriptor }, null, 2) + "\n",
  ],
  [
    new URL(
      "server/db/ddl/planes/studio/metadata/27_native_ai.generated.sql",
      root,
    ),
    nativeAiDdl(),
  ],
  [doc, after],
] as const;
for (const [file, expected] of targets)
  if (process.argv.includes("--write")) writeFileSync(file, expected);
  else if (readFileSync(file, "utf8") !== expected)
    throw Error("NATIVE_AI_GENERATED_DRIFT: " + fileURLToPath(file));
console.log(
  "Native AI contract " +
    contractHash +
    ": " +
    (process.argv.includes("--write") ? "written" : "verified"),
);
