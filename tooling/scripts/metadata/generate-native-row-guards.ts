import { readFileSync, writeFileSync } from "node:fs";
import { nativeRowGuardsDdl } from "../../../server/packages/contracts/meta-entity-authoring/src/native-row-guards.js";

const target = new URL(
  "../../../server/db/ddl/planes/studio/metadata/33_native_typed_row_guards.generated.sql",
  import.meta.url,
);
const expected = nativeRowGuardsDdl();
if (process.argv.includes("--write")) writeFileSync(target, expected);
else if (readFileSync(target, "utf8") !== expected)
  throw Error("NATIVE_ROW_GUARDS_GENERATED_DRIFT");
console.log("Native typed row guards verified; cutover remains separate");
