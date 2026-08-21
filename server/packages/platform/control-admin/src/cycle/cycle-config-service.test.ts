import { describe, expect, it } from "vitest";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { CycleDesiredStatePayload, CycleTemplateDraft, CycleTemplateRepository, PublishCycleTemplateResult, PublishedCycleTemplate, SignedCycleDesiredStateRevision } from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { createCycleConfigService, cycleTemplateHash } from "./cycle-config-service.js";

const context = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "neon" } as VerifiedRequestContext;
const allow: Authorizer = { async authorize() { return { allowed: true }; } };

describe("control-admin CycleConfigService", () => {
  it("normalizes the complete aggregate and produces a stable DAG hash", async () => {
    const service = createCycleConfigService({ authorizer: allow, repositories: provider(repository()) });
    const preview = await service.preview(context, validTemplate());
    expect(preview.valid).toBe(true);
    expect(preview.topologicalTaskIds).toEqual(["task-a", "task-b", "task-c"]);
    const reordered = validTemplate(); reordered.tasks.reverse(); reordered.dependencies.reverse();
    expect(cycleTemplateHash(reordered)).toBe(preview.templateHash);
  });

  it("rejects missing references, duplicate ordering, cycles, and invalid carry targets", async () => {
    const draft = validTemplate();
    draft.phases.push({ ...draft.phases[0]!, id: "phase-2" });
    draft.tasks[1] = { ...draft.tasks[1]!, phaseId: "missing", completionMode: "system", systemCheckHandler: undefined };
    draft.dependencies.push({ predecessorTemplateId: "task-c", successorTemplateId: "task-a", dependencyType: "finish_to_start", isHard: true });
    draft.carryForwardRules.push({ deviationType: "exception", action: "auto_carry", targetCycleTypeId: "missing-type" });
    const preview = await createCycleConfigService({ authorizer: allow, repositories: provider(repository()) }).validate(context, draft);
    expect(new Set(preview.issues.map((item) => item.code))).toEqual(expect.objectContaining(new Set(["DUPLICATE_ORDER", "MISSING_REFERENCE", "INVALID_TASK_HANDLER", "CYCLIC_DEPENDENCY", "INVALID_CARRY_FORWARD_TARGET"])));
  });

  it("publishes complete immutable revisions with replay semantics", async () => {
    const service = createCycleConfigService({ authorizer: allow, repositories: provider(repository()) });
    await expect(service.publish({ context, template: validTemplate(), idempotencyKey: "publish-1", expectedLatestVersion: 0 })).resolves.toMatchObject({ kind: "published", value: { version: 1 } });
    await expect(service.publish({ context, template: validTemplate(), idempotencyKey: "publish-1", expectedLatestVersion: 0 })).resolves.toMatchObject({ kind: "replayed", value: { version: 1 } });
  });

  it("verifies and idempotently materializes a plane-targeted Studio revision", async () => {
    const store = repository();
    const verifier = { async verify(payload: CycleDesiredStatePayload) { return payload.templateHash === cycleTemplateHash(payload.template); } };
    const service = createCycleConfigService({ authorizer: allow, repositories: provider(store), desiredStateVerifier: verifier });
    const revision = desiredState();
    await expect(service.applyDesiredState({ context, revision })).resolves.toMatchObject({ kind: "published" });
    await expect(service.applyDesiredState({ context, revision })).resolves.toMatchObject({ kind: "replayed" });
    await expect(service.applyDesiredState({ context, revision: { ...revision, targetPlane: "mesh" } })).rejects.toMatchObject({ code: "CONTROL_ADMIN_DESIRED_STATE_TARGET_MISMATCH" });
  });

  it("separates manage and read permissions", async () => {
    const seen: string[] = [];
    const authorizer: Authorizer = { async authorize(request) { seen.push(request.permissionCode); return { allowed: true }; } };
    const store = repository(); const service = createCycleConfigService({ authorizer, repositories: provider(store) });
    await service.publish({ context, template: validTemplate(), idempotencyKey: "one" });
    await service.readPublished(context, validTemplate().cycleType.id);
    expect(seen).toEqual(["control.cycle_template.manage", "control.catalog.read"]);
  });

  it("keeps identical tenant control updates and reads in the request plane", async () => {
    const neon = repository(); const studio = repository();
    const service = createCycleConfigService({ authorizer: allow, repositories: createExactPlaneRepositoryProvider({ neon, studio }) });
    const studioContext = { ...context, planeKey: "studio" as const };
    await service.publish({ context, template: validTemplate(), idempotencyKey: "same-key" });
    await service.publish({ context: studioContext, template: { ...validTemplate(), cycleType: { ...validTemplate().cycleType, name: "Studio month end" } }, idempotencyKey: "same-key" });
    await expect(service.readPublished(context, validTemplate().cycleType.id)).resolves.toMatchObject({ template: { cycleType: { name: "Month end" } } });
    await expect(service.readPublished(studioContext, validTemplate().cycleType.id)).resolves.toMatchObject({ template: { cycleType: { name: "Studio month end" } } });
  });
});

function desiredState(): SignedCycleDesiredStateRevision { const template = validTemplate(); return { schema: "athyper.cycle-template-desired-state/1.0", desiredStateId: "desired-1", sourceBlueprintId: "blueprint-1", sourceRevision: 7, targetPlane: "neon", tenantId: context.tenantId, template, templateHash: cycleTemplateHash(template), issuedAt: "2026-08-11T00:00:00.000Z", signature: { algorithm: "Ed25519", keyId: "studio-1", value: "signed" } }; }
function validTemplate(): Mutable<CycleTemplateDraft> { return { cycleType: { id: "cycle-type-1", code: "MONTH_END", name: "Month end", domainCode: "finance.close", frequency: "monthly", cleanCyclePolicy: {}, approvalPolicy: {}, runDataSchema: {}, taskDataSchema: {} }, phases: [{ id: "phase-1", code: "CLOSE", name: "Close", sortOrder: 1, isGateEnforced: true }], categories: [{ id: "category-1", code: "CONTROL", name: "Control", sortOrder: 1 }], tasks: [{ id: "task-a", phaseId: "phase-1", categoryId: "category-1", entityCode: "finance.close", code: "A", name: "A", completionMode: "manual", isMandatory: true, isWaivable: false, sortOrder: 1, applicability: {} }, { id: "task-b", phaseId: "phase-1", categoryId: "category-1", entityCode: "finance.close", code: "B", name: "B", completionMode: "manual", isMandatory: true, isWaivable: false, sortOrder: 2, applicability: {} }, { id: "task-c", phaseId: "phase-1", categoryId: "category-1", entityCode: "finance.close", code: "C", name: "C", completionMode: "manual", isMandatory: true, isWaivable: false, sortOrder: 3, applicability: {} }], dependencies: [{ predecessorTemplateId: "task-a", successorTemplateId: "task-c", dependencyType: "finish_to_start", isHard: true }, { predecessorTemplateId: "task-b", successorTemplateId: "task-c", dependencyType: "finish_to_start", isHard: true }], crossDependencies: [], carryForwardRules: [] }; }
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? U[] : T[K] };
function repository(): CycleTemplateRepository { let published: PublishedCycleTemplate | undefined; let key: string | undefined; return { async externalPhaseExists() { return false; }, async cycleTypeExists() { return false; }, async publish(input): Promise<PublishCycleTemplateResult> { if (published && key === input.idempotencyKey) return { kind: "replayed", value: published }; key = input.idempotencyKey; published = { ...input.preview, id: "revision-1", tenantId: input.tenantId, version: 1, publishedAt: "2026-08-11T00:00:00.000Z", publishedBy: input.principalId }; return { kind: "published", value: published }; }, async getPublished() { return published; } }; }
function provider(repository: CycleTemplateRepository) { return createExactPlaneRepositoryProvider({ neon: repository }); }
