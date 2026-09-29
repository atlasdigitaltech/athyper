import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const ciBuildArtifactPaths = Object.freeze([
  ...["neon", "studio", "mesh"].map((plane) => `apps/${plane}/.next/BUILD_ID`),
  ...["api", "worker", "scheduler"].map(
    (role) => `server/apps/platform-host/dist/entrypoints/${role}.js`,
  ),
]);

export function readCiBuildArtifacts(root) {
  return ciBuildArtifactPaths.map((path) => {
    const bytes = readFileSync(resolve(root, path));
    assert.ok(bytes.length > 0, `${path} is empty`);
    return {
      path,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
}
