import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
const artifactHash =
    "45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc",
  releaseId = "c2cc6900-26c1-47ca-8dfc-1d488000950c";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
const output =
  "governance/policy/reports/business-partner-enter-commands-20260912.dev.json";
const report = existsSync(output)
  ? JSON.parse(readFileSync(output, "utf8"))
  : {
      schemaVersion: 1,
      kind: "enter_authenticated_commands_and_import",
      runId: randomUUID(),
      releaseId,
      artifactHash,
      checks: [],
      commandJourneyCompleted: false,
      importQualified: false,
      sharedDevActivationChanged: false,
      grantsChanged: false,
    };
const save = () =>
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
const send = (account, name, path, method = "GET", data, expected = [200]) => {
  const authority = assertAuthorityUnchanged();
  const result = JSON.parse(
    execFileSync(
      "docker",
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
      {
        input: data === undefined ? "" : JSON.stringify(data),
        encoding: "utf8",
        maxBuffer: 3000000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    ),
  );
  const after = assertAuthorityUnchanged();
  if (after.sha256 !== authority.sha256)
    throw Error("AUTHORITY_CHANGED_DURING_REQUEST");
  const passed =
    expected.includes(result.status) && result.artifact === artifactHash;
  const check = {
    name,
    account,
    status: result.status,
    code: result.body?.code ?? result.body?.error?.code,
    passed,
    artifact: result.artifact,
    requestRef: createHash("sha256")
      .update(result.requestId ?? "")
      .digest("hex"),
    authorityHash: authority.sha256,
    checkedAt: new Date().toISOString(),
  };
  report.checks.push(check);
  save();
  console.log(JSON.stringify(check));
  if (!passed) {
    writeFileSync(
      "/home/chandravel_natarajan/.athyper/instances/dev/deployments/bp-enter-isolated-20260911/last-command-response.json",
      JSON.stringify(result, null, 2),
      { mode: 0o600 },
    );
    throw Error(
      name + ":" + result.status + ":" + (check.code ?? "unexpected"),
    );
  }
  return result.body;
};
const base = "/api/neon/business-partner-cases",
  admin = "catl.admin",
  owner = "catl.owner",
  org = "a478f9c0-8226-5d22-9599-b8fb27a45180";
const payload = {
  kind: "new_partner",
  source: { kind: "manual" },
  requestedRole: "supplier",
  operatingOrganizationId: org,
  idempotencyKey: "isolated-create-" + report.runId,
  extensions: {
    addresses: [
      {
        clientItemKey: "primary-address",
        definitionFieldCode: "relationship.address.primary",
        purpose: "default",
        line1: "1 Isolated Qualification Road",
        city: "London",
        postalCode: "SW1A 1AA",
        countryCode: "GB",
        isPrimary: true,
        normalizedHash: createHash("sha256").update(report.runId).digest("hex"),
      },
    ],
    contactPersons: [
      {
        clientItemKey: "primary-contact",
        definitionFieldCode: "relationship.contact.primary",
        contactName: "Isolated Qualification Contact",
        isPrimary: true,
      },
    ],
    contactChannels: [
      {
        clientItemKey: "primary-email",
        definitionFieldCode: "relationship.contact.email",
        contactClientItemKey: "primary-contact",
        channelType: "email",
        value: "isolated-" + report.runId + "@example.test",
        purpose: "default",
        isPrimary: true,
      },
    ],
  },
  proposedPayload: {
    legalName: "Isolated Enter Qualification " + report.runId,
    registrationCountryCode: "GB",
  },
};
try {
  report.startedAt ??= new Date().toISOString();
  if (!report.testCaseId) {
    send(admin, "authenticated_identity", "/api/iam/me");
    const created = send(admin, "create", base, "POST", payload, [200, 201]);
    report.testCaseId = created.request.id;
    save();
  }
  const id = report.testCaseId;
  let view = send(admin, "requester_case_view", base + "/" + id + "/view");
  if (
    view.request.status === "draft" ||
    view.request.status === "validation_failed"
  ) {
    send(
      admin,
      "apply_before_approval_denied",
      base + "/" + id + "/materialize",
      "POST",
      {
        expectedVersion: view.request.rowVersion,
        idempotencyKey: "premature-" + report.runId,
      },
      [403, 409],
    );
    const validated = send(
      admin,
      "validate",
      base + "/" + id + "/validate",
      "POST",
      { expectedVersion: view.request.rowVersion },
    );
    if (!validated.validation?.valid) {
      report.validationFindings = validated.validation?.findings;
      throw Error("VALIDATION_NOT_SUCCESSFUL");
    }
    report.validationValid = true;
    send(
      admin,
      "submit",
      base + "/" + id + "/submit",
      "POST",
      {
        expectedVersion: validated.request.rowVersion,
        idempotencyKey: "submit-" + report.runId,
      },
      [200, 201],
    );
  }
  for (let step = 0; step < 8; step++) {
    view = send(owner, "independent_approver_view", base + "/" + id + "/view");
    if (["approved", "applied"].includes(view.request.status)) break;
    const work = view.workflow;
    if (!work?.workItemId) throw Error("APPROVER_WORK_ITEM_UNAVAILABLE");
    const decision = {
      workflowRequestId: work.requestId,
      workItemId: work.workItemId,
      expectedRequestVersion: view.request.rowVersion,
      expectedWorkItemVersion: work.workItemVersion,
      decision: "approve",
      reason: "Isolated signed enter-correction release command qualification",
      idempotencyKey: "approve-" + work.workItemId,
    };
    if (!report.makerCheckerRejected) {
      send(
        admin,
        "requester_self_approval_denied",
        base + "/" + id + "/decisions",
        "POST",
        decision,
        [403, 409],
      );
      report.makerCheckerRejected = true;
    }
    send(
      owner,
      "independent_approval_" + step,
      base + "/" + id + "/decisions",
      "POST",
      decision,
    );
  }
  view = send(admin, "approved_case_view", base + "/" + id + "/view");
  if (view.request.status === "approved")
    send(
      admin,
      "apply",
      base + "/" + id + "/materialize",
      "POST",
      {
        expectedVersion: view.request.rowVersion,
        idempotencyKey: "apply-" + report.runId,
      },
      [200, 201],
    );
  view = send(admin, "persisted_application", base + "/" + id + "/view");
  if (view.request.status !== "applied")
    throw Error("APPLICATION_NOT_PERSISTED");
  report.commandJourneyCompleted = true;
  report.appliedCase = {
    id,
    status: view.request.status,
    rowVersion: view.request.rowVersion,
    targetBusinessPartnerId: view.request.targetBusinessPartnerId,
  };
  if (!report.importQualified) {
    const descriptorHash =
      "1e1f4dd20f900b220b644eb936baf0474c01357be4f3b18290340efea6ad9cda";
    const batch = {
      schemaVersion: 1,
      release: { releaseId, compiledHash: descriptorHash },
      batch: {
        schemaVersion: 1,
        batchKey: "isolated-" + report.runId,
        rows: [
          {
            rowKey: "supplier-0001",
            operatingOrganizationId: org,
            proposedPayload: {
              ...payload.proposedPayload,
              legalName: "Imported Enter Qualification " + report.runId,
              ownershipClass: "internal",
              supplierType: "intercompany",
            },
            extensions: payload.extensions,
          },
        ],
      },
    };
    const imported = send(
      admin,
      "governed_import",
      "/api/neon/business-partner-imports",
      "POST",
      batch,
    );
    const outcome = imported.outcomes?.[0];
    if (!["created", "replayed"].includes(outcome?.status))
      throw Error("GOVERNED_IMPORT_DID_NOT_CREATE_REQUEST");
    report.importRequestId = outcome.requestId;
    const draft = send(
      admin,
      "imported_governed_draft",
      base + "/" + outcome.requestId + "/view",
    );
    if (
      draft.request.status !== "draft" ||
      draft.request.source?.kind !== "import" ||
      draft.request.targetBusinessPartnerId
    )
      throw Error("IMPORT_BYPASSED_GOVERNANCE");
    const replay = send(
      admin,
      "import_idempotent_replay",
      "/api/neon/business-partner-imports",
      "POST",
      batch,
    );
    if (
      replay.outcomes?.[0]?.requestId !== outcome.requestId ||
      replay.outcomes?.[0]?.status !== "replayed"
    )
      throw Error("IMPORT_REPLAY_MISMATCH");
    report.importQualified = true;
  }
  send(
    admin,
    "direct_create_deferred",
    "/api/records/business_partner",
    "POST",
    { legalName: "Forbidden direct " + report.runId },
    [403, 409],
  );
  send(
    admin,
    "direct_update_deferred",
    "/api/records/business_partner/" + view.request.targetBusinessPartnerId,
    "PATCH",
    { legalName: "Forbidden direct update" },
    [403, 409],
  );
  report.deferredDirectWritesRejected = true;
  report.completedAt = new Date().toISOString();
  delete report.blocker;
} catch (error) {
  report.blocker = error.message;
  report.lastAttemptAt = new Date().toISOString();
  console.log(JSON.stringify({ blocked: report.blocker }));
  process.exitCode = 1;
} finally {
  save();
}
