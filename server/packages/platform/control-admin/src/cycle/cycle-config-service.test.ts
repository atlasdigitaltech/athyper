import { describe, expect, it, vi } from "vitest";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { CycleDesiredStatePayload, CycleTemplateDraft, CycleTemplateRepository, PublishCycleTemplateResult, PublishedCycleTemplate, SignedCycleDesiredStateRevision } from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { createCycleConfigService, cycleTemplateHash } from "./cycle-config-service.js";

import { desiredState, validTemplate } from "./cycle-test-fixtures.js";

const context = { tenantId: "00000000-0000-4000-8000-000000000001", principalId: "principal-1", planeKey: "neon" } as VerifiedRequestContext;
const allow: Authorizer = { async authorize() { return { allowed: true }; } };

describe("control-admin CycleConfigService", () => {
  it("normalizes the complete aggregate and produces a stable DAG hash", async () => {
    const service = createCycleConfigService({ authorizer: allow, repositories: provider(repository()) });
    const preview = await service.preview(context, validTemplate());
    expect(preview.valid).toBe(true);
    expect(preview.topologicalTaskIds).toEqual(["00000000-0000-4000-8000-000000000006", "00000000-0000-4000-8000-000000000007", "00000000-0000-4000-8000-000000000008"]);
    const reordered = validTemplate(); reordered.tasks.reverse(); reordered.dependencies.reverse();
    expect(cycleTemplateHash(reordered)).toBe(preview.templateHash);
  });

  it("rejects missing references, duplicate ordering, cycles, and invalid carry targets", async () => {
    const draft = validTemplate();
    draft.phases.push({ ...draft.phases[0]!, id: "00000000-0000-4000-8000-000000000004" });
    draft.tasks[1] = { ...draft.tasks[1]!, phaseId: "00000000-0000-4000-8000-000000000009", completionMode: "system", systemCheckHandler: undefined };
    draft.dependencies.push({ predecessorTemplateId: "00000000-0000-4000-8000-000000000008", successorTemplateId: "00000000-0000-4000-8000-000000000006", dependencyType: "finish_to_start", isHard: true });
    draft.carryForwardRules.push({ deviationType: "exception", action: "auto_carry", targetCycleTypeId: "00000000-0000-4000-8000-000000000010" });
    const preview = await createCycleConfigService({ authorizer: allow, repositories: provider(repository()) }).validate(context, draft);
    expect(preview.issues.map((item) => item.code)).toEqual(expect.arrayContaining(["DUPLICATE_ORDER", "MISSING_REFERENCE", "INVALID_TASK_HANDLER", "CYCLIC_DEPENDENCY", "INVALID_CARRY_FORWARD_TARGET"]));
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

function repository(): CycleTemplateRepository { let published: PublishedCycleTemplate | undefined; let key: string | undefined; return { async externalPhaseExists() { return false; }, async cycleTypeExists() { return false; }, async publish(input): Promise<PublishCycleTemplateResult> { if (published && key === input.idempotencyKey) return { kind: "replayed", value: published }; key = input.idempotencyKey; published = { ...input.preview, id: "revision-1", tenantId: input.tenantId, version: 1, publishedAt: "2026-08-11T00:00:00.000Z", publishedBy: input.principalId }; return { kind: "published", value: published }; }, async getPublished() { return published; } }; }
function provider(repository: CycleTemplateRepository) { return createExactPlaneRepositoryProvider({ neon: repository }); }

describe("cycle configuration validation boundaries", () => {
  const serviceFor = (store: CycleTemplateRepository = repository()) => createCycleConfigService({ authorizer: allow, repositories: provider(store) });
  it.each([
    { phases: [null] }, { tasks: [{}] }, { categories: "bad" }, { dependencies: [{ isHard: true }] },
    { carryForwardRules: [{ deviationType: "exception", action: "unknown" }] }, { crossDependencies: [null] }, { unexpected: true },
  ])("rejects malformed nested aggregate %j before publication", async fields => {
    const store = repository(); const publish = vi.spyOn(store, "publish");
    await expect(serviceFor(store).publish({ context, template: { ...validTemplate(), ...fields } as CycleTemplateDraft, idempotencyKey: "one" })).rejects.toMatchObject({ statusCode: 400 });
    expect(publish).not.toHaveBeenCalled();
  });
  it.each([{ minimumReadinessPct: 101 }, { minimumReadinessPct: -1 }, { targetHoursFromStart: 0 }, { sortOrder: -1 }, { isGateEnforced: "yes" }])("rejects phase field bounds/types %j", async fields => {
    const template = validTemplate();
    template.phases[0] = { ...template.phases[0]!, ...fields } as CycleTemplateDraft["phases"][number];
    await expect(serviceFor().preview(context, template)).rejects.toMatchObject({ statusCode: 400 });
  });
  it.each([null, true, "0", -1, 0.5, Number.MAX_SAFE_INTEGER])("rejects invalid expected version %s", async expectedLatestVersion => {
    await expect(serviceFor().publish({ context, template: validTemplate(), idempotencyKey: "one", expectedLatestVersion: expectedLatestVersion as number })).rejects.toMatchObject({ statusCode: 400 });
  });
  it("rejects blank idempotency keys and invalid stored/read identifiers", async () => {
    await expect(serviceFor().publish({ context, template: validTemplate(), idempotencyKey: " " })).rejects.toMatchObject({ statusCode: 400 });
    await expect(serviceFor().readPublished(context, "not-a-uuid")).rejects.toMatchObject({ statusCode: 400 });
    for (const version of [0, -1, 0.5, Number.MAX_SAFE_INTEGER]) await expect(serviceFor().readPublished(context, validTemplate().cycleType.id, version)).rejects.toMatchObject({ statusCode: 400 });
  });
  it("does not expose a task ordering for self-dependencies or duplicate IDs", async () => {
    const template = validTemplate();
    template.dependencies.push({ predecessorTemplateId: template.tasks[0]!.id, successorTemplateId: template.tasks[0]!.id, dependencyType: "finish_to_start", isHard: true });
    const preview = await serviceFor().preview(context, template);
    expect(preview).toMatchObject({ valid: false, topologicalTaskIds: [] });
    expect(preview.issues.map(item => item.code)).toContain("SELF_DEPENDENCY");
    template.dependencies.pop(); template.tasks.push(template.tasks[0]!);
    await expect(serviceFor().preview(context, template)).resolves.toMatchObject({ valid: false, topologicalTaskIds: [] });
  });
  it("rejects duplicate and self-referencing cross-cycle edges", async () => {
    const template = validTemplate();
    const edge = { predecessorTypeId: template.cycleType.id, successorTypeId: template.cycleType.id, predecessorPhaseId: template.phases[0]!.id, successorPhaseId: template.phases[0]!.id, isHard: true };
    template.crossDependencies.push(edge, edge);
    const preview = await serviceFor().preview(context, template);
    expect(preview.valid).toBe(false);
    expect(preview.issues.map(item => item.code)).toEqual(expect.arrayContaining(["SELF_DEPENDENCY", "DUPLICATE_DEPENDENCY"]));
  });
  it("returns an independent normalized snapshot", async () => {
    const template = validTemplate(); const preview = await serviceFor().preview(context, template);
    template.cycleType = { ...template.cycleType, name: "Changed after preview" };
    expect(preview.template.cycleType.name).toBe("Month end");
    expect(cycleTemplateHash(preview.template)).toBe(preview.templateHash);
  });
  it("rejects non-JSON policy data instead of hashing silently altered values", async () => {
    const template = validTemplate();
    template.cycleType = { ...template.cycleType, approvalPolicy: { threshold: Number.NaN } };
    await expect(serviceFor().preview(context, template)).rejects.toMatchObject({ statusCode: 400 });
  });
  it.each([{ schema: "unknown" }, { sourceRevision: 0 }, { sourceRevision: 1.5 }, { issuedAt: "not-a-date" }, { signature: null }, { signature: { algorithm: "Ed25519", keyId: " ", value: "signed" } }, { sourceBlueprintId: " " }])("rejects malformed signed revisions %j without publishing", async fields => {
    const store = repository(), publish = vi.spyOn(store, "publish"), verify = vi.fn(async () => true);
    const service = createCycleConfigService({ authorizer: allow, repositories: provider(store), desiredStateVerifier: { verify } });
    await expect(service.applyDesiredState({ context, revision: { ...desiredState(), ...fields } as SignedCycleDesiredStateRevision })).rejects.toMatchObject({ statusCode: 400 });
    expect(verify).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
  });
  it("rejects missing verifiers, bad signatures, tampered hashes, and wrong tenant targets", async () => {
    const store = repository(), publish = vi.spyOn(store, "publish");
    await expect(serviceFor(store).applyDesiredState({ context, revision: desiredState() })).rejects.toMatchObject({ statusCode: 403, code: "CONTROL_ADMIN_DESIRED_STATE_SIGNATURE_INVALID" });
    const service = createCycleConfigService({ authorizer: allow, repositories: provider(store), desiredStateVerifier: { verify: async () => false } });
    await expect(service.applyDesiredState({ context, revision: desiredState() })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.applyDesiredState({ context, revision: { ...desiredState(), templateHash: "a".repeat(64) } })).rejects.toMatchObject({ code: "CONTROL_ADMIN_DESIRED_STATE_HASH_INVALID" });
    await expect(service.applyDesiredState({ context, revision: { ...desiredState(), tenantId: "00000000-0000-4000-8000-000000000099" } })).rejects.toMatchObject({ statusCode: 403, code: "CONTROL_ADMIN_DESIRED_STATE_TARGET_MISMATCH" });
    expect(publish).not.toHaveBeenCalled();
  });
  it("returns intentional errors for missing revisions and unavailable planes", async () => {
    await expect(serviceFor().readPublished(context, validTemplate().cycleType.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(serviceFor().preview({ ...context, planeKey: "mesh" }, validTemplate())).rejects.toMatchObject({ statusCode: 503 });
  });
});

it('rejects a two-phase dependency cycle even when task dependencies are acyclic',async()=>{
 const draft=validTemplate(),first=draft.phases[0]!,second={...first,id:'00000000-0000-4000-8000-000000000044',code:'SECOND',sortOrder:2};draft.phases.push(second);
 draft.crossDependencies.push(...[[first.id,second.id],[second.id,first.id]].map(([from,to])=>({predecessorTypeId:draft.cycleType.id,successorTypeId:draft.cycleType.id,predecessorPhaseId:from!,successorPhaseId:to!,isHard:true})));
 const preview=await createCycleConfigService({authorizer:allow,repositories:provider(repository())}).preview(context,draft);expect(preview.valid).toBe(false);expect(preview.issues).toContainEqual(expect.objectContaining({code:'CYCLIC_DEPENDENCY',path:'crossDependencies'}));
});
