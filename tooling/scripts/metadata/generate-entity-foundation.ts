import { labelCommandContract } from "../../../server/packages/contracts/meta-entity-authoring/src/label-commands.js";
import {
  requiredReferenceTables,
  referenceFoundationGates,
} from "../../../server/packages/contracts/meta-entity-authoring/src/reference-foundation-manifest.js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  contractJsonSchema,
  ownedLabelsContract,
  ownedLabelMappings,
  foundationManifest,
} from "../../../server/packages/contracts/meta-entity-authoring/src/foundation-contract.js";
const root = new URL("../../../", import.meta.url);
const schema = contractJsonSchema(ownedLabelsContract);
const sourcePaths = [
  "metadata/entities/common/reference/country/localization.json",
  "metadata/entities/common/reference/state_region/definition.json",
] as const;
const fixtureSources = sourcePaths.map((path) => ({
  path,
  sha256: createHash("sha256")
    .update(readFileSync(new URL(path, root)))
    .digest("hex"),
  scope: path.endsWith("localization.json")
    ? "whole-localization-resource"
    : "explicit-labels-only-synthetic-fixture",
}));
const generated = {
  manifest: foundationManifest,
  referenceInventory: {
    tables: requiredReferenceTables,
    gates: referenceFoundationGates,
  },
  fixtureSources,
  schema,
  commandSchema: contractJsonSchema(labelCommandContract),
  mappings: ownedLabelMappings,
  rootMappings: {defaultLocale:"metadata.entity_change_set.default_locale",requiredLocales:"metadata.entity_change_set.required_locales"},
};
const hash = createHash("sha256")
  .update(JSON.stringify(generated))
  .digest("hex");
const output =
  JSON.stringify({ contractHash: hash, ...generated }, null, 2) + "\n";
const target = new URL(
  "server/packages/contracts/meta-entity-authoring/src/foundation.generated.json",
  root,
);
const doc = new URL("docs/blueprints/entity-studio/blueprint.md", root);
const start = "<!-- entity-foundation:generated:start -->";
const end = "<!-- entity-foundation:generated:end -->";
const rows = Object.entries(ownedLabelMappings).flatMap(([branch, mapping]) =>
  Object.entries(mapping.columns).map(
    ([property, column]) =>
      `| ${branch}.${property} | ${mapping.table}.${column} |`,
  ),
);
const block = `${start}\nGenerated F0 owned-label sub-slice; contract hash: \`${hash}\`. This is generated contract evidence; database application and host qualification are recorded separately below the implementation evidence. It does not establish full-reference qualification or publication.\n\n| API property | Target column |\n| --- | --- |\n${rows.join("\n")}\n${end}`;
const before = readFileSync(doc, "utf8");
if (before.split(start).length !== 2 || before.split(end).length !== 2)
  throw Error("FOUNDATION_DOCUMENT_MARKERS_INVALID");
const after =
  before.slice(0, before.indexOf(start)) +
  block +
  before.slice(before.indexOf(end) + end.length);
if (process.argv.includes("--write")) {
  writeFileSync(target, output);
  writeFileSync(doc, after);
} else {
  for (const [url, expected] of [
    [target, output],
    [doc, after],
  ] as const) {
    let actual: string;
    try {
      actual = readFileSync(url, "utf8");
    } catch {
      throw Error(`FOUNDATION_GENERATED_MISSING: ${fileURLToPath(url)}`);
    }
    if (actual !== expected)
      throw Error(
        `FOUNDATION_GENERATED_DRIFT: ${fileURLToPath(url)}; run pnpm entity:foundation:generate`,
      );
  }
}
console.log(
  `Entity foundation generated contract ${hash}: ${process.argv.includes("--write") ? "written" : "verified"}`,
);
