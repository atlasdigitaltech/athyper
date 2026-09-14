import {
  parseGovernedCaseView,
  type CaseSectionState,
  type GovernedCaseStatusV1,
  type GovernedCaseViewV1,
} from "@athyper/contract-platform-entity-runtime";
import type {
  BusinessPartnerRequest,
  BusinessPartnerRequestValidationFinding,
  BusinessPartnerRequestView,
} from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

type WorkflowView = BusinessPartnerRequestView["workflow"];

export interface BusinessPartnerCaseViewContext {
  readonly companyPilot?: boolean;
  readonly permissionCodes: readonly string[];
  readonly principalId?: string;
  readonly validationFindings?: readonly BusinessPartnerRequestValidationFinding[];
  readonly workflow?: WorkflowView;
}

const permission = Object.freeze({
  update: "neon.relationship.entity_case.update",
  validate: "neon.relationship.entity_case.validate",
  submit: "neon.relationship.entity_case.submit",
  decide: "neon.relationship.entity_case.decide",
  materialize: "neon.relationship.entity_case.materialize",
  readPartner: "neon.relationship.business_partner.read",
});

/**
 * Versioned, browser-safe projection over the existing governed command model.
 * This is deliberately an adapter: command authority remains in the request service.
 */
export function toGovernedBusinessPartnerCaseView(
  request: BusinessPartnerRequest,
  context: BusinessPartnerCaseViewContext,
): GovernedCaseViewV1 {
  const status = governedStatus(request.status);
  const sections = lifecycleSections(request, context.validationFindings ?? []);
  const required = sections.filter(
    (section) => section.state !== "not_applicable",
  );
  const definitionId = request.schema.releaseId;
  if (!definitionId) {
    throw invalidProducer("The case is not pinned to a definition release");
  }

  try {
    return parseGovernedCaseView({
      schema: "athyper.governed-case-view/1",
      id: request.caseId ?? request.id,
      kind: request.kind,
      status,
      rowVersion: request.rowVersion,
      definition: {
        id: definitionId,
        version: request.schema.version,
        contentHash: request.schema.hash,
      },
      subject: {
        type: "business_partner",
        ...(request.materializedBusinessPartnerId ||
        request.targetBusinessPartnerId
          ? {
              id:
                request.materializedBusinessPartnerId ??
                request.targetBusinessPartnerId,
            }
          : {}),
        displayName: subjectName(request),
      },
      ownership: {
        requesterId: request.createdBy,
        ...(context.workflow?.ownerPrincipalId
          ? { assigneeId: context.workflow.ownerPrincipalId }
          : {}),
      },
      progress: {
        completed: required.filter((section) => section.state === "complete")
          .length,
        required: required.length,
        blockers: required.reduce(
          (total, section) => total + section.errors,
          0,
        ),
      },
      sections,
      allowedActions: allowedActions(request, context),
      evidenceSummary: evidenceSummary(request),
      timestamps: {
        createdAt: request.createdAt,
        updatedAt: request.updatedAt ?? request.createdAt,
      },
    });
  } catch (error) {
    throw invalidProducer(
      error instanceof Error
        ? error.message
        : "The governed case projection is invalid",
    );
  }
}

function lifecycleSections(
  request: BusinessPartnerRequest,
  findings: readonly BusinessPartnerRequestValidationFinding[],
): readonly Readonly<{
  id: string;
  label: string;
  state: CaseSectionState;
  errors: number;
}>[] {
  const validationErrors = findings.filter(
    (finding) => finding.severity === "error" && finding.outcome === "failed",
  ).length;
  const validated =
    request.validationSummary["valid"] === true ||
    request.validationSummary["outcome"] === "passed";
  const afterSubmit = [
    "pending_approval",
    "approved",
    "rejected",
    "applying",
    "applied",
    "failed",
  ].includes(request.status);
  const approvalComplete = [
    "approved",
    "applying",
    "applied",
    "failed",
  ].includes(request.status);

  return Object.freeze([
    section(
      "details",
      "Case details",
      ["returned"].includes(request.status) ? "in_progress" : "complete",
    ),
    section(
      "validation",
      "Validation",
      request.status === "validating"
        ? "in_progress"
        : request.status === "validation_failed"
          ? "blocked"
          : validated || afterSubmit
            ? "complete"
            : "not_started",
      request.status === "validation_failed"
        ? Math.max(1, validationErrors)
        : 0,
    ),
    section(
      "approval",
      "Approval",
      request.status === "pending_approval"
        ? "in_progress"
        : approvalComplete
          ? "complete"
          : request.status === "rejected" || request.status === "returned"
            ? "blocked"
            : ["cancelled", "superseded"].includes(request.status)
              ? "not_applicable"
              : "not_started",
      request.status === "rejected" || request.status === "returned" ? 1 : 0,
    ),
    section(
      "materialization",
      "Materialization",
      request.status === "applying"
        ? "in_progress"
        : request.status === "applied"
          ? "complete"
          : request.status === "failed"
            ? "blocked"
            : ["rejected", "cancelled", "superseded"].includes(request.status)
              ? "not_applicable"
              : "not_started",
      request.status === "failed" ? 1 : 0,
    ),
  ]);
}

function section(
  id: string,
  label: string,
  state: CaseSectionState,
  errors = 0,
) {
  return Object.freeze({ id, label, state, errors });
}

function allowedActions(
  request: BusinessPartnerRequest,
  context: BusinessPartnerCaseViewContext,
) {
  const permissions = new Set(context.permissionCodes);
  const operationPermissions = context.companyPilot
    ? Object.fromEntries(
        Object.entries(permission).map(([key, code]) => [
          key,
          key === "readPartner"
            ? code
            : code.replace(".entity_case.", ".bp_company_setup_request."),
        ]),
      )
    : permission;
  const workflow = context.workflow;
  const actions: Array<
    Readonly<{ id: string; label: string; requiresElevation?: boolean }>
  > = [];
  const editable = ["draft", "validation_failed", "returned"].includes(
    request.status,
  );
  if (
    editable &&
    !request.proposedPayload["meshChangeResolutionId"] &&
    permissions.has(operationPermissions.update!)
  )
    actions.push(action("edit", "Edit"));
  if (editable && permissions.has(operationPermissions.validate!))
    actions.push(action("validate", "Validate"));
  if (
    request.status === "draft" &&
    (request.validationSummary["valid"] === true ||
      request.validationSummary["outcome"] === "passed") &&
    permissions.has(operationPermissions.submit!)
  ) {
    actions.push(action("submit", "Submit"));
  }
  if (
    request.status === "pending_approval" &&
    ["open", "claimed"].includes(workflow?.workItemStatus ?? "") &&
    workflow?.ownerPrincipalId === context.principalId &&
    permissions.has(operationPermissions.decide!)
  ) {
    actions.push(
      action("return", "Return"),
      action("reject", "Reject", true),
      action("approve", "Approve", true),
    );
  }
  if (
    request.status === "approved" &&
    permissions.has(operationPermissions.materialize!)
  ) {
    actions.push(action("materialize", "Materialize", true));
  }
  if (
    request.materializedBusinessPartnerId &&
    permissions.has(operationPermissions.readPartner!)
  ) {
    actions.push(action("open_partner", "Open partner"));
  }
  return Object.freeze(actions);
}

function action(id: string, label: string, requiresElevation?: boolean) {
  return Object.freeze({
    id,
    label,
    ...(requiresElevation ? { requiresElevation } : {}),
  });
}

function evidenceSummary(request: BusinessPartnerRequest) {
  const source = request.validationSummary["evidenceSummary"];
  const value =
    source && typeof source === "object" && !Array.isArray(source)
      ? (source as Record<string, unknown>)
      : {};
  return Object.freeze({
    active: count(value["active"]),
    scanning: count(value["scanning"]),
    quarantined: count(value["quarantined"]),
    missing: count(value["missing"]),
  });
}

function count(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function subjectName(request: BusinessPartnerRequest): string {
  for (const key of [
    "name",
  ] as const) {
    const value = request.proposedPayload[key];
    if (typeof value === "string" && value.trim())
      return value.trim().slice(0, 255);
  }
  return request.caseNo ?? request.requestNo;
}

function governedStatus(
  status: BusinessPartnerRequest["status"],
): GovernedCaseStatusV1 {
  switch (status) {
    case "draft":
    case "validating":
    case "validation_failed":
    case "pending_approval":
    case "returned":
    case "approved":
    case "rejected":
    case "applying":
    case "applied":
    case "failed":
    case "cancelled":
    case "superseded":
      return status;
    default:
      throw invalidProducer(
        `Unsupported governed case status: ${String(status)}`,
      );
  }
}

function invalidProducer(detail: string): MasterDataError {
  return new MasterDataError(
    503,
    "BUSINESS_PARTNER_CASE_VIEW_INVALID",
    `GovernedCaseViewV1 producer failed: ${detail}`,
  );
}
