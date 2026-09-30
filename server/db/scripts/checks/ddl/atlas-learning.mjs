import { writeUpgradeCandidate } from "./upgrade-candidate-output.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
if (process.argv.slice(2).some((arg) => arg !== "--write"))
  throw Error("Only --write is supported");
for (const [label, path] of [
  ["COMMON", "common/ai"],
  ["STUDIO", "planes/studio/ai"],
]) {
  const stages = [
    "03_tables.sql",
    "05_constraints.sql",
    "06_indexes.sql",
    "07_functions.sql",
    "08_triggers.sql",
    "10_rls.sql",
    "11_grants.sql",
  ];
  const blocks = stages.flatMap((stage) => {
    const source = readFileSync(resolve(root, "ddl", path, stage), "utf8");
    const block = source.match(
      new RegExp(
        `-- BEGIN ATLAS F4 LEARNING ${label}\\n([\\s\\S]*?)-- END ATLAS F4 LEARNING ${label}`,
      ),
    );
    return block ? [block[1]] : [];
  });
  const migration = `BEGIN;\nSET LOCAL lock_timeout = '5s';\n${blocks.join("")}COMMIT;\n`;
  if (
    !blocks.length ||
    !migration.includes(
      `CREATE TABLE ai.atlas_learning_${label === "COMMON" ? "candidate" : "inbox"}`,
    )
  )
    throw Error(`Missing canonical learning tables: ${label}`);
  for (const plane of label === "COMMON"
    ? ["neon", "studio", "mesh"]
    : ["studio"]) {
    const manifest = readFileSync(
      resolve(root, `ddl/planes/${plane}/_manifest.txt`),
      "utf8",
    ).split(/\r?\n/);
    for (const stage of stages) {
      const source = readFileSync(resolve(root, "ddl", path, stage), "utf8");
      if (
        source.includes(`-- BEGIN ATLAS F4 LEARNING ${label}`) &&
        !manifest.includes(`${path}/${stage}`)
      )
        throw Error(
          `Canonical learning stage missing: ${plane}/${path}/${stage}`,
        );
    }
  }
  if (process.argv.includes("--write"))
    console.log(
      `Unapplied upgrade candidate: ${writeUpgradeCandidate(`atlas-learning-${label.toLowerCase()}.candidate.sql`, migration)}`,
    );
  console.log(
    `PASS Atlas learning ${label.toLowerCase()} canonical foundation`,
  );
}
