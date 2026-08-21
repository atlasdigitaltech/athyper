import { randomUUID } from "node:crypto";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { governancePermissions, type CreateCycleRunCommand, type CycleCertification, type CycleCertificationService, type CycleDeviation, type CycleDeviationService, type CycleExecutionRepository, type CycleExecutionStore, type CycleReadinessResult, type CycleReadinessSource, type CycleRun, type CycleRunService, type CycleRunStatus, type CycleTask, type CycleTaskDependency, type CycleTaskService } from "@athyper/server-contract-governance";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";

export interface CycleExecutionServiceOptions {
  readonly authorizer: Authorizer; readonly repositories: ExactPlaneRepositoryProvider<CycleExecutionRepository>; readonly readinessSource?: CycleReadinessSource;
  readonly now?: () => Date; readonly id?: () => string;
}

export function createCycleRunService(options: CycleExecutionServiceOptions): CycleRunService {
  const now = options.now ?? (() => new Date()); const id = options.id ?? randomUUID;
  return {
    async create(command: CreateCycleRunCommand) {
      await permitted(options.authorizer, command.context, governancePermissions.cycleExecute);
      required(command.idempotencyKey, "idempotencyKey"); required(command.code, "code"); required(command.name, "name");
      return exactRepository(options, command.context).transaction(command.context, async (store) => {
        const replay = await store.findRunByIdempotencyKey(command.idempotencyKey);
        if (replay) {
          if (replay.cycleTypeId !== command.cycleTypeId || replay.code !== command.code || (command.templateVersion !== undefined && replay.templateRevisionNumber !== command.templateVersion)) fail("GOVERNANCE_IDEMPOTENCY_CONFLICT");
          return { kind: "replayed" as const, run: replay, tasks: await store.listTasks(replay.id), dependencies: await store.listDependencies(replay.id) };
        }
        const template = await store.getPublishedTemplate(command.cycleTypeId, command.templateVersion);
        if (!template) fail("GOVERNANCE_CYCLE_TEMPLATE_NOT_FOUND");
        let parent: CycleRun | undefined;
        if (command.parentCycleRunId) {
          parent = await store.getRun(command.parentCycleRunId);
          if (!parent) fail("GOVERNANCE_PARENT_CYCLE_NOT_FOUND");
          if (!["scheduled", "running", "blocked"].includes(parent.status)) fail("GOVERNANCE_PARENT_CYCLE_INVALID");
          if (!contains(parent.periodStart, parent.periodEnd, command.periodStart, command.periodEnd)) fail("GOVERNANCE_PARENT_CYCLE_PERIOD_INVALID");
        }
        const at = now().toISOString();
        const run: CycleRun = { id: id(), tenantId: command.context.tenantId, cycleTypeId: command.cycleTypeId, templateRevisionId: template.id, templateRevisionNumber: template.version, templateHash: template.templateHash, code: command.code, name: command.name, ...(command.periodStart ? { periodStart: command.periodStart } : {}), ...(command.periodEnd ? { periodEnd: command.periodEnd } : {}), ...(command.scheduledStartAt ? { scheduledStartAt: command.scheduledStartAt } : {}), ...(command.dueAt ? { dueAt: command.dueAt } : {}), ...(command.parentCycleRunId ? { parentCycleRunId: command.parentCycleRunId } : {}), ...(command.ownerPrincipalId ? { ownerPrincipalId: command.ownerPrincipalId } : {}), idempotencyKey: command.idempotencyKey, data: command.data ?? {}, status: command.scheduledStartAt ? "scheduled" : "draft", createdAt: at, createdBy: command.context.principalId, updatedAt: at, updatedBy: command.context.principalId, version: 1 };
        const taskIds = new Map(template.template.tasks.map((task) => [task.id, id()]));
        const dependencyTemplates = template.template.dependencies;
        const tasks: CycleTask[] = template.template.tasks.map((task) => ({ id: taskIds.get(task.id)!, tenantId: run.tenantId, cycleRunId: run.id, cycleTypeId: run.cycleTypeId, taskTemplateId: task.id, phaseId: task.phaseId, code: task.code, name: task.name, completionMode: task.completionMode, isMandatory: task.isMandatory, isWaivable: task.isWaivable, completionEvidence: {}, status: dependencyTemplates.some((edge) => edge.successorTemplateId === task.id) ? "pending" : "ready", createdAt: at, createdBy: command.context.principalId, updatedAt: at, updatedBy: command.context.principalId, version: 1 }));
        const dependencies: CycleTaskDependency[] = dependencyTemplates.map((edge) => ({ id: id(), tenantId: run.tenantId, cycleRunId: run.id, predecessorTaskId: taskIds.get(edge.predecessorTemplateId)!, successorTaskId: taskIds.get(edge.successorTemplateId)!, dependencyType: edge.dependencyType, isHard: edge.isHard }));
        await store.putRun(run); for (const task of tasks) await store.putTask(task); for (const dependency of dependencies) await store.putDependency(dependency); await store.recordRunIdempotencyKey(command.idempotencyKey, run.id);
        return { kind: "created" as const, run, tasks, dependencies };
      });
    },
    async transition(context, runId, status) {
      await permitted(options.authorizer, context, governancePermissions.cycleExecute);
      return exactRepository(options, context).transaction(context, async (store) => {
        const run = await requireRun(store, runId); const allowed = runTransitions[run.status];
        if (!allowed.includes(status)) fail("GOVERNANCE_INVALID_TRANSITION", { from: run.status, to: status });
        if (status === "running" && run.parentCycleRunId) { const parent = await requireRun(store, run.parentCycleRunId); if (!['running','blocked'].includes(parent.status)) fail("GOVERNANCE_PARENT_CYCLE_INVALID"); }
        if (status === "completed") { await assertRunReady(options, context, store, run); if ((await store.listChildRuns(run.id)).some((child) => !["completed", "cancelled"].includes(child.status))) fail("GOVERNANCE_CHILD_CYCLE_ACTIVE"); }
        if (status === "cancelled" && (await store.listChildRuns(run.id)).some((child) => !["completed", "cancelled"].includes(child.status))) fail("GOVERNANCE_CHILD_CYCLE_ACTIVE");
        const at = now().toISOString(); const updated: CycleRun = { ...run, status, ...(status === "running" && !run.startedAt ? { startedAt: at } : {}), ...(status === "completed" ? { completedAt: at } : {}), updatedAt: at, updatedBy: context.principalId, version: run.version + 1 };
        await store.putRun(updated); return updated;
      });
    },
    async readiness(context, runId) {
      await permitted(options.authorizer, context, governancePermissions.cycleExecute);
      return exactRepository(options, context).transaction(context, async (store) => runReadiness(options, context, store, await requireRun(store, runId)));
    },
  };
}

export function createCycleTaskService(options: CycleExecutionServiceOptions): CycleTaskService {
  const now = options.now ?? (() => new Date());
  const change = async (context: VerifiedRequestContext, taskId: string, action: "claim" | "start" | "complete" | "block" | "waive" | "reopen", evidence: Readonly<Record<string, unknown>> = {}, owner?: string): Promise<CycleTask> => {
    await permitted(options.authorizer, context, governancePermissions.cycleExecute);
    return exactRepository(options, context).transaction(context, async (store) => {
      const task = await requireTask(store, taskId); const run = await requireRun(store, task.cycleRunId); await assertRunMutable(store, run);
      if (!["running", "blocked"].includes(run.status)) fail("GOVERNANCE_CYCLE_RUN_NOT_ACTIVE");
      const dependencies = await store.listDependencies(run.id); const tasks = await store.listTasks(run.id); const passed = dependenciesPass(task.id, dependencies, tasks);
      let status = task.status; let assigned = task.ownerPrincipalId; const at = now().toISOString();
      if (action === "claim") { if (task.status !== "ready") invalidTask(task, action); if (task.ownerPrincipalId && task.ownerPrincipalId !== context.principalId) fail("GOVERNANCE_TASK_ALREADY_CLAIMED"); assigned = owner ?? context.principalId; }
      if (action === "start") { if (task.status !== "ready" || !passed) invalidTask(task, action); assertOwner(task, context); status = "in_progress"; }
      if (action === "complete") { if (task.status !== "in_progress") invalidTask(task, action); assertOwner(task, context); nonempty(evidence, "completion evidence"); status = "completed"; }
      if (action === "block") { if (!["ready", "in_progress"].includes(task.status)) invalidTask(task, action); nonempty(evidence, "blocking evidence"); status = "blocked"; }
      if (action === "waive") { if (!task.isWaivable || !["ready", "in_progress", "blocked"].includes(task.status)) invalidTask(task, action); nonempty(evidence, "waiver evidence"); status = "waived"; }
      if (action === "reopen") { if (!["completed", "waived", "blocked"].includes(task.status)) invalidTask(task, action); nonempty(evidence, "reopen reason"); status = passed ? "ready" : "pending"; }
      const taskBase = action === "reopen" ? withoutCompletedAt(task) : task;
      const updated: CycleTask = { ...taskBase, ...(assigned ? { ownerPrincipalId: assigned } : {}), status, ...(action === "start" && !task.startedAt ? { startedAt: at } : {}), ...(status === "completed" || status === "waived" ? { completedAt: at } : {}), completionEvidence: ["complete", "block", "waive", "reopen"].includes(action) ? evidence : task.completionEvidence, updatedAt: at, updatedBy: context.principalId, version: task.version + 1 };
      await store.putTask(updated);
      if (status === "completed" || status === "waived") await unlockSuccessors(store, run.id, updated.id, at, context.principalId);
      return updated;
    });
  };
  return { claim: (c, task, owner) => change(c, task, "claim", {}, owner), start: (c, task) => change(c, task, "start"), complete: (c, task, evidence) => change(c, task, "complete", evidence), block: (c, task, evidence) => change(c, task, "block", evidence), waive: (c, task, evidence) => change(c, task, "waive", evidence), reopen: (c, task, reason) => change(c, task, "reopen", { reason }) };
}

export function createCycleDeviationService(options: CycleExecutionServiceOptions): CycleDeviationService {
  const now = options.now ?? (() => new Date()); const id = options.id ?? randomUUID;
  const decide = async (context: VerifiedRequestContext, deviationId: string, status: "resolved" | "waived", resolution: string) => {
    await permitted(options.authorizer, context, governancePermissions.cycleReview); required(resolution, "resolution");
    return exactRepository(options, context).transaction(context, async (store) => { const value = await requireDeviation(store, deviationId); if (value.status !== "open") fail("GOVERNANCE_DEVIATION_IMMUTABLE"); const updated: CycleDeviation = { ...value, status, resolution, decidedAt: now().toISOString(), decidedBy: context.principalId }; await store.putDeviation(updated); return updated; });
  };
  return {
    async create(context, input) { await permitted(options.authorizer, context, governancePermissions.cycleExecute); required(input.description, "description"); return exactRepository(options, context).transaction(context, async (store) => { const run = await requireRun(store, input.runId); await assertRunMutable(store, run); if (input.taskId) { const task = await requireTask(store, input.taskId); if (task.cycleRunId !== run.id) fail("GOVERNANCE_TASK_RUN_MISMATCH"); } const value: CycleDeviation = { id: id(), tenantId: context.tenantId, cycleRunId: run.id, ...(input.taskId ? { cycleTaskId: input.taskId } : {}), deviationType: input.type, description: input.description, severity: input.severity, status: "open", carryCount: 0, createdAt: now().toISOString(), createdBy: context.principalId }; await store.putDeviation(value); return value; }); },
    resolve: (context, deviationId, resolution) => decide(context, deviationId, "resolved", resolution),
    waive: (context, deviationId, reason) => decide(context, deviationId, "waived", reason),
    async carryForward(context, deviationId, targetRunId, idempotencyKey) { await permitted(options.authorizer, context, governancePermissions.cycleReview); required(idempotencyKey, "idempotencyKey"); return exactRepository(options, context).transaction(context, async (store) => { const replay = await store.findDeviationCarryByIdempotencyKey(idempotencyKey); if (replay) { if (replay.carriedFromDeviationId !== deviationId || replay.cycleRunId !== targetRunId) fail("GOVERNANCE_IDEMPOTENCY_CONFLICT"); return { kind: "replayed" as const, deviation: replay }; } const source = await requireDeviation(store, deviationId); if (source.status !== "open") fail("GOVERNANCE_DEVIATION_IMMUTABLE"); const target = await requireRun(store, targetRunId); await assertRunMutable(store, target); const { cycleTaskId: _task, carriedToCycleRunId: _target, ...carryBase } = source; const carried: CycleDeviation = { ...carryBase, id: id(), cycleRunId: target.id, status: "open", carriedFromDeviationId: source.id, carryCount: source.carryCount + 1, createdAt: now().toISOString(), createdBy: context.principalId }; const closed: CycleDeviation = { ...source, status: "carried", resolution: `Carried to cycle ${target.id}`, carriedToCycleRunId: target.id, decidedAt: now().toISOString(), decidedBy: context.principalId }; await store.putDeviation(closed); await store.putDeviation(carried); await store.recordDeviationCarryIdempotencyKey(idempotencyKey, carried.id); return { kind: "carried" as const, deviation: carried }; }); },
  };
}

export function createCycleCertificationService(options: CycleExecutionServiceOptions): CycleCertificationService {
  const now = options.now ?? (() => new Date()); const id = options.id ?? randomUUID;
  return {
    async create(context, input) { await permitted(options.authorizer, context, governancePermissions.cycleReview); required(input.statement, "statement"); required(input.certificationTypeCode, "certificationTypeCode"); return exactRepository(options, context).transaction(context, async (store) => { const run = await requireRun(store, input.runId); await assertRunMutable(store, run); if ((await store.listCertifications(run.id)).some((item) => item.certificationTypeCode === input.certificationTypeCode)) fail("GOVERNANCE_CERTIFICATION_EXISTS"); const value: CycleCertification = { id: id(), tenantId: context.tenantId, cycleRunId: run.id, certificationTypeCode: input.certificationTypeCode, statement: input.statement, status: "draft", createdAt: now().toISOString(), createdBy: context.principalId, version: 1 }; await store.putCertification(value); return value; }); },
    async submit(context, certificationId, evidenceSnapshotId, evidenceSnapshot) { await permitted(options.authorizer, context, governancePermissions.cycleReview); required(evidenceSnapshotId, "evidenceSnapshotId"); nonempty(evidenceSnapshot, "evidence snapshot"); return exactRepository(options, context).transaction(context, async (store) => { const value = await requireCertification(store, certificationId); if (value.status !== "draft") fail("GOVERNANCE_CERTIFICATION_IMMUTABLE"); const updated: CycleCertification = { ...value, status: "submitted", evidenceSnapshotId, evidenceSnapshot: deepFreezeCopy(evidenceSnapshot), submittedAt: now().toISOString(), submittedBy: context.principalId, version: value.version + 1 }; await store.putCertification(updated); return updated; }); },
    async certify(context, certificationId, signature) { await permitted(options.authorizer, context, governancePermissions.cycleCertify); required(signature, "signature"); return exactRepository(options, context).transaction(context, async (store) => { const value = await requireCertification(store, certificationId); if (value.status !== "submitted") fail("GOVERNANCE_CERTIFICATION_IMMUTABLE"); if (value.createdBy === context.principalId || value.submittedBy === context.principalId) fail("GOVERNANCE_REVIEWER_SEPARATION_REQUIRED"); const run = await requireRun(store, value.cycleRunId); await assertRunReady(options, context, store, run); const updated: CycleCertification = { ...value, status: "approved", signature, certifiedAt: now().toISOString(), certifiedBy: context.principalId, version: value.version + 1 }; await store.putCertification(updated); return updated; }); },
    async reject(context, certificationId, reason) { await permitted(options.authorizer, context, governancePermissions.cycleCertify); required(reason, "reason"); return exactRepository(options, context).transaction(context, async (store) => { const value = await requireCertification(store, certificationId); if (value.status !== "submitted") fail("GOVERNANCE_CERTIFICATION_IMMUTABLE"); if (value.submittedBy === context.principalId) fail("GOVERNANCE_REVIEWER_SEPARATION_REQUIRED"); const updated: CycleCertification = { ...value, status: "rejected", rejectionReason: reason, rejectedAt: now().toISOString(), rejectedBy: context.principalId, version: value.version + 1 }; await store.putCertification(updated); return updated; }); },
  };
}

const runTransitions: Record<CycleRunStatus, readonly CycleRunStatus[]> = { draft: ["scheduled", "running", "cancelled"], scheduled: ["running", "cancelled"], running: ["blocked", "completed", "cancelled"], blocked: ["running", "cancelled"], completed: [], cancelled: [] };
async function runReadiness(options: CycleExecutionServiceOptions, context: VerifiedRequestContext, store: CycleExecutionStore, run: CycleRun): Promise<CycleReadinessResult> { const tasks = await store.listTasks(run.id); const deviations = await store.listDeviations(run.id); const reasons: string[] = []; if (tasks.some((task) => task.isMandatory && !["completed", "waived"].includes(task.status))) reasons.push("mandatory_tasks_incomplete"); if (deviations.some((item) => item.status === "open" && item.severity === "critical")) reasons.push("critical_deviations_open"); let finance: CycleReadinessResult | undefined; if (run.data["closeCoordinate"] !== undefined) { if (!options.readinessSource) reasons.push("finance_readiness_source_unavailable"); else { finance = await options.readinessSource.evaluate(context, run); if (!finance.ready) reasons.push(...(finance.reasons ?? ["finance_not_ready"])); } } return { ready: reasons.length === 0, evaluatedAt: finance?.evaluatedAt ?? new Date().toISOString(), evidence: { taskCount: tasks.length, completedTaskCount: tasks.filter((task) => ["completed", "waived"].includes(task.status)).length, openCriticalDeviationCount: deviations.filter((item) => item.status === "open" && item.severity === "critical").length, ...(finance ? { finance: finance.evidence } : {}) }, ...(reasons.length ? { reasons } : {}) }; }
async function assertRunReady(options: CycleExecutionServiceOptions, context: VerifiedRequestContext, store: CycleExecutionStore, run: CycleRun): Promise<void> { const readiness = await runReadiness(options, context, store, run); if (!readiness.ready) fail("GOVERNANCE_CYCLE_NOT_READY", readiness); }
async function assertRunMutable(store: CycleExecutionStore, run: CycleRun): Promise<void> { if (["completed", "cancelled"].includes(run.status) || (await store.listCertifications(run.id)).some((item) => item.status === "approved")) fail("GOVERNANCE_CYCLE_IMMUTABLE"); }
async function unlockSuccessors(store: CycleExecutionStore, runId: string, predecessorId: string, at: string, principalId: string): Promise<void> { const dependencies = await store.listDependencies(runId); const successorIds = new Set(dependencies.filter((item) => item.predecessorTaskId === predecessorId).map((item) => item.successorTaskId)); if (!successorIds.size) return; const tasks = await store.listTasks(runId); for (const successorId of successorIds) { const successor = tasks.find((item) => item.id === successorId); if (successor?.status === "pending" && dependenciesPass(successor.id, dependencies, tasks)) await store.putTask({ ...successor, status: "ready", updatedAt: at, updatedBy: principalId, version: successor.version + 1 }); } }
function dependenciesPass(taskId: string, dependencies: readonly CycleTaskDependency[], tasks: readonly CycleTask[]): boolean { const predecessors = dependencies.filter((item) => item.successorTaskId === taskId); return predecessors.every((edge) => { const task = tasks.find((item) => item.id === edge.predecessorTaskId); return task !== undefined && (["completed", "waived"].includes(task.status) || !edge.isHard); }); }
async function requireRun(store: CycleExecutionStore, id: string): Promise<CycleRun> { const value = await store.getRun(id); if (!value) fail("GOVERNANCE_CYCLE_RUN_NOT_FOUND"); return value; }
async function requireTask(store: CycleExecutionStore, id: string): Promise<CycleTask> { const value = await store.getTask(id); if (!value) fail("GOVERNANCE_CYCLE_TASK_NOT_FOUND"); return value; }
async function requireDeviation(store: CycleExecutionStore, id: string): Promise<CycleDeviation> { const value = await store.getDeviation(id); if (!value) fail("GOVERNANCE_CYCLE_DEVIATION_NOT_FOUND"); return value; }
async function requireCertification(store: CycleExecutionStore, id: string): Promise<CycleCertification> { const value = await store.getCertification(id); if (!value) fail("GOVERNANCE_CYCLE_CERTIFICATION_NOT_FOUND"); return value; }
function contains(parentStart?: string, parentEnd?: string, start?: string, end?: string): boolean { return (!parentStart || !!start && start >= parentStart) && (!parentEnd || !!end && end <= parentEnd); }
function assertOwner(task: CycleTask, context: VerifiedRequestContext): void { if (task.ownerPrincipalId && task.ownerPrincipalId !== context.principalId) fail("GOVERNANCE_TASK_OWNER_REQUIRED"); }
function invalidTask(task: CycleTask, action: string): never { return fail("GOVERNANCE_INVALID_TRANSITION", { taskId: task.id, from: task.status, action }); }
function required(value: string, field: string): void { if (!value.trim()) fail("GOVERNANCE_INVALID_COMMAND", { field }); }
function nonempty(value: Readonly<Record<string, unknown>>, label: string): void { if (Object.keys(value).length === 0) fail("GOVERNANCE_EVIDENCE_REQUIRED", { label }); }
function deepFreezeCopy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function withoutCompletedAt(task: CycleTask): Omit<CycleTask, "completedAt"> { const { completedAt: _completedAt, ...rest } = task; return rest; }
function exactRepository(options: CycleExecutionServiceOptions, context: VerifiedRequestContext): CycleExecutionRepository { return options.repositories.require(context.planeKey); }
async function permitted(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string): Promise<void> { if (!(await authorizer.authorize({ context, permissionCode })).allowed) fail("GOVERNANCE_PERMISSION_DENIED"); }
function fail(code: string, details?: unknown): never { throw Object.assign(new Error(code), { code, details }); }
