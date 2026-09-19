import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateMetaEntityRollout,
  type MetaEntityRolloutSnapshot,
} from "./meta-entity-rollout-gate";

const snapshotPath = process.argv.find((arg) => arg.startsWith("--snapshot="))
  ?.slice("--snapshot=".length)
  ?? process.env.META_ENTITY_ROLLOUT_SNAPSHOT;
if (!snapshotPath) {
  throw new Error("Provide --snapshot=<file> or META_ENTITY_ROLLOUT_SNAPSHOT.");
}
const snapshot = JSON.parse(readFileSync(resolve(snapshotPath), "utf8")) as MetaEntityRolloutSnapshot;
const result = evaluateMetaEntityRollout(snapshot);
const outputPath = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
if (outputPath) writeFileSync(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.decision === "STOP") process.exitCode = 1;
