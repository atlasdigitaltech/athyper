import { readFileSync } from "node:fs";
import {
  initializeLocalDefinitionPreview,
} from "../../../server/packages/services/publication/src/local-definition-preview.js";
import { localPreviewRoot } from "../../../server/packages/services/publication/src/shared/preview/environment.js";
const root = localPreviewRoot();
if (!root) throw new Error("Explicit local preview environment required");
const revision = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
if (revision.bundleCode !== "business_partner.onboarding")
  throw new Error("Only the BP onboarding slice is supported");
console.log(
  JSON.stringify(await initializeLocalDefinitionPreview(root, revision)),
);
