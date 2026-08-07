import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { renderTypographyCss } from "./typography";

const outFile = join(dirname(fileURLToPath(import.meta.url)), "typography.generated.css");

writeFileSync(outFile, `${renderTypographyCss()}\n`);
