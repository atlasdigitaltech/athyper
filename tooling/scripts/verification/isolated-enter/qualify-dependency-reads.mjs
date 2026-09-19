import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { assertAuthorityUnchanged } from "./dependency-authority-check.mjs";
const journey = JSON.parse(
    fs.readFileSync(
      "governance/policy/reports/business-partner-dependency-final-commands-20260912.dev.json",
    ),
  ),
  id = journey.appliedCase.targetBusinessPartnerId;
const checks = [];
const call = (name, path, expected = [200], account = "catl.admin") => {
  const before = assertAuthorityUnchanged();
  const r = JSON.parse(
    cp.execFileSync(
      "docker",
      [
        "exec",
        "athyper-bp-enter-ui-session-client",
        "node",
        "/app/server/qualification-client/session-client.mjs",
        account,
        path,
        "GET",
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ),
  );
  assert.equal(assertAuthorityUnchanged().sha256, before.sha256);
  const check = {
    name,
    account,
    status: r.status,
    releaseSet: r.releaseSet,
    passed: expected.includes(r.status) && r.releaseSet === journey.releaseSet,
    code: r.body.code,
    topLevelKeys: Object.keys(r.body),
  };
  checks.push(check);
  assert.ok(check.passed, JSON.stringify(check));
  return r.body;
};
let failure;
try {
  const list = call(
    "positive_directory",
    "/api/entity-runtime/business_partner/list",
  );
  assert.ok(list.rows.some((r) => r.id === id));
  call("positive_record", "/api/records/business_partner/" + id);
  call(
    "owner_positive_record",
    "/api/records/business_partner/" + id,
    [200],
    "catl.owner",
  );
  for (const section of [
    "summary",
    "identity",
    "contacts",
    "addresses",
    "identifiers-tax",
    "roles-scope",
    "banking",
  ])
    call(
      "provider_" + section,
      "/api/neon/business-partners/" + id + "/360/" + section,
      [200],
    );
  call(
    "child_context_missing",
    "/api/entity-runtime/business_partner_request/list",
    [409],
  );
  call(
    "child_wrong_context",
    "/api/entity-runtime/business_partner_request/list?operatingOrganizationId=00000000-0000-4000-8000-000000000001",
    [403],
  );
  const rows = call(
    "child_selected_context",
    "/api/entity-runtime/business_partner_request/list?operatingOrganizationId=a478f9c0-8226-5d22-9599-b8fb27a45180",
  );
  assert.ok(rows.rows.some((r) => r.id === journey.testCaseId));
  call(
    "missing_record",
    "/api/records/business_partner/00000000-0000-4000-8000-000000000001",
    [403],
  );
} catch (e) {
  failure = e.message;
  process.exitCode = 1;
} finally {
  const out =
    "governance/policy/reports/business-partner-dependency-reads-20260912.dev.json";
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        recordId: id,
        releaseSet: journey.releaseSet,
        image: journey.image,
        checks,
        failure,
        nonemptySensitiveFieldQualification: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log({
    passed: checks.filter((c) => c.passed).length,
    failure,
    report: out,
  });
}
