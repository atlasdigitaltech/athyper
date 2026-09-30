import { calculateDefinitionHash } from "@athyper/server-platform-policy";
import {
  processManifestHash,
  supplierRequirementPolicy,
} from "@athyper/server-platform-control-admin";
import type {
  ProcessSelectionPublication,
  ProcessRevision,
  ProcessTaskBinding,
} from "@athyper/server-contract-control-admin";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function fixture(): ProcessSelectionPublication {
  let n = 0;
  const revision = (): ProcessRevision => ({
    id: id(++n),
    version: 1,
    hash: "a".repeat(64),
  });
  const scope = {
    tenantId: id(1000),
    planeKey: "neon" as const,
    processFamily: "supplier_onboarding",
    operatingOrganizationId: id(1001),
    companyCodeId: id(1002),
  };
  const manifests = (["simple", "standard", "enhanced"] as const).map(
    (code) => {
      const prep = id(++n),
        decision = id(++n);
      const tasks: ProcessTaskBinding[] = [
        {
          taskTemplateId: prep,
          code: "PREPARATION",
          predecessorTaskTemplateId: null,
          requiredDocumentPurposes: [],
          executionKind: "preparation",
          commandCode: "supplier.prepare",
          outcomeScope: "task",
        },
        {
          taskTemplateId: decision,
          code: "APPROVAL",
          predecessorTaskTemplateId: prep,
          requiredDocumentPurposes: ["submitted_review_pack"],
          executionKind: "approval",
          workflow: {
            ...revision(),
            definitionId: id(++n),
            code: "supplier.approval",
          },
          reviewerPolicy: revision(),
          outcomeScope: "case_final_decision",
          makerChecker: true,
        },
      ];
      for (let j = 0; j < { simple: 0, standard: 1, enhanced: 8 }[code]; j++) {
        const before = tasks[tasks.length - 2]!,
          last = tasks.at(-1)!;
        const taskId = id(++n);
        tasks.splice(tasks.length - 1, 0, {
          taskTemplateId: taskId,
          code: `REVIEW_${j}`,
          predecessorTaskTemplateId: before.taskTemplateId,
          requiredDocumentPurposes: ["submitted_review_pack"],
          executionKind: "review",
          workflow: {
            ...revision(),
            definitionId: id(++n),
            code: "supplier.review",
          },
          reviewerPolicy: revision(),
          outcomeScope: "task",
          makerChecker: true,
        });
        (last as any).predecessorTaskTemplateId = taskId;
      }
      if (code === "enhanced") {
        for (let j = 1; j <= 3; j++) {
          const t = tasks[j]!;
          tasks[j] = {
            taskTemplateId: t.taskTemplateId,
            code: `PREPARATION_${j}`,
            predecessorTaskTemplateId: t.predecessorTaskTemplateId,
            requiredDocumentPurposes: [],
            executionKind: "preparation",
            commandCode: "supplier.prepare",
            outcomeScope: "task",
          };
        }
        const t = tasks[4]!;
        tasks[4] = {
          taskTemplateId: t.taskTemplateId,
          code: "REVIEW_PACK",
          predecessorTaskTemplateId: t.predecessorTaskTemplateId,
          requiredDocumentPurposes: [],
          executionKind: "document",
          documentPurpose: "submitted_review_pack",
          outcomeScope: "task",
        };
      }
      return {
        schema: "athyper.process-execution-manifest/1" as const,
        scope,
        revision: revision(),
        profile: { ...revision(), code },
        cycle: { ...revision(), cycleTypeId: id(++n) },
        tasks,
        mandatoryGateCodes: ["supplier.readiness", "supplier.activation"],
        documents: (
          [
            "submitted_review_pack",
            "decision_document",
            "activation_confirmation",
          ] as const
        ).map((purpose, i) => ({
          purpose,
          template: {
            ...revision(),
            templateId: id(++n),
            bindingId: id(++n),
            locale: "en",
            variant: "default",
          },
          projection: { ...revision(), code: "supplier.snapshot" },
          recipientPolicy: revision(),
          source: (
            [
              "submitted_snapshot",
              "decision_snapshot",
              "result_snapshot",
            ] as const
          )[i]!,
          requiredBefore: (
            ["review_execution", "materialization", "cycle_completion"] as const
          )[i]!,
        })),
      };
    },
  );
  for (const m of manifests) (m.revision as any).hash = processManifestHash(m);
  const definition = {
    id: id(++n),
    tenantId: scope.tenantId,
    entityType: "supplier_onboarding",
    name: "Supplier requirement",
    priority: 1,
    evaluationMode: "first_match" as const,
    effectiveFrom: "2026-09-14",
    versionNo: 1,
    rules: (["basic", "standard", "enhanced"] as const).map((level, i) => ({
      id: id(++n),
      priority: (3 - i) * 10,
      condition: {
        "===": [{ var: "request.requestedComplianceLevel" }, level],
      },
      action: "require_workflow" as const,
      actionConfig: {
        schema: "athyper.process-selection-result/1",
        profile: manifests[i]!.profile,
      },
      metadata: {},
    })),
  };
  const authored = supplierRequirementPolicy({
    id: definition.id,
    tenantId: scope.tenantId,
    version: 1,
    effectiveFrom: definition.effectiveFrom,
    ruleIds: Object.fromEntries(
      definition.rules.map((r) => [(r.condition["==="] as any)[1], r.id]),
    ) as any,
    profiles: Object.fromEntries(
      manifests.map((m) => [m.profile.code, m.profile]),
    ) as any,
  });
  return {
    schema: "athyper.process-selection-publication/1",
    scope,
    factSchema: { ...revision(), code: "supplier_onboarding_requirement" },
    policy: {
      id: definition.id,
      definitionId: definition.id,
      version: 1,
      hash: calculateDefinitionHash(authored),
    },
    definition: authored,
    manifests,
    minimumControls: [
      {
        scope,
        authority: { ...revision(), owner: "business_partner" },
        minimumProfile: "standard",
        mandatoryGateCodes: ["supplier.readiness"],
      },
    ],
  };
}
