import { artifactDirectory } from "../artifact-paths.mjs";
const outputDirectory = artifactDirectory("ci-integrity");
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { readCiBuildArtifacts } from "./ci-build-artifacts.mjs";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const artifacts = readCiBuildArtifacts(root);
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  resolve(outputDirectory, "build.json"),
  JSON.stringify(
    {
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      artifacts,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Verified ${artifacts.length} nonempty build artifacts for the three clients and server processes.`,
);
