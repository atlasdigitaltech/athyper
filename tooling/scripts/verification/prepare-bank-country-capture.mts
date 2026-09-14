import {
  artifactDirectory,
  collectionReadbackPath,
} from "../artifact-paths.mjs";
const output = artifactDirectory("bank-country-capture", "dev");
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { withBusinessPartnerCollectionPresentations } from "../../../server/db/scripts/provisioning/business-partner-collection-presentations";
import { compileEntityIntakeSurfaces } from "../../../packages/contracts/platform/entity-runtime/src/intake-surface-authoring";
import {
  validateGraph,
  runContractTests,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic";
const graph = withBusinessPartnerCollectionPresentations(
  JSON.parse(readFileSync(collectionReadbackPath(), "utf8")),
);
const validation = validateGraph(graph),
  tests = runContractTests(graph);
if (validation.issues.length || !tests.passed)
  throw Error(JSON.stringify({ validation, tests }));
const bank = compileEntityIntakeSurfaces(graph).find(
  (s) => s.key === "profile_bank",
);
mkdirSync(output, { recursive: true });
writeFileSync(
  `${output}/candidate-surface.json`,
  JSON.stringify(bank, null, 2),
);
console.log(
  JSON.stringify({
    valid: true,
    bankFields: bank?.sections.flatMap((s) => s.fields).length,
  }),
);
