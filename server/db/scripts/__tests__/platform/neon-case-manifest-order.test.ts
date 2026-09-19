import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "../../..");
test("NEON workflow lifecycle definitions survive common foundation loading", () => {
  const manifest = readFileSync(
    resolve(root, "ddl/planes/neon/_manifest.txt"),
    "utf8",
  ).split(/\r?\n/);
  assert.ok(
    manifest.indexOf("planes/neon/document/07_functions.sql") >
      manifest.indexOf("common/document/07_functions.sql"),
  );
  const plane = readFileSync(
    resolve(root, "ddl/planes/neon/document/07_functions.sql"),
    "utf8",
  );
  assert.match(plane, /entity\.case\.validation/);
  assert.match(
    plane,
    /\(p_cycle_run_id IS NULL\)<>\(p_cycle_task_id IS NULL\)/,
  );
  assert.match(plane, /maker-checker/);
});

test("case guards admit governed validation while retaining execution, tenant and actor checks", () => {
  for (const file of [
    "ddl/common/document/07_functions.sql",
    "ddl/planes/neon/document/07_functions.sql",
    "scripts/operations/upgrades/legacy-baseline-20260914/20260912_case_validation_guard.sql",
  ]) {
    const sql = readFileSync(resolve(root, file), "utf8");
    const guard = sql.match(
      /CREATE OR REPLACE FUNCTION document\.trg_guard_entity_case_mutation\(\)[\s\S]*?END \$\$;/,
    )?.[0];
    assert.ok(guard, `Missing mutation guard in ${file}`);
    assert.match(guard, /'entity\.case\.validation'/, file);
    assert.match(guard, /e\.id=execution AND e\.tenant_id=tenant/, file);
    assert.match(guard, /e\.status='processing'/, file);
    assert.match(
      guard,
      /e\.actor_principal_id=master\.current_principal_id_soft\(\)/,
      file,
    );
  }
});
