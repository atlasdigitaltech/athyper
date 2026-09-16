/** Evaluate the canonical admission guard with in-memory payload variants; no persisted snapshot edits. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const source = readFileSync(
    "server/db/ddl/planes/neon/master/07_functions.sql",
    "utf8",
  ),
  start = source.indexOf(
    " IF NOT(payload?'businessPartnerCode'",
    source.indexOf(
      "CREATE OR REPLACE FUNCTION master.command_materialize_business_partner_role_case",
    ),
  ),
  end = source.indexOf(
    "\n  RAISE EXCEPTION 'Business Partner role payload is outside",
    start,
  ),
  guard = source.slice(start, end);
if (start < 0 || !guard.endsWith("THEN"))
  throw Error("Canonical guard missing");
const scenarios = [
  {
    name: "Standard empty optional reason",
    patch: {
      requestedComplianceLevel: "standard",
      complianceRequirementReason: "",
    },
    reject: false,
  },
  {
    name: "Basic nonempty reason",
    patch: {
      requestedComplianceLevel: "basic",
      complianceRequirementReason: "Local fixture",
    },
    reject: false,
  },
  {
    name: "Enhanced absent reason",
    patch: { requestedComplianceLevel: "enhanced" },
    omit: true,
    reject: false,
  },
  {
    name: "Basic blank reason",
    patch: {
      requestedComplianceLevel: "basic",
      complianceRequirementReason: " ",
    },
    reject: true,
  },
  {
    name: "Invalid enum",
    patch: { requestedComplianceLevel: "unsafe" },
    reject: true,
  },
  {
    name: "Non-text reason",
    patch: { complianceRequirementReason: 123 },
    reject: true,
  },
  {
    name: "Oversized reason",
    patch: { complianceRequirementReason: "a".repeat(2001) },
    reject: true,
  },
];
const literal = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const sql = scenarios
  .map(
    (x) =>
      `DO $test$ DECLARE payload jsonb;requested_role text;channel text;rejected boolean:=false; BEGIN SELECT s.payload_json INTO payload FROM snapshot.entity_snapshot s JOIN document.entity_case c ON c.tenant_id=s.tenant_id AND c.decision_snapshot_id=s.snapshot_id WHERE c.id='22962679-e8bf-4c1a-8c1e-431c32191c09';IF payload IS NULL THEN RAISE EXCEPTION 'Qualify the Basic decision first';END IF;payload:=payload||${literal(JSON.stringify(x.patch))}::jsonb;${x.omit ? "payload:=payload-'complianceRequirementReason';" : ""}requested_role:=payload->>'requestedRole';channel:=payload->>'registrationChannel';${guard} rejected:=true;END IF;IF rejected IS DISTINCT FROM ${x.reject} THEN RAISE EXCEPTION ${literal(x.name)};END IF;END $test$;`,
  )
  .join("\n");
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-dev-db-1",
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
writeFileSync(
  "governance/policy/reports/supplier-process-materializer-contract-db.dev.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      mode: "Canonical materializer guard evaluated in PostgreSQL against cloned in-memory decision payload; no persisted snapshot changes",
      checks: scenarios.map((x) => ({ name: x.name, rejected: x.reject })),
      passed: true,
    },
    null,
    2,
  ) + "\n",
);
console.log({ passed: true, checks: scenarios.length });
