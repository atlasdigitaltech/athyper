import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readCiBuildArtifacts } from "./ci-build-artifacts.mjs";

test("validates a clean layout with entrypoints and no old process artifacts", (t) => {
  const root = mkdtempSync(join(tmpdir(), "host-build-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const plane of ["neon", "studio", "mesh"])
    write(`apps/${plane}/.next/BUILD_ID`, "build-id");
  for (const role of ["api", "worker", "scheduler"])
    write(
      `server/apps/platform-host/dist/entrypoints/${role}.js`,
      "await launchHost();",
    );
  assert.equal(readCiBuildArtifacts(root).length, 6);
  write("server/apps/platform-host/dist/entrypoints/worker.js", "");
  assert.throws(() => readCiBuildArtifacts(root), /worker.js is empty/);
  rmSync(join(root, "server/apps/platform-host/dist/entrypoints/worker.js"));
  write(
    "server/apps/platform-host/dist/processes/worker/index.js",
    "stale build",
  );
  assert.throws(
    () => readCiBuildArtifacts(root),
    /ENOENT.*entrypoints\/worker.js/,
  );
  function write(path, text) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
});
