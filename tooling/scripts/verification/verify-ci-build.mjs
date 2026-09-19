import { artifactDirectory } from "../artifact-paths.mjs";
const outputDirectory = artifactDirectory("ci-integrity");
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const paths = [
  ...["neon", "studio", "mesh"].map((plane) => `apps/${plane}/.next/BUILD_ID`),
  ...["api", "worker", "scheduler"].map(
    (process) => `server/apps/platform-host/dist/processes/${process}/index.js`,
  ),
];
const artifacts = paths.map((path) => {
  const bytes = readFileSync(resolve(root, path));
  assert.ok(bytes.length > 0, `${path} is empty`);
  return {
    path,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
});
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
