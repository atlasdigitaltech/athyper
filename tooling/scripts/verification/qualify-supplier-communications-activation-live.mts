import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { request } from "@playwright/test";
const origin = "https://neon.dev.athyper.test",
  endpoint = "/api/relay/neon/business-partner-cases";
const admin = await request.newContext({
  baseURL: origin,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  ignoreHTTPSErrors: true,
});
const owner = await request.newContext({
  baseURL: origin,
  storageState: "tests/e2e/.auth/dev/neon/catl.owner.json",
  ignoreHTTPSErrors: true,
});
const path =
  "governance/policy/reports/supplier-communications-activation-live.dev.json";
const report: any = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : {
      at: new Date().toISOString(),
      cases: JSON.parse(
        readFileSync(
          "governance/policy/reports/supplier-communications-materialization-live.dev.json",
          "utf8",
        ),
      ).cases.map((c: any) => ({
        id: c.id,
        level: c.level,
        runId: c.process.cycleRunId,
        businessPartnerId: c.materialization.request.targetBusinessPartnerId,
      })),
      checks: [],
    };
const save = () => {
  report.checks = [...new Set(report.checks)];
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
};
async function call(
  actor: any,
  path: string,
  data?: any,
  expected?: number,
  method?: string,
) {
  const csrf = (await actor.storageState()).cookies.find((c: any) =>
    /^(__Host-)?athyper-csrf$/.test(c.name),
  );
  const r = await actor.fetch(path, {
    method: method ?? (data ? "POST" : "GET"),
    headers: {
      origin,
      "x-csrf-token": decodeURIComponent(csrf.value),
      ...(data
        ? { "Idempotency-Key": data.idempotencyKey ?? randomUUID() }
        : {}),
    },
    ...(data ? { data } : {}),
  });
  const body = await r.json();
  assert.ok(
    expected ? r.status() === expected : r.ok(),
    JSON.stringify({
      path,
      status: r.status(),
      code: body.code,
      detail: body.detail ?? body.message,
      body: r.ok() ? undefined : body,
    }),
  );
  return body;
}
const get = (id: string) => call(admin, `${endpoint}/${id}`);
async function caseJourney(c: any, key: string, kind: string, payload: any) {
  if (!c[key]) {
    const created = await call(admin, endpoint, {
      kind,
      source: { kind: "manual" },
      requestedRole: "supplier",
      targetBusinessPartnerId: c.businessPartnerId,
      operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
      companyCodeId: "793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
      proposedPayload: { qualificationTypeCode: "compliance", ...payload },
      idempotencyKey: randomUUID(),
    });
    c[key] = { id: created.request.id };
    save();
  }
  const e = c[key];
  let current = await get(e.id);
  if (
    ["draft", "validation_failed", "returned"].includes(current.request.status)
  ) {
    if (!current.request.proposedPayload.qualificationTypeCode)
      current = await call(
        admin,
        `${endpoint}/${e.id}`,
        {
          expectedVersion: current.request.rowVersion,
          idempotencyKey: randomUUID(),
          proposedPayload: {
            ...current.request.proposedPayload,
            qualificationTypeCode: "compliance",
          },
        },
        undefined,
        "PATCH",
      );
    const v = await call(admin, `${endpoint}/${e.id}/validate`, {
      expectedVersion: current.request.rowVersion,
      idempotencyKey: randomUUID(),
    });
    assert.equal(v.validation.valid, true, JSON.stringify(v.validation));
    e.submission = await call(admin, `${endpoint}/${e.id}/submit`, {
      expectedVersion: v.request.rowVersion,
      idempotencyKey: randomUUID(),
    });
    save();
    current = await get(e.id);
  }
  let count = 0;
  while (current.request.status === "pending_approval") {
    const view = await call(owner, `${endpoint}/${e.id}/view`),
      w = view.workflow;
    assert.ok(w, JSON.stringify({ keys: Object.keys(view) }));
    e.vote = await call(owner, `${endpoint}/${e.id}/decisions`, {
      workflowRequestId: w.requestId,
      workItemId: w.workItemId,
      expectedRequestVersion: view.request.rowVersion,
      expectedWorkItemVersion: w.workItemVersion,
      decision: "approve",
      reason: "P7 independent approval",
      idempotencyKey: randomUUID(),
    });
    save();
    current = await get(e.id);
    assert.ok(++count < 12);
  }
  if (!e.materialization) {
    if (
      !e.command ||
      e.command.expectedVersion !== current.request.rowVersion
    ) {
      e.command = {
        expectedVersion: current.request.rowVersion,
        idempotencyKey: randomUUID(),
      };
      save();
    }
    e.materialization = await call(
      admin,
      `${endpoint}/${e.id}/materialize`,
      e.command,
    );
    save();
  }
  assert.equal(e.materialization.request.caseStatus, "materialized");
  return e;
}
try {
  for (const c of report.cases) {
    await caseJourney(c, "company", "configure_company", {
      currencyCode: "MYR",
    });
    report.checks.push(`${c.level}: governed company setup materialized`);
    save();
  }
  report.companyPassed = true;
  const risks = JSON.parse(
    readFileSync(
      "governance/policy/reports/supplier-communications-risk-fixture.dev.json",
      "utf8",
    ),
  ).cases;
  for (const c of report.cases) {
    if (!c.qualification) {
      c.qualification = await call(
        admin,
        `/api/relay/neon/business-partners/${c.businessPartnerId}/qualifications`,
        {
          partnerRole: "supplier",
          operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
          companyCodeId: "793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
          qualificationTypeCode: "compliance",
          riskAssessmentId: risks.find((r: any) => r.caseId === c.id).riskId,
          effectiveFrom: new Date().toISOString().slice(0, 10),
          idempotencyKey: `p7-qualification:${c.id}`,
        },
      );
      save();
    }
    const q = c.qualification.qualification;
    if (!c.qualificationDecision) {
      c.qualificationDecision = await call(
        owner,
        `/api/relay/neon/business-partner-qualifications/${q.id}/decisions`,
        {
          expectedVersion: q.rowVersion,
          decision: "approved",
          reason: "P7 independently approved supplier qualification",
          idempotencyKey: `p7-qualification-decision:${c.id}`,
        },
      );
      save();
    }
    if (c.activation?.materialization) continue;
    const readiness = await call(
      admin,
      `/api/relay/governance/supplier-onboarding/runs/${c.runId}/readiness`,
    );
    const proposal = readiness.evidence.completion.activationProposal;
    assert.equal(proposal.eligible, true, JSON.stringify(readiness.reasons));
    await caseJourney(c, "activation", "activate_supplier", {
      activation: proposal,
    });
    report.checks.push(
      `${c.level}: supplier independently qualified and activated through governed cases`,
    );
    save();
  }
  report.activationPassed = true;
} finally {
  save();
  await admin.dispose();
  await owner.dispose();
  console.log(
    JSON.stringify({
      companyPassed: report.companyPassed ?? false,
      cases: report.cases.length,
    }),
  );
}
