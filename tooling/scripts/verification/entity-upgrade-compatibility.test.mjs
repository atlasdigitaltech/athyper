import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL(
  "./qualify-entity-upgrade-compatibility.mjs",
  import.meta.url,
);

for (const argument of [
  "--database-url=postgresql://operator@example.invalid/athyper_neon",
  "--container=athyper-dev-db-1",
  "--baseline=undeclared",
]) {
  test(`rejects ${argument.split("=")[0]} before creating artifacts or invoking Docker`, () => {
    const scratch = mkdtempSync(join(tmpdir(), "athyper-compatibility-guard-"));
    const output = join(scratch, "artifacts");
    try {
      const result = spawnSync(process.execPath, [script.pathname, argument], {
        encoding: "utf8",
        timeout: 10_000,
        env: { ...process.env, PATH: scratch, ATHYPER_ARTIFACT_ROOT: output },
      });
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /No database target or other arguments are accepted/,
      );
      assert.equal(existsSync(output), false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
}
