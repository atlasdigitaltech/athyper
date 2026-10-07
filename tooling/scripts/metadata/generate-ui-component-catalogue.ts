import { readFileSync, writeFileSync } from "node:fs";
import { uiComponentCatalogueDdl } from "../../../server/packages/contracts/meta-entity-authoring/src/ui-component-contract.js";
const path = new URL(
  "../../../server/db/ddl/planes/studio/metadata/41_ui_component_catalogue.generated.sql",
  import.meta.url,
);
const ddl = uiComponentCatalogueDdl();
if (process.argv.includes("--write")) writeFileSync(path, ddl);
else if (readFileSync(path, "utf8") !== ddl)
  throw Error("UI_COMPONENT_CATALOGUE_DRIFT");
console.log(
  "UI component catalogue verified; resource installation remains separate",
);
