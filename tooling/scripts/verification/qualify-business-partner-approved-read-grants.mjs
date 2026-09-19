/** Authenticated post-grant shared-DEV checks. Does not claim target release execution. */
import { request } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const p = JSON.parse(
  readFileSync(
    "governance/policy/reviews/business-partner-target-read-grants.proposal.dev.json",
  ),
);
const origin = "https://neon.dev.athyper.test",
  record = "f7688c3d-8c92-5651-a469-da3f4f786375";
const report = {
  schemaVersion: 1,
  kind: "bp_approved_read_grants_authenticated_recapture",
  capturedAt: new Date().toISOString(),
  proposalRevision: p.proposalRevision,
  targetArtifactHash: p.artifactHash,
  targetReleaseExecutionQualified: false,
  grantsChangedByQualification: false,
  enforcementActivated: false,
  actors: [],
};
const aliases = {
  "identifiers-tax": "identifiers",
  "roles-scope": "roles",
  "supplier-company": "company-configuration?roleLens=supplier",
  "customer-company": "company-configuration?roleLens=customer",
  "qualifications-certificates": "qualifications",
};
for (const member of p.group.members) {
  const c = await request.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    storageState: `tests/e2e/.auth/dev/neon/${member.account}.json`,
  });
  const actor = { account: member.account, authenticated: false, checks: [] };
  report.actors.push(actor);
  try {
    const s = await (await c.get("/api/auth/session")).json();
    if (s.state !== "authenticated") {
      actor.blocker = "normal_sign_in_required";
      continue;
    }
    assert.equal(s.principalId, member.principalId);
    assert.equal(s.tenantId, p.tenantId);
    actor.authenticated = true;
    const get = async (path, expected = 200) => {
      const r = await c.get("/api/relay" + path);
      actor.checks.push({
        path,
        status: r.status(),
        expected,
        passed: r.status() === expected,
      });
      assert.equal(r.status(), expected);
      return await r.json();
    };
    const me = await get("/iam/me");
    assert.equal(me.principalId, member.principalId);
    const approved = p.role.permissions.map((x) => x.code);
    actor.missingApprovedPermissions = approved.filter(
      (x) => !me.permissions.includes(x),
    );
    assert.deepEqual(actor.missingApprovedPermissions, []);
    actor.unapprovedTargetPermissions = me.permissions.filter(
      (x) =>
        x.startsWith("neon.relationship.bp_target.") && !approved.includes(x),
    );
    assert.deepEqual(actor.unapprovedTargetPermissions, []);
    await get("/entity-runtime/business_partner/list-descriptor");
    await get("/entity-runtime/business_partner/list?limit=10");
    await get("/entity-runtime/business_partner/records/" + record);
    const summary = await get(
      "/neon/business-partners/" + record + "/360/summary",
    );
    for (const section of summary.sections ?? []) {
      if (section.code === "overview" || section.authorization !== "granted")
        continue;
      // Context-requiring providers are checked through the separately qualified selector journey.
      if (section.reasonCode === "BP_360_SCOPE_REQUIRED") continue;
      await get(
        "/neon/business-partners/" +
          record +
          "/360/" +
          (aliases[section.code] ?? section.code),
      );
    }
    await get(
      "/neon/business-partners/" +
        record +
        "/360/summary?companyCodeId=00000000-0000-4000-8000-000000000001",
      400,
    );
    actor.sharedDevReadsQualified = true;
  } catch (error) {
    actor.blocker = "qualification_failed";
    actor.failure = String(error.message).slice(0, 180);
  } finally {
    await c.dispose();
  }
}
const anon = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
});
try {
  report.anonymousDenied =
    (
      await anon.get(
        "/api/relay/neon/business-partners/" + record + "/360/summary",
      )
    ).status() === 401;
} finally {
  await anon.dispose();
}
report.allNamedReadersQualified =
  report.actors.every((a) => a.sharedDevReadsQualified) &&
  report.anonymousDenied;
report.limits = [
  "Shared DEV remains on its active release; these checks do not prove release-19 target enforcement.",
  "Permission presence does not prove scoped target decisions, mutation preflight, or execution.",
];
writeFileSync(
  "governance/policy/reports/business-partner-target-read-grants.authenticated.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    actors: report.actors.map(
      ({
        account,
        authenticated,
        missingApprovedPermissions,
        unapprovedTargetPermissions,
        sharedDevReadsQualified,
        blocker,
        failure,
        checks,
      }) => ({
        account,
        authenticated,
        missingApprovedPermissions,
        unapprovedTargetPermissions,
        sharedDevReadsQualified,
        blocker,
        failure,
        checks: checks.length,
      }),
    ),
    anonymousDenied: report.anonymousDenied,
    targetReleaseExecutionQualified: false,
  }),
);
if (report.actors.some((a) => a.blocker === "qualification_failed"))
  process.exitCode = 1;
