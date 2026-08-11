import { describe, expect, it } from "vitest";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { CycleReadinessSource, CycleTask, PublishedCycleTemplate } from "@athyper/server-contract-governance";
import { createCycleCertificationService, createCycleDeviationService, createCycleRunService, createCycleTaskService } from "./cycle-execution-services.js";
import { InMemoryCycleExecutionRepository } from "./in-memory-cycle-execution-repository.js";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";

const allow: Authorizer = { authorize: async () => ({ allowed: true }) };
const author = context("author"); const certifier = context("certifier");

describe("G2 cycle execution", () => {
  it("atomically instantiates a pinned fan-in/fan-out DAG and replays creation", async () => {
    const env = setup(); const created = await env.runs.create(command());
    expect(created.run.templateRevisionNumber).toBe(3);
    expect(created.tasks.filter((task) => task.status === "ready").map((task) => task.code).sort()).toEqual(["A", "B"]);
    expect(created.dependencies).toHaveLength(3);
    const replay = await env.runs.create(command());
    expect(replay).toMatchObject({ kind: "replayed", run: { id: created.run.id } });
  });

  it("handles concurrent fan-in completion without prematurely unlocking the successor", async () => {
    const env = setup(); const created = await start(env); const [a, b, c] = byCode(created.tasks);
    await startTask(env, a); await startTask(env, b);
    await Promise.all([env.tasks.complete(author, a.id, { artifactId: "a-proof" }), env.tasks.complete(author, b.id, { artifactId: "b-proof" })]);
    const tasks = await snapshotTasks(env.repository, created.run.id); expect(tasks.find((task) => task.id === c.id)?.status).toBe("ready");
    const d = tasks.find((task) => task.code === "D")!; expect(d.status).toBe("pending");
    await startTask(env, tasks.find((task) => task.id === c.id)!); await env.tasks.complete(author, c.id, { check: "passed" });
    expect((await snapshotTasks(env.repository, created.run.id)).find((task) => task.id === d.id)?.status).toBe("ready");
  });

  it("keeps successors locked when a dependency blocks and requires completion evidence", async () => {
    const env = setup(); const created = await start(env); const [a, b, c] = byCode(created.tasks);
    await startTask(env, a); await startTask(env, b);
    await expect(env.tasks.complete(author, a.id, {})).rejects.toMatchObject({ code: "GOVERNANCE_EVIDENCE_REQUIRED" });
    await env.tasks.complete(author, a.id, { proof: true }); await env.tasks.block(author, b.id, { error: "source failed" });
    expect((await snapshotTasks(env.repository, created.run.id)).find((task) => task.id === c.id)?.status).toBe("pending");
  });

  it("carries deviations forward exactly once and preserves the source trace", async () => {
    const env = setup(); const first = await env.runs.create(command()); const second = await env.runs.create({ ...command(), idempotencyKey: "run-2", code: "CLOSE.2026-09" });
    const deviation = await env.deviations.create(author, { runId: first.run.id, type: "exception", description: "Late bank statement", severity: "high" });
    const carried = await env.deviations.carryForward(author, deviation.id, second.run.id, "carry-1");
    const replay = await env.deviations.carryForward(author, deviation.id, second.run.id, "carry-1");
    expect(carried.deviation).toMatchObject({ carriedFromDeviationId: deviation.id, cycleRunId: second.run.id, carryCount: 1 });
    expect(replay).toMatchObject({ kind: "replayed", deviation: { id: carried.deviation.id } });
  });

  it("enforces author/certifier separation, evidence snapshots, and approved immutability", async () => {
    const env = setup(); const created = await start(env); await completeAll(env, created.tasks);
    const certification = await env.certifications.create(author, { runId: created.run.id, certificationTypeCode: "finance.close", statement: "The close is complete." });
    await expect(env.certifications.submit(author, certification.id, "", { taskCount: 4 })).rejects.toMatchObject({ code: "GOVERNANCE_INVALID_COMMAND" });
    const submitted = await env.certifications.submit(author, certification.id, "snapshot-1", { taskCount: 4 });
    await expect(env.certifications.certify(author, submitted.id, "sig-author")).rejects.toMatchObject({ code: "GOVERNANCE_REVIEWER_SEPARATION_REQUIRED" });
    const approved = await env.certifications.certify(certifier, submitted.id, "sig-reviewer");
    expect(approved).toMatchObject({ status: "approved", certifiedBy: certifier.principalId, evidenceSnapshotId: "snapshot-1" });
    await expect(env.certifications.reject(certifier, approved.id, "changed mind")).rejects.toMatchObject({ code: "GOVERNANCE_CERTIFICATION_IMMUTABLE" });
    await expect(env.tasks.reopen(author, created.tasks[0]!.id, "late change")).rejects.toMatchObject({ code: "GOVERNANCE_CYCLE_IMMUTABLE" });
  });

  it("sources close readiness from finance before certification or run completion", async () => {
    let financeReady = false; const source: CycleReadinessSource = { evaluate: async () => ({ ready: financeReady, evaluatedAt: "2026-08-11T00:00:00.000Z", evidence: { source: "finance.close-readiness" }, reasons: financeReady ? [] : ["finance_not_ready"] }) };
    const env = setup(source); const created = await start(env, { closeCoordinate: { companyCodeId: "company", ledgerBookId: "book", fiscalPeriodId: "period" } }); await completeAll(env, created.tasks);
    const certification = await env.certifications.create(author, { runId: created.run.id, certificationTypeCode: "finance.close", statement: "Ready" });
    await env.certifications.submit(author, certification.id, "snapshot-finance", { source: "finance" });
    await expect(env.certifications.certify(certifier, certification.id, "signature")).rejects.toMatchObject({ code: "GOVERNANCE_CYCLE_NOT_READY" });
    await expect(env.runs.transition(author, created.run.id, "completed")).rejects.toMatchObject({ code: "GOVERNANCE_CYCLE_NOT_READY" });
    financeReady = true; await expect(env.certifications.certify(certifier, certification.id, "signature")).resolves.toMatchObject({ status: "approved" });
    await expect(env.runs.readiness(author, created.run.id)).resolves.toMatchObject({ ready: true, evidence: { finance: { source: "finance.close-readiness" } } });
  });

  it("keeps identical tenant cycle reads and transitions in the request plane", async () => {
    const neon = new InMemoryCycleExecutionRepository([template()]); const studio = new InMemoryCycleExecutionRepository([template()]); let sequence = 0;
    const runs = createCycleRunService({ authorizer: allow, repositories: createExactPlaneRepositoryProvider({ neon, studio }), now: () => new Date("2026-08-11T00:00:00.000Z"), id: () => `plane-id-${++sequence}` });
    const studioContext = { ...author, planeKey: "studio" as const };
    const neonRun = await runs.create({ ...command(), name: "Neon close" });
    const studioRun = await runs.create({ ...command(), context: studioContext, name: "Studio close" });
    await runs.transition(author, neonRun.run.id, "running");
    const neonStored = await neon.transaction(author, (store) => store.getRun(neonRun.run.id));
    const studioStored = await studio.transaction(studioContext, (store) => store.getRun(studioRun.run.id));
    expect(neonStored).toMatchObject({ name: "Neon close", status: "running" });
    expect(studioStored).toMatchObject({ name: "Studio close", status: "draft" });
    await expect(runs.readiness(author, studioRun.run.id)).rejects.toMatchObject({ code: "GOVERNANCE_CYCLE_RUN_NOT_FOUND" });
  });
});

function setup(readinessSource?: CycleReadinessSource) { let sequence = 0; const repository = new InMemoryCycleExecutionRepository([template()]); const options = { authorizer: allow, repositories: createExactPlaneRepositoryProvider({ neon: repository }), ...(readinessSource ? { readinessSource } : {}), now: () => new Date("2026-08-11T00:00:00.000Z"), id: () => `id-${++sequence}` }; return { repository, runs: createCycleRunService(options), tasks: createCycleTaskService(options), deviations: createCycleDeviationService(options), certifications: createCycleCertificationService(options) }; }
async function start(env: ReturnType<typeof setup>, data: Readonly<Record<string, unknown>> = {}) { const created = await env.runs.create({ ...command(), data }); await env.runs.transition(author, created.run.id, "running"); return created; }
async function startTask(env: ReturnType<typeof setup>, task: CycleTask): Promise<void> { await env.tasks.claim(author, task.id); await env.tasks.start(author, task.id); }
async function completeAll(env: ReturnType<typeof setup>, original: readonly CycleTask[]): Promise<void> { for (const code of ["A", "B", "C", "D"]) { const task = (await snapshotTasks(env.repository, original[0]!.cycleRunId)).find((item) => item.code === code)!; await startTask(env, task); await env.tasks.complete(author, task.id, { artifact: `${code}-proof` }); } }
async function snapshotTasks(repository: InMemoryCycleExecutionRepository, runId: string): Promise<readonly CycleTask[]> { return repository.transaction(author, (store) => store.listTasks(runId)); }
function byCode(tasks: readonly CycleTask[]): [CycleTask, CycleTask, CycleTask] { return [tasks.find((task) => task.code === "A")!, tasks.find((task) => task.code === "B")!, tasks.find((task) => task.code === "C")!]; }
function context(principalId: string): VerifiedRequestContext { return { planeKey: "neon", tenantId: "tenant-1", principalId } as VerifiedRequestContext; }
function command() { return { context: author, cycleTypeId: "cycle-type-1", idempotencyKey: "run-1", code: "CLOSE.2026-08", name: "August close", periodStart: "2026-08-01", periodEnd: "2026-08-31" }; }
function template(): PublishedCycleTemplate { const tasks = ["A", "B", "C", "D"].map((code, index) => ({ id: `template-${code}`, phaseId: "phase-1", categoryId: "category-1", entityCode: "finance.close", code, name: code, completionMode: "manual" as const, isMandatory: true, isWaivable: false, sortOrder: index + 1, applicability: {} })); return { schema: "athyper.cycle-template/1.0", id: "revision-3", tenantId: "tenant-1", version: 3, publishedAt: "2026-08-10T00:00:00.000Z", publishedBy: "publisher", templateHash: "a".repeat(64), valid: true, issues: [], topologicalTaskIds: tasks.map((task) => task.id), template: { cycleType: { id: "cycle-type-1", code: "MONTH_END", name: "Month end", domainCode: "finance.close", frequency: "monthly", cleanCyclePolicy: {}, approvalPolicy: {}, runDataSchema: {}, taskDataSchema: {} }, phases: [{ id: "phase-1", code: "CLOSE", name: "Close", sortOrder: 1, isGateEnforced: true }], categories: [{ id: "category-1", code: "CONTROL", name: "Control", sortOrder: 1 }], tasks, dependencies: [{ predecessorTemplateId: "template-A", successorTemplateId: "template-C", dependencyType: "finish_to_start", isHard: true }, { predecessorTemplateId: "template-B", successorTemplateId: "template-C", dependencyType: "finish_to_start", isHard: true }, { predecessorTemplateId: "template-C", successorTemplateId: "template-D", dependencyType: "finish_to_start", isHard: true }], crossDependencies: [], carryForwardRules: [] } }; }
