import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
const fixture = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-company-lifecycle-fixtures-20260912.dev.json",
  ),
);
const p = JSON.parse(
  fs.readFileSync(
    "governance/policy/reviews/business-partner-company-execution-bound-20260912.proposal.dev.json",
  ),
);
const application = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-company-execution-access-application-20260912.dev.json",
  ),
);
const output =
  "governance/policy/reports/business-partner-company-authenticated-lifecycle-20260912.dev.json";
const report = fs.existsSync(output)
  ? JSON.parse(fs.readFileSync(output))
  : {
      runId: randomUUID(),
      runtimeImage: p.runtimeImage,
      releaseSetHash: p.releaseSetHash,
      companyReleaseId: p.releaseId,
      companyArtifactHash: p.artifactHash,
      checks: [],
      passed: false,
    };
const save = () =>
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
const base = "/api/neon/business-partner-company-setup-cases",
  admin = "catl.admin",
  owner = "catl.owner";
const run = (args, input) =>
  cp.execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 3000000,
  });
const authority = () => {
  assert.ok(
    Date.now() < Date.parse(p.effectiveUntil),
    "Approved window expired",
  );
  const expected = application.after;
  const actual = JSON.parse(
    run([
      "exec",
      "athyper-bp-enter-db",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-c",
      "SELECT jsonb_object_agg(name,digest) FROM (" +
        Object.keys(expected)
          .map(
            (t) =>
              `SELECT '${t}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM authz.${t} r`,
          )
          .join(" UNION ALL ") +
        ") s;",
    ]),
  );
  assert.deepEqual(actual, expected);
};
const send = (account, name, path, method = "GET", data, expected = [200]) => {
  authority();
  const r = JSON.parse(
    run(
      [
        "exec",
        "-i",
        "athyper-bp-enter-ui-session-client",
        "node",
        "/app/server/qualification-client/session-client.mjs",
        account,
        path,
        method,
      ],
      data === undefined ? "" : JSON.stringify(data),
    ),
  );
  authority();
  const check = {
    name,
    account,
    status: r.status,
    code: r.body?.code ?? r.body?.error?.code,
    releaseSet: r.releaseSet,
    checkedAt: new Date().toISOString(),
    passed: expected.includes(r.status) && r.releaseSet === p.releaseSetHash,
  };
  report.checks.push(check);
  save();
  if (!check.passed) {
    fs.writeFileSync(
      process.env.HOME +
        "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/last-company-response.json",
      JSON.stringify(r, null, 2),
      { mode: 0o600 },
    );
    throw Error(JSON.stringify(check));
  }
  console.log(check);
  return r.body;
};
const payload = {
  kind: "configure_company",
  source: { kind: "manual" },
  requestedRole: "customer",
  targetBusinessPartnerId: fixture.bp,
  operatingOrganizationId: fixture.org,
  companyCodeId: fixture.company,
  idempotencyKey: "company-create-" + report.runId,
  proposedPayload: {
    name: "Isolated governed company qualification " + report.runId,
    ownershipClass: "internal",
    customerType: "intercompany",
    currencyCode: "MYR",
    paymentTermId: fixture.ids.payment,
    defaultAccountingProfileId: fixture.ids.accounting,
  },
};
try {
  if (!report.caseId) {
    send(admin, "identity", "/api/iam/me");
    send(admin, "company_required", base, "GET", undefined, [400]);
    send(
      admin,
      "wrong_company_rejected",
      base,
      "POST",
      { ...payload, companyCodeId: randomUUID(), idempotencyKey: randomUUID() },
      [403],
    );
    send(
      admin,
      "incompatible_organization_rejected",
      base,
      "POST",
      {
        ...payload,
        operatingOrganizationId: randomUUID(),
        idempotencyKey: randomUUID(),
      },
      [403],
    );
    send(
      owner,
      "reviewer_cannot_create",
      base,
      "POST",
      { ...payload, idempotencyKey: randomUUID() },
      [403],
    );
    const created = send(admin, "create", base, "POST", payload, [200, 201]);
    report.caseId = created.request.id;
    save();
  }
  const id = report.caseId;
  let view = send(admin, "stored_company_view", base + "/" + id + "/view");
  assert.equal(view.request.companyCodeId, fixture.company);
  report.storedCompanyOwnerVerified = true;
  save();
  send(
    admin,
    "ordinary_case_endpoint_denied",
    "/api/neon/business-partner-cases/" + id + "/view",
    "GET",
    undefined,
    [403, 404],
  );
  if (["draft", "validation_failed"].includes(view.request.status)) {
    send(
      admin,
      "premature_application_rejected",
      base + "/" + id + "/materialize",
      "POST",
      {
        expectedVersion: view.request.rowVersion,
        idempotencyKey: "premature-" + report.runId,
      },
      [403, 409],
    );
    const v = send(admin, "validate", base + "/" + id + "/validate", "POST", {
      expectedVersion: view.request.rowVersion,
    });
    if (!v.validation?.valid) {
      report.validationFindings = v.validation?.findings;
      save();
      throw Error("VALIDATION_FAILED");
    }
    send(
      admin,
      "submit",
      base + "/" + id + "/submit",
      "POST",
      {
        expectedVersion: v.request.rowVersion,
        idempotencyKey: "submit-" + report.runId,
      },
      [200, 201],
    );
  }
  for (let i = 0; i < 8; i++) {
    view = send(owner, "reviewer_view_" + i, base + "/" + id + "/view");
    if (["approved", "applied"].includes(view.request.status)) break;
    const w = view.workflow;
    if (!w?.workItemId) throw Error("APPROVER_WORK_ITEM_UNAVAILABLE");
    const decision = {
      workflowRequestId: w.requestId,
      workItemId: w.workItemId,
      expectedRequestVersion: view.request.rowVersion,
      expectedWorkItemVersion: w.workItemVersion,
      decision: "approve",
      reason: "Isolated company lifecycle qualification",
      idempotencyKey: "approve-" + w.workItemId,
    };
    if (!report.selfApprovalDenied) {
      send(
        admin,
        "self_approval_rejected",
        base + "/" + id + "/decisions",
        "POST",
        decision,
        [403, 409],
      );
      report.selfApprovalDenied = true;
      save();
    }
    send(
      owner,
      "independent_approval_" + i,
      base + "/" + id + "/decisions",
      "POST",
      decision,
    );
  }
  view = send(admin, "approved_view", base + "/" + id + "/view");
  if (view.request.status === "approved")
    send(
      admin,
      "materialize",
      base + "/" + id + "/materialize",
      "POST",
      {
        expectedVersion: view.request.rowVersion,
        idempotencyKey: "apply-" + report.runId,
      },
      [200, 201],
    );
  view = send(admin, "persisted_application", base + "/" + id + "/view");
  assert.equal(view.request.status, "applied");
  report.passed = true;
  report.completedAt = new Date().toISOString();
  report.appliedCase = {
    id,
    status: view.request.status,
    rowVersion: view.request.rowVersion,
  };
  save();
} catch (e) {
  report.failure = e.message;
  report.failedAt = new Date().toISOString();
  save();
  throw e;
}
