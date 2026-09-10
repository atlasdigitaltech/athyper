/** Executes isolated DEV cases through real authenticated BFF sessions. Never edits grants. */
import { request } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
const [requesterState, approverState, organizationId, output] =
  process.argv.slice(2);
if (!requesterState || !approverState || !organizationId || !output)
  throw Error(
    "Usage: qualify-business-partner-commands.mts <requester storage state> <approver storage state> <organization UUID> <report>",
  );
const origin =
  process.env.PLAYWRIGHT_NEON_BASE_URL ?? "https://neon.dev.athyper.test";
if (new URL(origin).hostname !== "neon.dev.athyper.test")
  throw Error("Only the isolated DEV journey is supported");
const previous = existsSync(output)
  ? JSON.parse(readFileSync(output, "utf8"))
  : undefined;
const resume = process.env.QUALIFICATION_RESUME === "1" && previous?.testCaseId;
const checks: Record<string, unknown>[] = resume ? previous.checks : [],
  runId = resume ? previous.runId : randomUUID();
const report: Record<string, unknown> = resume
  ? previous
  : {
      schemaVersion: 1,
      runId,
      generatedAt: new Date().toISOString(),
      evidence: "authenticated_bff_commands",
      targetBackendQualified: false,
      activationAuthorized: false,
      grantChanges: [],
      checks,
    };
const create = (storageState?: string) =>
  request.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    ...(storageState ? { storageState } : {}),
    extraHTTPHeaders: { origin, "content-type": "application/json" },
  });
const requester = await create(requesterState),
  approver = await create(approverState),
  anonymous = await create();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const send = async (
  client: typeof requester,
  name: string,
  path: string,
  data: unknown,
  expected: readonly number[],
) => {
  const csrf = (await client.storageState()).cookies.find(
    (cookie) =>
      cookie.name === "__Host-athyper-csrf" || cookie.name === "athyper-csrf",
  )?.value;
  const r = await client.post("/api/relay/neon/business-partner-cases" + path, {
    data,
    headers: {
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      "idempotency-key": `qualification-${name}-${runId}`,
    },
  });
  const b = await r.json().catch(() => ({}));
  checks.push({
    name,
    status: r.status(),
    passed:
      expected.includes(r.status()) &&
      !String(b.code ?? "").startsWith("RELAY_"),
    code: b.code ?? b.error?.code,
    requestRef: r.headers()["x-request-id"]
      ? hash(r.headers()["x-request-id"]!)
      : undefined,
  });
  if (
    !expected.includes(r.status()) ||
    String(b.code ?? "").startsWith("RELAY_")
  )
    throw Error(
      `${name}:${r.status()}:${b.code ?? b.error?.code ?? "unexpected_response"}`,
    );
  return b;
};
const current = (b: any) =>
  b.request ?? b.case ?? b.data?.request ?? b.data?.case ?? b.data ?? b;
async function approveAndApply(caseId: string) {
  for (let stage = 0; stage < 10; stage++) {
    const response = await approver.get(
      `/api/relay/neon/business-partner-cases/${caseId}/view`,
    );
    if (!response.ok()) throw Error(`approver_view:${response.status()}`);
    const view = await response.json();
    if (view.request?.status === "approved") {
      await send(
        requester,
        "apply",
        `/${caseId}/materialize`,
        {
          expectedVersion: view.request.rowVersion,
          idempotencyKey: `qualification-apply-${runId}`,
        },
        [200, 201],
      );
      return;
    }
    const task = view.workflow;
    if (!task?.workItemId || task.workItemStatus !== "open")
      throw Error("assigned_approver_task_unavailable");
    await send(
      approver,
      `assigned_approver_decides_stage_${stage + 1}`,
      `/${caseId}/decisions`,
      {
        workflowRequestId: task.requestId,
        workItemId: task.workItemId,
        expectedRequestVersion: view.request.rowVersion,
        expectedWorkItemVersion: task.workItemVersion,
        decision: "approve",
        reason: "Isolated authorization qualification",
        idempotencyKey: `qualification-approve-${task.workItemId}`,
      },
      [200],
    );
  }
  throw Error("workflow_stage_bound_exceeded");
}
try {
  if (resume) {
    report["priorBlockerDisposition"] =
      "Initial harness used requester-visible task; resume resolves the approver-owned current task and version through authenticated case view.";
    await approveAndApply(resume);
    report["commandJourneyCompleted"] = true;
    delete report["blocker"];
  } else {
    for (const [name, client] of [
      ["requester", requester],
      ["approver", approver],
    ] as const) {
      const r = await client.get("/api/relay/iam/me");
      const b = await r.json();
      if (r.status() !== 200) throw Error(`${name}_authentication_required`);
      report[name] = {
        principalRef: hash(b.tenantId + ":" + b.principalId),
        authEpoch: b.authEpoch,
        permissions: (b.permissions ?? []).filter((p: string) =>
          p.startsWith("neon.relationship.entity_case."),
        ),
      };
    }
    const payload = {
      kind: "new_partner",
      source: { kind: "manual" },
      requestedRole: "supplier",
      operatingOrganizationId: organizationId,
      extensions: {
        addresses:[{clientItemKey:"primary-address",definitionFieldCode:"relationship.address.primary",purpose:"default",line1:"1 Qualification Road",city:"London",postalCode:"SW1A 1AA",countryCode:"GB",isPrimary:true,normalizedHash:hash(`qualification-address-${runId}`)}],
        contactPersons:[{clientItemKey:"primary-contact",definitionFieldCode:"relationship.contact.primary",contactName:"Qualification Contact",isPrimary:true}],
        contactChannels:[{clientItemKey:"primary-email",definitionFieldCode:"relationship.contact.email",contactClientItemKey:"primary-contact",channelType:"email",value:`qualification-${runId}@example.test`,purpose:"default",isPrimary:true}],
      },
      proposedPayload: {
        legalName: `Authorization Qualification ${runId}`,
        registrationCountryCode: "GB",
      },
      idempotencyKey: `qualification-create-${runId}`,
    };
    await send(anonymous, "anonymous_create_denied", "", payload, [401, 403]);
    await send(
      approver,
      "approver_without_create_denied",
      "",
      { ...payload, idempotencyKey: `qualification-owner-${runId}` },
      [403],
    );
    if(process.env["QUALIFICATION_OWNERSHIP_REGRESSION"]==="1"){
      const invalid=current(await send(requester,"create_incompatible_ownership","",{
        ...payload,proposedPayload:{...payload.proposedPayload,legalName:`Invalid Ownership Qualification ${runId}`,ownershipClass:"internal",supplierType:"general"},idempotencyKey:`qualification-invalid-${runId}`,
      },[200,201]));
      report["invalidOwnershipCaseId"]=invalid.id;
      const rejected=await send(requester,"validate_incompatible_ownership",`/${invalid.id}/validate`,{expectedVersion:invalid.rowVersion},[200]);
      if(rejected.validation?.valid!==false||!rejected.validation?.findings?.some((f:any)=>f.ruleCode==="role.ownership_subtype.compatible"&&f.outcome==="failed"))throw Error("ownership_validation_regression");
      await send(requester,"submit_incompatible_ownership_denied",`/${invalid.id}/submit`,{expectedVersion:current(rejected).rowVersion,idempotencyKey:`qualification-invalid-submit-${runId}`},[409]);
      report["ownershipRegressionPassed"]=true;
    }
    const created = current(
      await send(requester, "create", "", payload, [200, 201]),
    );
    if (typeof created.id !== "string")
      throw Error("created_case_identity_missing");
    report["testCaseId"] = created.id;
    await send(
      requester,
      "apply_before_approval_denied",
      `/${created.id}/materialize`,
      {
        expectedVersion: created.rowVersion,
        idempotencyKey: `qualification-premature-${runId}`,
      },
      [403, 409],
    );
    const validated = await send(
      requester,
      "validate",
      `/${created.id}/validate`,
      { expectedVersion: created.rowVersion },
      [200],
    );
    const validCase = current(validated);
    report["validationValid"] =
      validated.validation?.valid ?? validated.data?.validation?.valid;
    const submitted = await send(
      requester,
      "submit",
      `/${created.id}/submit`,
      {
        expectedVersion: validCase.rowVersion,
        idempotencyKey: `qualification-submit-${runId}`,
      },
      [200, 201],
    );
    const saved = current(submitted),
      workflow = submitted.workflow ?? submitted.data?.workflow;
    if (!workflow?.requestId || !workflow?.workItemId)
      throw Error("workflow_coordinates_missing");
    const decision = {
      workflowRequestId: workflow.requestId,
      workItemId: workflow.workItemId,
      expectedRequestVersion: saved.rowVersion,
      expectedWorkItemVersion: 1,
      decision: "approve",
      reason: "Isolated authorization qualification",
      idempotencyKey: `qualification-approve-${runId}`,
    };
    await send(
      requester,
      "maker_cannot_approve",
      `/${created.id}/decisions`,
      decision,
      [403, 409],
    );
    await approveAndApply(created.id);
    report["commandJourneyCompleted"] = true;
  }
} catch (error) {
  report["commandJourneyCompleted"] = false;
  report["blocker"] =
    error instanceof Error ? error.message : "qualification_failed";
  process.exitCode = 2;
} finally {
  await Promise.all([
    requester.dispose(),
    approver.dispose(),
    anonymous.dispose(),
  ]);
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
}
