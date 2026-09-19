import { createHash } from "node:crypto";
import type {
  CycleTemplateDraft,
  ProcessScope,
  ProcessTaskBinding,
  ProcessDocumentBinding,
  ProcessExecutionManifest,
} from "@athyper/server-contract-control-admin";
import type {
  CompiledWorkflowDefinition,
  WorkflowDefinitionDraft,
} from "@athyper/server-contract-workflow";
import { createWorkflowAuthoringService } from "@athyper/server-platform-workflow";
import {
  processCatalogContentHash,
  processManifestHash,
} from "@athyper/server-platform-control-admin";

/** Canonical Increment A authoring input. Tenant coordinates and role mappings are supplied by provisioning. */
export const supplierProfileTasks = {
  simple: ["CONSOLIDATED_PREPARATION", "INDEPENDENT_APPROVAL"],
  standard: [
    "CONSOLIDATED_PREPARATION",
    "COMBINED_REVIEW",
    "BUSINESS_APPROVAL",
  ],
  enhanced: [
    "ORGANIZATION_IDENTITY",
    "CONTACT_AND_ADDRESS",
    "REGISTRATION_EVIDENCE",
    "COMPANY_REQUIREMENTS",
    "SUBMISSION_PACKAGE",
    "COMPLIANCE_REVIEW",
    "FINANCE_REVIEW",
    "OPERATIONS_REVIEW",
    "DEPARTMENT_APPROVAL",
    "FINAL_APPROVAL",
  ],
} as const;
export const supplierDocumentPurposes = [
  "submitted_review_pack",
  "decision_document",
  "activation_confirmation",
] as const;
export const supplierGateCodes = ["supplier.readiness", "supplier.activation"];
export const supplierCatalogEffectiveFrom = "2026-09-14T00:00:00.000Z";
export type SupplierProfile = keyof typeof supplierProfileTasks;
export function supplierCatalogId(scope: ProcessScope, key: string): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(["supplier-process-catalog/1", scope, key]))
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export interface SupplierCatalogArtifact {
  kind:
    | "profile"
    | "manifest"
    | "reviewer_policy"
    | "projection"
    | "recipient_policy"
    | "fact_schema"
    | "minimum_control";
  revision: { id: string; version: number; hash: string };
  definition: object;
}
export function supplierDocumentDefinition(
  purpose: (typeof supplierDocumentPurposes)[number],
) {
  const title = {
    submitted_review_pack: "Supplier submitted review pack",
    decision_document: "Supplier onboarding decision",
    activation_confirmation: "Supplier activation confirmation",
  }[purpose];
  const body = {
    submitted_review_pack:
      "<h2>Submitted organization</h2><p>{{organizationName}}</p><h2>Requirement</h2><p>{{requestedRequirement}} — {{requirementReason}}</p><h2>Admitted evidence references</h2><p>{{evidenceReferences}}</p>",
    decision_document:
      "<h2>Final decision</h2><p>{{decision}}</p><p>{{decisionAt}}</p><h2>Decision evidence</h2><p>{{decisionEvidence}}</p>",
    activation_confirmation:
      "<h2>Supplier</h2><p>{{supplierId}}</p><h2>Activation</h2><p>{{activationAt}}</p><h2>Readiness evidence</h2><p>{{readinessEvidence}}</p>",
  }[purpose];
  const fields = [
    "caseId",
    "attemptNumber",
    "profile",
    "snapshotId",
    "snapshotHash",
    ...{
      submitted_review_pack: [
        "organizationName",
        "requestedRequirement",
        "requirementReason",
        "evidenceReferences",
      ],
      decision_document: ["decision", "decisionAt", "decisionEvidence"],
      activation_confirmation: [
        "supplierId",
        "activationAt",
        "readinessEvidence",
      ],
    }[purpose],
  ];
  const content = {
    content_html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>Case {{caseId}} · Attempt {{attemptNumber}} · Profile {{profile}}</p>${body}<hr><h2>Source provenance</h2><p>Snapshot {{snapshotId}}</p><p>SHA-256 {{snapshotHash}}</p></body></html>`,
    styles_css:
      "body{font:12px sans-serif;color:#17202a;margin:32px}h1{font-size:24px}h2{font-size:15px;margin-top:24px}p{overflow-wrap:anywhere;white-space:pre-wrap}hr{margin-top:32px;border:0;border-top:1px solid #ccd1d1}",
    variables_schema: {
      type: "object",
      additionalProperties: false,
      required: fields,
      properties: Object.fromEntries(
        fields.map((field) => [field, { type: "string" }]),
      ),
    },
    assets_manifest: {},
  };
  return {
    purpose,
    title,
    fields,
    content,
    checksum: processCatalogContentHash(content),
  };
}

export async function authorSupplierProfile(input: {
  scope: ProcessScope;
  profile: SupplierProfile;
  /** Role names only. Directory resolution and permission filtering remain task execution responsibilities. */
  reviewerRoles: Readonly<Record<string, readonly [string, string]>>;
}) {
  const { scope, profile } = input;
  const artifacts: SupplierCatalogArtifact[] = [];
  const id = (key: string) => supplierCatalogId(scope, key);
  const artifact = (
    kind: SupplierCatalogArtifact["kind"],
    key: string,
    definition: object,
  ) => {
    const revision = {
      id: id(key),
      version: 1,
      hash: processCatalogContentHash(definition),
    };
    artifacts.push({ kind, revision, definition });
    return revision;
  };
  const codes = supplierProfileTasks[profile];
  const tasks: ProcessTaskBinding[] = [];
  for (const [index, code] of codes.entries()) {
    const base = {
      taskTemplateId: id(`${profile}.task.${code}`),
      code,
      predecessorTaskTemplateId: index
        ? id(`${profile}.task.${codes[index - 1]}`)
        : null,
    };
    if (code === "SUBMISSION_PACKAGE") {
      tasks.push({
        ...base,
        requiredDocumentPurposes: [],
        executionKind: "document",
        documentPurpose: "submitted_review_pack",
        outcomeScope: "task",
      });
    } else if (index === 0 || (profile === "enhanced" && index < 4)) {
      tasks.push({
        ...base,
        requiredDocumentPurposes: [],
        executionKind: "preparation",
        commandCode: "business_partner.case.validate",
        outcomeScope: "task",
      });
    } else {
      const roles = input.reviewerRoles[code];
      if (!roles || roles.some((role) => !role.trim()))
        throw Error(`Missing reviewer role mapping: ${code}`);
      const sla = {
        code: `supplier.${profile}.${code.toLowerCase()}.due`,
        version: 1,
        durationMinutes: 2880,
        reminderMinutes: [1440, 2400],
        escalationMinutes: 2880,
      };
      const draft: WorkflowDefinitionDraft = {
        code: `supplier.${profile}.${code.toLowerCase()}`,
        name: `${profile} ${code.replaceAll("_", " ").toLowerCase()}`,
        entityType: "cycle_task",
        stages: (profile === "enhanced" ? [0, 1] : [0]).map((level) => ({
          code: `LEVEL_${level + 1}`,
          name: `Review level ${level + 1}`,
          mode: "serial",
          approvers: [{ kind: "role", roleCode: roles[level]! }],
          escalation: [{ kind: "role", roleCode: roles[1] }],
          quorum: level === 0 ? { kind: "all" } : { kind: "count", value: 1 },
          slaPolicyCode: sla.code,
        })),
      };
      // Compile with the existing workflow owner; persistence below embeds this immutable artifact.
      const compiledArtifacts: CompiledWorkflowDefinition[] = [];
      const workflow = await createWorkflowAuthoringService(
        {
          nextVersion: async () => 1,
          saveImmutable: async (_tenant, value) => {
            compiledArtifacts.push(value);
          },
          getActive: async () => null,
        },
        () => new Date(supplierCatalogEffectiveFrom),
      ).compileAndPublish(scope.tenantId, draft);
      if (compiledArtifacts.length !== 1)
        throw Error("Workflow compilation produced no artifact");
      const workflowDefinitionId = id(`${profile}.workflow.${code}`);
      const reviewerPolicy = artifact(
        "reviewer_policy",
        `${profile}.reviewers.${code}`,
        {
          schema: "athyper.supplier-task-reviewers/1",
          code: draft.code,
          workflowDefinitionId,
          workflow,
          sla,
          scope,
          excludeSubmitter: true,
          requirePermission: "neon.relationship.entity_case.decide",
          resolvePerLevel: true,
          emptyCandidates: "block",
          insufficientQuorum: "block",
          outcomeScope:
            index === codes.length - 1 ? "case_final_decision" : "task",
        },
      );
      tasks.push({
        ...base,
        requiredDocumentPurposes: ["submitted_review_pack"],
        executionKind: code.includes("APPROVAL") ? "approval" : "review",
        workflow: {
          id: reviewerPolicy.id,
          definitionId: workflowDefinitionId,
          code: workflow.code,
          version: workflow.version,
          hash: workflow.artifactHash,
        },
        reviewerPolicy,
        makerChecker: true,
        outcomeScope:
          index === codes.length - 1 ? "case_final_decision" : "task",
      });
    }
  }
  const profileRevision = {
    ...artifact("profile", `${profile}.profile`, {
      schema: "athyper.supplier-profile/1",
      code: profile,
      taskCodes: codes,
      mandatoryGateCodes: supplierGateCodes,
      owner: "business_partner",
      preparationEvidence: "validated_submitted_snapshot",
      humanWorkRequires: "submitted_review_pack",
    }),
    code: profile,
  };
  const phaseId = id(`${profile}.phase`),
    categoryId = id(`${profile}.category`);
  const cycle: CycleTemplateDraft = {
    cycleType: {
      id: id(`${profile}.cycle`),
      code: `BP_SUPPLIER_${profile.toUpperCase()}`,
      name: `Supplier onboarding: ${profile}`,
      domainCode: "business_partner_onboarding",
      frequency: "adhoc",
      cleanCyclePolicy: {},
      approvalPolicy: { finalTaskCode: codes.at(-1), makerChecker: true },
      runDataSchema: {},
      taskDataSchema: {},
    },
    phases: [
      {
        id: phaseId,
        code: "ONBOARDING",
        name: "Onboarding",
        sortOrder: 10,
        isGateEnforced: true,
      },
    ],
    categories: [
      {
        id: categoryId,
        code: "SUPPLIER",
        name: "Supplier onboarding",
        sortOrder: 10,
      },
    ],
    tasks: tasks.map((task, index) => ({
      id: task.taskTemplateId,
      code: task.code,
      name: task.code.replaceAll("_", " "),
      phaseId,
      categoryId,
      entityCode: "entity_case",
      completionMode: "manual",
      isMandatory: true,
      isWaivable: false,
      sortOrder: (index + 1) * 10,
      applicability: {},
    })),
    dependencies: tasks
      .slice(1)
      .map((task) => ({
        predecessorTemplateId: task.predecessorTaskTemplateId!,
        successorTemplateId: task.taskTemplateId,
        dependencyType: "finish_to_start",
        isHard: true,
      })),
    crossDependencies: [],
    carryForwardRules: [],
  };
  return { tasks, artifacts, profile: profileRevision, cycle };
}

export function supplierManifest(
  scope: ProcessScope,
  authored: Awaited<ReturnType<typeof authorSupplierProfile>>,
  cycle: ProcessExecutionManifest["cycle"],
  documents: ProcessDocumentBinding[],
): ProcessExecutionManifest {
  const manifest = {
    schema: "athyper.process-execution-manifest/1" as const,
    scope,
    revision: {
      id: supplierCatalogId(scope, `${authored.profile.code}.manifest`),
      version: 1,
      hash: "",
    },
    profile: authored.profile,
    cycle,
    tasks: authored.tasks,
    documents,
    mandatoryGateCodes: supplierGateCodes,
  };
  manifest.revision.hash = processManifestHash(manifest);
  return manifest;
}
