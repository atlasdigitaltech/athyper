import { describe, expect, it, vi } from "vitest";
import {
  createJsonRuleEvaluator,
  calculateDefinitionHash,
} from "@athyper/server-platform-policy";
import type {
  ProcessSelectionPublication,
  ProcessRevision,
  ProcessTaskBinding,
} from "@athyper/server-contract-control-admin";
import {
  compileProcessSelection,
  parseProcessSelectionAction,
  processManifestHash,
} from "./process-selection-compiler.js";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(): ProcessSelectionPublication {
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
  return {
    schema: "athyper.process-selection-publication/1",
    scope,
    factSchema: { ...revision(), code: "supplier_onboarding_requirement" },
    policy: {
      id: definition.id,
      definitionId: definition.id,
      version: 1,
      hash: calculateDefinitionHash(definition),
    },
    definition,
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
const ports = () => ({
  evaluator: createJsonRuleEvaluator(),
  isPublished: vi.fn(async () => true),
});
describe("process selection publication compiler", () => {
  it("pins information, supervisor and edit policies in the published manifest", async () => {
    const value = fixture(), p = ports();
    const editPolicy = { id: id(9000), definitionId: id(9000), version: 2, hash: "b".repeat(64), effectiveOn: "2026-09-14" };
    const publication = { ...value, manifests: value.manifests.map(m => {
      const next = { ...m, editPolicy, tasks: m.tasks.map(t => t.executionKind === "review" || t.executionKind === "approval"
        ? { ...t, informationPolicy: { schema: "athyper.task-information-policy/1" as const, clockMode: "elapsed" as const, responseHours: 24, overdueSupervisorRole: "supplier.supervisor" },
          escalationPolicy: { schema: "athyper.task-escalation-policy/1" as const, mode: "reassign" as const, supervisorRole: "supplier.supervisor" } } : t) };
      return { ...next, revision: { ...next.revision, hash: processManifestHash(next) } };
    }) };
    expect((await compileProcessSelection(publication, p)).valid).toBe(true);
    expect(p.isPublished).toHaveBeenCalledWith("edit_policy", editPolicy, value.scope);
  });
  it.each([
    { informationPolicy: null },
    { informationPolicy: { schema: "athyper.task-information-policy/1", clockMode: "elapsed", responseHours: 24, overdueSupervisorRole: "" } },
    { informationPolicy: { schema: "athyper.task-information-policy/1", clockMode: "elapsed", responseHours: 24, autoApprove: true } },
    { informationPolicy: { schema: "athyper.task-information-policy/1", clockMode: "elapsed", responseHours: 0 } },
    { informationPolicy: { schema: "athyper.task-information-policy/1", clockMode: "paused", responseHours: 24 } },
    { escalationPolicy: { schema: "athyper.task-escalation-policy/1", mode: "add_approval", supervisorRole: "supplier.supervisor" } },
    { escalationPolicy: { schema: "athyper.task-escalation-policy/1", mode: "reassign", supervisorRole: "" } },
  ])("rejects unsupported interaction controls even with a matching hash: %j", async patch => {
    const value = fixture();
    const publication = { ...value, manifests: value.manifests.map(m => {
      const next = { ...m, tasks: m.tasks.map(t => t.executionKind === "approval" ? { ...t, ...patch } as unknown as ProcessTaskBinding : t) };
      return { ...next, revision: { ...next.revision, hash: processManifestHash(next) } };
    }) };
    expect((await compileProcessSelection(publication, ports())).valid).toBe(false);
  });

  it("publishes explicit case authority without altering legacy bindings", async () => {
    const value = fixture();
    const publication = { ...value, manifests: value.manifests.map(m => {
      const next = { ...m, tasks: m.tasks.map(t => t.executionKind === "review" || t.executionKind === "approval"
        ? { ...t, caseAuthority: { schema: "athyper.task-case-authority/1" as const, returnForChanges: true, rejectProposal: false } } : t) };
      return { ...next, revision: { ...next.revision, hash: processManifestHash(next) } };
    }) };
    expect((await compileProcessSelection(publication, ports())).valid).toBe(true);
    expect((await compileProcessSelection(value, ports())).valid).toBe(true);
  });
  it.each([null, {}, { schema: "athyper.task-case-authority/1", returnForChanges: true, rejectProposal: "true" }])(
    "rejects malformed authority even when the manifest hash is correct: %j", async caseAuthority => {
      const value = fixture();
      const publication = { ...value, manifests: value.manifests.map(m => {
        const next = { ...m, tasks: m.tasks.map(t => t.executionKind === "review" || t.executionKind === "approval"
          ? { ...t, caseAuthority } as unknown as ProcessTaskBinding : t) };
        return { ...next, revision: { ...next.revision, hash: processManifestHash(next) } };
      }) };
      const result = await compileProcessSelection(publication, ports());
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.code === "UNSAFE_TASK_AUTHORITY")).toBe(true);
    });
  it("covers all three values using the existing evaluator and resolves exact scoped revisions", async () => {
    const value = fixture(),
      p = ports();
    const result = await compileProcessSelection(value, p);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(Object.values(result.mappings).map((p) => p.code)).toEqual([
      "simple",
      "standard",
      "enhanced",
    ]);
    expect(p.isPublished).toHaveBeenCalledWith(
      "policy",
      value.policy,
      value.scope,
    );
    expect(p.isPublished).toHaveBeenCalledWith(
      "template",
      value.manifests[0]!.documents[0]!.template,
      value.scope,
    );
    expect(result.publication).not.toBe(value);
  });
  it.each([
    [
      "missing value",
      (x: any) => x.definition.rules.pop(),
      "INVALID_RULE_COUNT",
    ],
    [
      "overlapping predicates",
      (x: any) =>
        (x.definition.rules[1].condition = x.definition.rules[0].condition),
      "AMBIGUOUS_OR_MISSING_ROUTE",
    ],
    [
      "duplicate priority",
      (x: any) =>
        (x.definition.rules[1].priority = x.definition.rules[0].priority),
      "AMBIGUOUS_RULE",
    ],
    [
      "wrong action",
      (x: any) => (x.definition.rules[0].action = "allow"),
      "UNSAFE_RESULT",
    ],
    [
      "extra action config",
      (x: any) => (x.definition.rules[0].actionConfig.workflowId = id(999)),
      "UNSAFE_RESULT",
    ],
    [
      "supplier type routing",
      (x: any) =>
        (x.definition.rules[0].condition["==="][0].var = "supplierType"),
      "UNDECLARED_FACT_OR_PREDICATE",
    ],
    [
      "accumulated selection",
      (x: any) => (x.definition.evaluationMode = "accumulate"),
      "INVALID_EVALUATION_MODE",
    ],
    [
      "missing revision hash",
      (x: any) => (x.manifests[0].cycle.hash = ""),
      "INVALID_REVISION",
    ],
    [
      "other tenant",
      (x: any) => (x.manifests[0].scope = { ...x.scope, tenantId: id(900) }),
      "SCOPE_MISMATCH",
    ],
    ["missing profile", (x: any) => x.manifests.pop(), "MISSING_PROFILE"],
    [
      "early approval",
      (x: any) =>
        (x.manifests[0].tasks[0].outcomeScope = "case_final_decision"),
      "UNSAFE_DECISION_AUTHORITY",
    ],
    [
      "review authorizes case",
      (x: any) => (x.manifests[0].tasks[1].executionKind = "review"),
      "UNSAFE_WORKFLOW",
    ],
    [
      "no maker checker",
      (x: any) => (x.manifests[0].tasks[1].makerChecker = false),
      "UNSAFE_WORKFLOW",
    ],
    [
      "broken task chain",
      (x: any) => (x.manifests[0].tasks[1].predecessorTaskTemplateId = null),
      "UNSAFE_TASK_ORDER",
    ],
    [
      "missing review pack gate",
      (x: any) => (x.manifests[0].tasks[1].requiredDocumentPurposes = []),
      "MISSING_DOCUMENT_GATE",
    ],
    [
      "missing document",
      (x: any) => x.manifests[0].documents.pop(),
      "MISSING_DOCUMENT_PURPOSE",
    ],
    [
      "incorrect document source",
      (x: any) => (x.manifests[0].documents[0].source = "result_snapshot"),
      "UNSAFE_DOCUMENT_GATE",
    ],
    [
      "no minimum authority",
      (x: any) => (x.minimumControls = []),
      "MISSING_MINIMUM_AUTHORITY",
    ],
    [
      "weakened minimum gate",
      (x: any) => (x.manifests[2].mandatoryGateCodes = []),
      "MINIMUM_CONTROL_WEAKENED",
    ],
  ])("rejects %s before publication", async (_name, mutate, code) => {
    const value = fixture();
    mutate(value);
    // These tests isolate semantic errors from the definition content hash check.
    (value.policy as any).hash = calculateDefinitionHash(value.definition);
    const result = await compileProcessSelection(value, ports());
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain(code);
  });
  it("rejects changed definition content under an old hash", async () => {
    const value = fixture();
    (value.definition as any).name = "changed";
    expect(
      (await compileProcessSelection(value, ports())).issues.map((i) => i.code),
    ).toContain("POLICY_REVISION_MISMATCH");
  });
  it("fails closed for missing or inaccessible published references", async () => {
    const p = ports();
    p.isPublished.mockResolvedValue(false);
    const result = await compileProcessSelection(fixture(), p);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("UNAVAILABLE_REVISION");
  });
  it("returns an issue for malformed wire input", async () => {
    expect((await compileProcessSelection({} as any, ports())).valid).toBe(
      false,
    );
  });
  it("never treats permitted/none or a raw workflow ID as a process result", () => {
    expect(parseProcessSelectionAction("none", {})).toBeUndefined();
    expect(
      parseProcessSelectionAction("require_workflow", { workflowId: id(1) }),
    ).toBeUndefined();
  });
});

for (const mismatch of [
  "revision_id",
  "global_policy",
  "process_family",
] as const)
  it(`P1a rejects ${mismatch} at publication`, async () => {
    const p = fixture();
    if (mismatch === "revision_id") (p.policy as any).id = id(9999);
    if (mismatch === "global_policy") delete (p.definition as any).tenantId;
    if (mismatch === "process_family")
      (p.scope as any).processFamily = "different_process";
    expect(await compileProcessSelection(p, ports())).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "POLICY_REVISION_MISMATCH" }),
      ]),
    });
  });
