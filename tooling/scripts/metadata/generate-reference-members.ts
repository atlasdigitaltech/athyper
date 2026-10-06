import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { referenceDdlStatus } from "./reference-ddl-status.js";
import { createHash } from "node:crypto";
import {
  referenceMembers,
  referencePredicateOwners,
  referenceIdentityMapping,
  referenceIdentityContract,
  referenceMemberSchema,
} from "../../../server/packages/contracts/meta-entity-authoring/src/reference-member-contract.js";
import { contractJsonSchema } from "../../../server/packages/contracts/meta-entity-authoring/src/foundation-contract.js";
import { referenceMemberDdl } from "../../../server/packages/contracts/meta-entity-authoring/src/reference-member-ddl.js";
import { referenceCommandSchema } from "../../../server/packages/contracts/meta-entity-authoring/src/reference-commands.js";
const root = new URL("../../../", import.meta.url);
const payload = {
  schema: referenceMemberSchema(),
  commands: referenceCommandSchema(),
  descriptors: referenceMembers,
  stableIdentity: referenceIdentityMapping,
  predicateRootOwners: referencePredicateOwners,
  stableIdentitySchema: contractJsonSchema(referenceIdentityContract),
};
const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
const targets = [
  [
    "server/packages/contracts/meta-entity-authoring/src/reference-members.generated.json",
    JSON.stringify({ contractHash: hash, ...payload }, null, 2) + "\n",
  ],
  [
    "server/db/ddl/planes/studio/metadata/24_reference_members.generated.sql",
    referenceMemberDdl(),
  ],
];
for (const [path, expected] of targets) {
  const url = new URL(path!, root);
  if (process.argv.includes("--write")) writeFileSync(url, expected!);
  else if (readFileSync(url, "utf8") !== expected)
    throw Error("REFERENCE_GENERATED_DRIFT: " + path);
}
const blueprintUrl = new URL(
  "docs/blueprints/entity-studio/blueprint.md",
  root,
);
const blueprint = readFileSync(blueprintUrl, "utf8");
const generatedRows = Object.values(referenceMembers)
  .map(
    (d) =>
      `| metadata.${d.table} | ${Object.keys(d.columns).length} | draft member |`,
  )
  .join("\n");
const region = `<!-- reference-members:generated:start -->\nGenerated reference-member implementation manifest; contract hash: \`${hash}\`. Exact property/column schemas and commands are in reference-members.generated.json; publication/host/live evidence remains separate.\n\n| Table | Selected properties | Ownership |\n| --- | --- | --- |\n${generatedRows}\n| metadata.entity_field_identity | ${Object.keys(referenceIdentityMapping.columns).length} | service-owned catalogue |\n<!-- reference-members:generated:end -->`;
const generatedManifest = blueprint.replace(
  /<!-- reference-members:generated:start -->[\s\S]*?<!-- reference-members:generated:end -->/,
  region,
);
if (generatedManifest === blueprint && !blueprint.includes(region))
  throw Error("REFERENCE_DOCUMENT_MARKER_MISSING");
const ddlDirectory = new URL("server/db/ddl/planes/studio/metadata/", root);
const replacement = referenceDdlStatus(
  generatedManifest,
  readdirSync(ddlDirectory)
    .filter((path) => path.endsWith(".sql"))
    .sort()
    .map((path) => ({
      path: "server/db/ddl/planes/studio/metadata/" + path,
      sql: readFileSync(new URL(path, ddlDirectory), "utf8"),
    })),
  [
    ...Object.values(referenceMembers).map((d) => d.table),
    referenceIdentityMapping.table,
  ],
);
if (process.argv.includes("--write")) writeFileSync(blueprintUrl, replacement);
else if (replacement !== blueprint) throw Error("REFERENCE_DOCUMENT_DRIFT");
console.log("Reference member contract " + hash + " verified");
