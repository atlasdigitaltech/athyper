/** Inert content-addressed payload only. Approval and publication remain native gates. */
import fs from "node:fs";
import cp from "node:child_process";
import { combinedHash } from "./entity-authorization/combined-successor.mjs";
if (process.argv.length !== 3 || process.argv[2] !== "--apply")
  throw Error("Use --apply for inert payload installation");
const read = (p) => JSON.parse(fs.readFileSync(p));
const p = read(
    "governance/policy/reviews/business-partner-canonical-v2-native.proposal.dev.json",
  ),
  { proposalRevision, ...body } = p,
  compilation = read(
    "governance/policy/reports/business-partner-v2-native-image-compilation.dev.json",
  );
if (
  combinedHash(body) !== proposalRevision ||
  combinedHash(p.descriptor) !== p.descriptorHash ||
  compilation.proposalRevision !== proposalRevision ||
  compilation.contractHash !== p.nativeCompilerContractHash ||
  !compilation.testsPassed ||
  p.signed ||
  p.approvalRecorded
)
  throw Error("Exact unsigned compiled proposal required");
const lit = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const sql = `BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='10s';SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444';INSERT INTO publication.entity_authorization_successor_payload(content_hash,tenant_id,descriptor) VALUES(${lit(p.descriptorHash)},'44444444-4444-4444-8444-444444444444',${lit(JSON.stringify(p.descriptor))}::jsonb) ON CONFLICT(content_hash) DO NOTHING;DO $verify$ BEGIN IF NOT EXISTS(SELECT 1 FROM publication.entity_authorization_successor_payload WHERE content_hash=${lit(p.descriptorHash)} AND tenant_id='44444444-4444-4444-8444-444444444444' AND descriptor=${lit(JSON.stringify(p.descriptor))}::jsonb) THEN RAISE EXCEPTION 'Payload identity mismatch';END IF;END $verify$;COMMIT;`;
try {
  const out = cp.execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "athyper_studio",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  if (!out.trim().endsWith("COMMIT"))
    throw Error("Installation outcome unconfirmed");
  const r = {
    schemaVersion: 1,
    kind: "bp_v2_inert_payload_installation",
    installedAt: new Date().toISOString(),
    proposalRevision,
    descriptorHash: p.descriptorHash,
    installed: true,
    signed: false,
    approvalRecorded: false,
    grantsChanged: false,
    activationChanged: false,
  };
  fs.writeFileSync(
    "governance/policy/reports/business-partner-v2-inert-payload.dev.json",
    JSON.stringify(r, null, 2) + "\n",
  );
  console.log(r);
} catch (e) {
  console.error(String(e.stderr ?? e.message).slice(0, 1000));
  process.exitCode = 1;
}
