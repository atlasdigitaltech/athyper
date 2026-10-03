import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
const script = fileURLToPath(new URL("../../prisma/fix-prisma-relations.py", import.meta.url));
function repair(source: string) {
  return execFileSync("python3", ["-c", `import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('repair',sys.argv[1])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
print(module.fix_text(json.load(sys.stdin)),end='')`, script], { input: JSON.stringify(source), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}
test("relation repair tolerates spacing and edits only the owning model", () => {
  const source = "model unrelated {\n  tenant_profile    tenant_profile?\n}\nmodel letterhead {\n    tenant_profile       tenant_profile?\n}\n";
  const fixed = repair(source);
  assert.ok(fixed.startsWith("model unrelated {\n  tenant_profile    tenant_profile?"));
  assert.ok(fixed.includes("    tenant_profile       tenant_profile[]"));
  assert.equal(repair(fixed), fixed);
});
test("unexpected relation type and FK direction fail instead of silently succeeding", () => {
  for (const field of ["tenant_profile String?", "tenant_profile tenant_profile? @relation(fields: [id], references: [id])"])
    assert.throws(() => repair(`model letterhead {\n  ${field}\n}\n`), /unexpected back-reference shape/);
});
test("relation renaming preserves owning foreign keys", () => {
  const source = "model production_order {\n  bom snapshot_bom @relation(fields: [id], references: [id])\n}\nmodel item {\n  bom snapshot_bom[]\n}\n";
  assert.equal(repair(source), source.replace("  bom snapshot_bom[]", "  snapshot_bom snapshot_bom[]"));
});

test("renamed back-references require reconciliation instead of silently skipping the repair", () => {
  assert.throws(() => repair("model letterhead {\n  renamed_profile tenant_profile?\n}\n"), /unexpected back-reference field name/);
});
