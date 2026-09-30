import assert from "node:assert/strict";
import { actor } from "./partner-classification-session.mjs";
import { id } from "../../fixtures/business-partner-core/seed-identity.mjs";
const person=process.argv.includes('--person');
const cutover=process.argv.includes('--cutover');
if (!process.argv.includes("--run"))
  throw Error("Use --run for the CATL core registration fixture");
const maker = await actor("catl.admin"),
  checker = await actor("catl.owner");
const call = async (a, path, body) => {
  const r = await a.call(path, body);
  assert.ok([200, 201].includes(r.status), JSON.stringify({ path, ...r }));
  return r.body;
};
try {
  const created = await call(maker, "neon/business-partner-cases", {
    kind: "new_partner",
    source: { kind: "manual" },
    registrationMode: "direct",
    idempotencyKey: cutover ? `catl-capability-cutover-${person ? "person" : "organization"}-v1` : person ? "catl-role-free-person-registration-demo-v1" : "catl-role-free-registration-demo-v1",
    proposedPayload: {
      businessPartnerCode: cutover ? (person ? "BP-DEMO-CUTOVER-PERSON-001" : "BP-DEMO-CUTOVER-ORG-001") : person ? "BP-DEMO-REG-PERSON-001" : "BP-DEMO-REG-001",
      name: person ? "Rowan Example (Registration Demo)" : "Aster Role-free Registration (Demo)",
      partnerCategory: person ? "person" : "organization",
      ownershipClass: "external",
      ...(person ? {personId:id('cirrusatlantic','registration-person')} : {registrationCountryCode: "MY"}),
    },
  });
  const caseId = created.request.id,
    path = `neon/business-partner-cases/${caseId}`;
  console.log(JSON.stringify({ step: "create", caseId }));
  let current = (await call(maker, path)).request;
  if (["draft", "validation_failed"].includes(current.status)) {
    current = (
      await call(maker, path + "/validate", {
        expectedVersion: current.rowVersion,
        idempotencyKey: `core-validate-${caseId}-${current.rowVersion}`,
      })
    ).request;
    assert.notEqual(
      current.status,
      "validation_failed",
      JSON.stringify(current),
    );
  }
  if (["draft", "validated"].includes(current.status))
    current = (
      await call(maker, path + "/submit", {
        expectedVersion: current.rowVersion,
        idempotencyKey: `core-submit-${caseId}`,
      })
    ).request;
  console.log(
    JSON.stringify({ step: "submit", caseId, status: current.status }),
  );
  for (
    let n = 0;
    n < 8 && !["approved", "applied", "materialized"].includes(current.status);
    n++
  ) {
    const view = await call(checker, `${path}/view`);
    const tasks = view.workflow.stages
      .flatMap((stage) => (stage.status === "active" ? stage.workItems : []))
      .filter(
        (t) =>
          t.ownerPrincipalId === "645b6a55-3355-526a-9643-3900425bde47" &&
          t.status === "open",
      );
    assert.equal(tasks.length, 1, "One assigned CATL owner task required");
    const t = tasks[0];
    await call(checker, path + "/decisions", {
      workflowRequestId: view.workflow.requestId,
      workItemId: t.id,
      expectedRequestVersion: current.rowVersion,
      expectedWorkItemVersion: Number(t.rowVersion),
      decision: "approve",
      reason:
        "Reviewed synthetic core registration only. No commercial qualification or company usage approval.",
      idempotencyKey: `core-approve-${t.id}`,
    });
    current = (await call(maker, path)).request;
  }
  if (current.status === "approved") {
    const command = {
      expectedVersion: current.rowVersion,
      idempotencyKey: `core-materialize-${caseId}`,
    };
    const materialized = await call(maker, path + "/materialize", command);
    assert.equal(materialized.materialization.resultKind, "partner_registered");
    if (cutover) {
      for (const key of ["roleId", "supplierId", "customerId", "qualificationId", "preferenceId"])
        assert.equal(materialized.materialization[key], undefined, `Identity registration must not return ${key}`);
    }
    await call(maker, path + "/materialize", command);
    current = materialized.request;
  }
  assert.ok(["applied", "materialized"].includes(current.status));
  console.log(
    JSON.stringify({
      passed: true,
      caseId,
      status: current.status,
      businessPartnerId: current.materializedBusinessPartnerId,
      requestedRole: current.requestedRole ?? null,
      companyCodeId: current.companyCodeId ?? null,
      operatingOrganizationId: current.operatingOrganizationId ?? null,
    }),
  );
} finally {
  await maker.dispose();
  await checker.dispose();
}
