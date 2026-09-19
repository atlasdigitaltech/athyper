import fs from "node:fs";
import cp from "node:child_process";
import { createHash } from "node:crypto";
const r = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-reset-exact-release.dev.json",
  ),
);
const d = r.source.compiled_json,
  refs = new Map();
for (const o of d.authorization.operations) {
  const a = refs.get(o.permissionCode) || [];
  a.push({ operation: o.key, kind: "target", scope: o.scope });
  refs.set(o.permissionCode, a);
}
for (const t of d.authorizationRuntime.canonicalReadAdmission.transitions) {
  const a = refs.get(t.sourcePermissionCode) || [];
  a.push({ operation: t.operationKey, kind: "source_constraint" });
  refs.set(t.sourcePermissionCode, a);
}
const codes = [...refs.keys()].sort();
const lit = (s) => "'" + s.replaceAll("'", "''") + "'";
function capture(container) {
  const sql = `BEGIN READ ONLY;SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM (SELECT p.canonical_code code,p.permission_kind,p.risk_tier,p.requires_mfa,p.requires_sod,p.is_shareable,p.is_delegable,p.is_overridable,p.status,m.code module_code,(SELECT jsonb_agg(jsonb_build_object('scopeKind',s.scope_kind,'propagation',s.propagation_mode,'status',s.status) ORDER BY s.scope_kind) FROM authz.permission_scope_kind s WHERE s.permission_id=p.id) scopes FROM authz.permission p JOIN control.module m ON m.id=p.module_id WHERE p.canonical_code IN (${codes.map(lit).join(",")})) p;ROLLBACK;`;
  const out = cp.execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
    ],
    { input: sql, encoding: "utf8" },
  );
  return JSON.parse(out.trim());
}
const current = capture("athyper-dev-db-1"),
  reference = capture("athyper-bp-r20-db");
const dependencies = codes.map((code) => ({
  code,
  uses: refs.get(code),
  current: current.find((p) => p.code === code) ?? null,
  isolatedReference: reference.find((p) => p.code === code) ?? null,
}));
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  releaseId: r.coordinate.releaseId,
  contractHash: r.coordinate.contractHash,
  dependencies,
  missingCurrent: dependencies.filter((x) => !x.current).map((x) => x.code),
  missingReference: dependencies
    .filter((x) => !x.current && !x.isolatedReference)
    .map((x) => x.code),
  readOnly: true,
  definitionsInstalled: false,
  grantsChanged: false,
  activationChanged: false,
  referenceIsNotApproval: true,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-reset-catalog-dependencies.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log({
  required: codes.length,
  missingCurrent: report.missingCurrent.length,
  missingReference: report.missingReference.length,
});
