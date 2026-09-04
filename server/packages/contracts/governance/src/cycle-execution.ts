import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PublishedCycleTemplate } from "./cycle-config.js";

export type CycleRunStatus =
  "draft" | "scheduled" | "running" | "blocked" | "completed" | "cancelled";
export type CycleTaskStatus =
  | "pending"
  | "ready"
  | "in_progress"
  | "blocked"
  | "completed"
  | "waived"
  | "cancelled";
export type CycleDeviationSeverity = "low" | "medium" | "high" | "critical";
export type CycleDeviationStatus = "open" | "resolved" | "waived" | "carried";
export type CycleCertificationStatus =
  "draft" | "submitted" | "approved" | "rejected";

export interface CycleRun {
  readonly id: string;
  readonly tenantId: string;
  readonly cycleTypeId: string;
  readonly templateRevisionId: string;
  readonly templateRevisionNumber: number;
  readonly templateHash: string;
  readonly code: string;
  readonly name: string;
  readonly periodStart?: string;
  readonly periodEnd?: string;
  readonly scheduledStartAt?: string;
  readonly startedAt?: string;
  readonly dueAt?: string;
  readonly completedAt?: string;
  readonly parentCycleRunId?: string;
  readonly ownerPrincipalId?: string;
  readonly idempotencyKey: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly status: CycleRunStatus;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly version: number;
}
export interface CycleTask {
  readonly id: string;
  readonly tenantId: string;
  readonly cycleRunId: string;
  readonly cycleTypeId: string;
  readonly taskTemplateId: string;
  readonly phaseId: string;
  readonly code: string;
  readonly name: string;
  readonly completionMode: "manual" | "system" | "hybrid";
  readonly isMandatory: boolean;
  readonly isWaivable: boolean;
  readonly ownerPrincipalId?: string;
  readonly assignedTeamId?: string;
  readonly dueAt?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly completionEvidence: Readonly<Record<string, unknown>>;
  readonly status: CycleTaskStatus;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly version: number;
}
export interface CycleTaskDependency {
  readonly id: string;
  readonly tenantId: string;
  readonly cycleRunId: string;
  readonly predecessorTaskId: string;
  readonly successorTaskId: string;
  readonly dependencyType: "finish_to_start" | "finish_to_finish";
  readonly isHard: boolean;
}
export interface CycleDeviation {
  readonly id: string;
  readonly tenantId: string;
  readonly cycleRunId: string;
  readonly cycleTaskId?: string;
  readonly deviationType: "exception" | "override" | "waiver";
  readonly description: string;
  readonly severity: CycleDeviationSeverity;
  readonly status: CycleDeviationStatus;
  readonly resolution?: string;
  readonly carriedFromDeviationId?: string;
  readonly carriedToCycleRunId?: string;
  readonly carryCount: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly decidedAt?: string;
  readonly decidedBy?: string;
}
export interface CycleCertification {
  readonly id: string;
  readonly tenantId: string;
  readonly cycleRunId: string;
  readonly certificationTypeCode: string;
  readonly statement: string;
  readonly status: CycleCertificationStatus;
  readonly evidenceSnapshot?: Readonly<Record<string, unknown>>;
  readonly evidenceSnapshotId?: string;
  readonly signature?: string;
  readonly submittedAt?: string;
  readonly submittedBy?: string;
  readonly certifiedAt?: string;
  readonly certifiedBy?: string;
  readonly rejectedAt?: string;
  readonly rejectedBy?: string;
  readonly rejectionReason?: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly version: number;
}

export interface CycleReadinessResult {
  readonly ready: boolean;
  readonly evaluatedAt: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly reasons?: readonly string[];
}
export interface CycleReadinessSource {
  evaluate(
    context: VerifiedRequestContext,
    run: CycleRun,
  ): Promise<CycleReadinessResult>;
}

export interface CycleExecutionStore {
  getPublishedTemplate(
    cycleTypeId: string,
    version?: number,
  ): Promise<PublishedCycleTemplate | undefined>;
  findRunByIdempotencyKey(key: string): Promise<CycleRun | undefined>;
  recordRunIdempotencyKey(key: string, runId: string): Promise<void>;
  getRun(runId: string): Promise<CycleRun | undefined>;
  putRun(run: CycleRun): Promise<void>;
  listChildRuns(parentRunId: string): Promise<readonly CycleRun[]>;
  listTasks(runId: string): Promise<readonly CycleTask[]>;
  getTask(taskId: string): Promise<CycleTask | undefined>;
  putTask(task: CycleTask): Promise<void>;
  listDependencies(runId: string): Promise<readonly CycleTaskDependency[]>;
  putDependency(dependency: CycleTaskDependency): Promise<void>;
  getDeviation(deviationId: string): Promise<CycleDeviation | undefined>;
  listDeviations(runId: string): Promise<readonly CycleDeviation[]>;
  putDeviation(deviation: CycleDeviation): Promise<void>;
  findDeviationCarryByIdempotencyKey(
    key: string,
  ): Promise<CycleDeviation | undefined>;
  recordDeviationCarryIdempotencyKey(
    key: string,
    deviationId: string,
  ): Promise<void>;
  getCertification(
    certificationId: string,
  ): Promise<CycleCertification | undefined>;
  listCertifications(runId: string): Promise<readonly CycleCertification[]>;
  putCertification(certification: CycleCertification): Promise<void>;
}
export interface CycleExecutionRepository {
  transaction<T>(
    actor: Pick<VerifiedRequestContext, "tenantId" | "principalId">,
    operation: (store: CycleExecutionStore) => Promise<T>,
  ): Promise<T>;
}

export interface CreateCycleRunCommand {
  readonly context: VerifiedRequestContext;
  readonly cycleTypeId: string;
  readonly templateVersion?: number;
  readonly idempotencyKey: string;
  readonly code: string;
  readonly name: string;
  readonly periodStart?: string;
  readonly periodEnd?: string;
  readonly scheduledStartAt?: string;
  readonly dueAt?: string;
  readonly parentCycleRunId?: string;
  readonly ownerPrincipalId?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}
export interface CycleRunService {
  create(command: CreateCycleRunCommand): Promise<{
    readonly kind: "created" | "replayed";
    readonly run: CycleRun;
    readonly tasks: readonly CycleTask[];
    readonly dependencies: readonly CycleTaskDependency[];
  }>;
  transition(
    context: VerifiedRequestContext,
    runId: string,
    status: CycleRunStatus,
  ): Promise<CycleRun>;
  readiness(
    context: VerifiedRequestContext,
    runId: string,
  ): Promise<CycleReadinessResult>;
}
export interface CycleTaskService {
  claim(
    context: VerifiedRequestContext,
    taskId: string,
    ownerPrincipalId?: string,
  ): Promise<CycleTask>;
  start(context: VerifiedRequestContext, taskId: string): Promise<CycleTask>;
  complete(
    context: VerifiedRequestContext,
    taskId: string,
    evidence: Readonly<Record<string, unknown>>,
  ): Promise<CycleTask>;
  block(
    context: VerifiedRequestContext,
    taskId: string,
    evidence: Readonly<Record<string, unknown>>,
  ): Promise<CycleTask>;
  waive(
    context: VerifiedRequestContext,
    taskId: string,
    evidence: Readonly<Record<string, unknown>>,
  ): Promise<CycleTask>;
  reopen(
    context: VerifiedRequestContext,
    taskId: string,
    reason: string,
  ): Promise<CycleTask>;
}
export interface CycleDeviationService {
  create(
    context: VerifiedRequestContext,
    input: {
      readonly runId: string;
      readonly taskId?: string;
      readonly type: CycleDeviation["deviationType"];
      readonly description: string;
      readonly severity: CycleDeviationSeverity;
    },
  ): Promise<CycleDeviation>;
  resolve(
    context: VerifiedRequestContext,
    deviationId: string,
    resolution: string,
  ): Promise<CycleDeviation>;
  waive(
    context: VerifiedRequestContext,
    deviationId: string,
    reason: string,
  ): Promise<CycleDeviation>;
  carryForward(
    context: VerifiedRequestContext,
    deviationId: string,
    targetRunId: string,
    idempotencyKey: string,
  ): Promise<{
    readonly kind: "carried" | "replayed";
    readonly deviation: CycleDeviation;
  }>;
}
export interface CycleCertificationService {
  create(
    context: VerifiedRequestContext,
    input: {
      readonly runId: string;
      readonly certificationTypeCode: string;
      readonly statement: string;
    },
  ): Promise<CycleCertification>;
  submit(
    context: VerifiedRequestContext,
    certificationId: string,
    evidenceSnapshotId: string,
    evidenceSnapshot: Readonly<Record<string, unknown>>,
  ): Promise<CycleCertification>;
  certify(
    context: VerifiedRequestContext,
    certificationId: string,
    signature: string,
  ): Promise<CycleCertification>;
  reject(
    context: VerifiedRequestContext,
    certificationId: string,
    reason: string,
  ): Promise<CycleCertification>;
}
