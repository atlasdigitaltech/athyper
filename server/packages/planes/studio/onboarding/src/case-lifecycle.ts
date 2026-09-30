import {
  choice,
  criticalities,
  invalid,
  object,
  OnboardingValidationError,
  statuses,
  text,
  uuid,
  version,
} from "./validation.js";
import { createHash } from "node:crypto";
import type { OnboardingCaseStatus } from "@athyper/contract-athyper-onboarding";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export interface CompiledStep {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly targetId?: string;
  readonly dependsOn?: readonly string[];
  readonly criticality?: "activation_critical" | "independent";
  readonly priority?: number;
}
export interface CompiledCheck {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly targetId: string;
  readonly stepId?: string;
  readonly resourceType: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface CompiledResource {
  readonly id: string;
  readonly targetId: string;
  readonly kind: string;
  readonly key: string;
  readonly desiredState: Readonly<Record<string, unknown>>;
  readonly accessGates?: Readonly<Record<string, unknown>>;
  readonly retention:
    "deletable" | "retain_business_data" | "retain_legal_and_audit";
}
export interface OnboardingCompilation {
  readonly evidenceId: string;
  readonly targets: readonly {
    readonly id: string;
    readonly plane: "studio" | "neon" | "mesh" | "trustiam";
    readonly tenantId: string;
    readonly criticality: "activation_critical" | "independent";
    readonly requestedProjectionId?: string;
    readonly requestedPlanId?: string;
    readonly requestedWorkspaceId?: string;
    readonly requestedScopeTargetId?: string;
  }[];
  readonly steps: readonly CompiledStep[];
  readonly checks: readonly CompiledCheck[];
  readonly resources: readonly CompiledResource[];
}
export interface OnboardingCaseWriteResult {
  readonly caseId: string;
  readonly status: OnboardingCaseStatus;
  readonly desiredVersion: number;
  readonly desiredHash: string;
  readonly replayed: boolean;
}
export interface OnboardingDraftCommand {
  readonly context: VerifiedRequestContext;
  readonly idempotencyKey: string;
  readonly caseId: string;
  readonly caseCode: string;
  readonly canonicalPartyId: string;
  readonly sourceMode?:
    "self_service" | "buyer_invited" | "ops_governed" | "system_triggered";
  readonly activationCriticality?: "activation_critical" | "independent";
  readonly requestMetadata?: Readonly<Record<string, unknown>>;
  readonly requestPayload?: Readonly<Record<string, unknown>>;
}
export interface OnboardingCaseCommand {
  readonly context: VerifiedRequestContext;
  readonly caseId: string;
  readonly expectedStatus: OnboardingCaseStatus;
  readonly expectedDesiredVersion?: number;
  readonly idempotencyKey: string;
  readonly reason?: string;
  readonly approvedRevision?: Readonly<Record<string, unknown>>;
  readonly compilation?: OnboardingCompilation;
}
export interface OnboardingLifecycleRepository<Transaction> {
  createDraft(
    input: {
      readonly tenantId: string;
      readonly caseId: string;
      readonly caseCode: string;
      readonly canonicalPartyId: string;
      readonly requestedBy: string;
      readonly sourceMode: NonNullable<OnboardingDraftCommand["sourceMode"]>;
      readonly activationCriticality: NonNullable<
        OnboardingDraftCommand["activationCriticality"]
      >;
      readonly requestMetadata: Readonly<Record<string, unknown>>;
      readonly requestPayload: Readonly<Record<string, unknown>>;
      readonly idempotencyKeyHash: string;
      readonly fingerprint: string;
    },
    transaction: Transaction,
  ): Promise<OnboardingCaseWriteResult>;
  transition(
    input: {
      readonly tenantId: string;
      readonly caseId: string;
      readonly from: OnboardingCaseStatus;
      readonly to: OnboardingCaseStatus;
      readonly actorId: string;
      readonly changedAt: string;
      readonly idempotencyKeyHash: string;
      readonly fingerprint: string;
      readonly expectedDesiredVersion?: number;
      readonly canonicalRevision?: Readonly<Record<string, unknown>>;
      readonly desiredHash?: string;
      readonly compilation?: OnboardingCompilation;
      readonly reason?: string;
    },
    transaction: Transaction,
  ): Promise<OnboardingCaseWriteResult>;
  revokeExpiredGuestAccess(
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly now: string;
      readonly limit: number;
    },
    transaction: Transaction,
  ): Promise<readonly string[]>;
  resolveWorkItem(
    input: {
      readonly tenantId: string;
      readonly caseId: string;
      readonly workItemId: string;
      readonly actorId: string;
    },
    transaction: Transaction,
  ): Promise<boolean>;
}
export interface OnboardingTransactionCoordinator<Transaction> {
  run<Result>(
    actor: { readonly tenantId: string; readonly principalId: string },
    work: (transaction: Transaction) => Promise<Result>,
  ): Promise<Result>;
}

const TRANSITIONS: Record<
  OnboardingCaseStatus,
  readonly OnboardingCaseStatus[]
> = {
  draft: ["submitted", "cancelled"],
  submitted: ["qualifying", "cancelled"],
  qualifying: ["awaiting_approval", "rejected", "failed"],
  awaiting_approval: ["approved", "rejected", "cancelled"],
  approved: ["provisioning"],
  provisioning: ["reconciling", "failed", "cancelled"],
  reconciling: ["active", "failed", "offboarding"],
  active: ["qualifying", "offboarding"],
  rejected: [],
  cancelled: [],
  failed: ["provisioning", "offboarding"],
  offboarding: ["offboarded", "failed"],
  offboarded: [],
};

export class OnboardingCaseLifecycleService<Transaction> {
  constructor(
    private readonly repository: OnboardingLifecycleRepository<Transaction>,
    private readonly transactions: OnboardingTransactionCoordinator<Transaction>,
    private readonly now: () => Date = () => new Date(),
  ) {}
  draft(command: OnboardingDraftCommand) {
    const caseCode = required(command.caseCode).toLowerCase();
    if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(caseCode))
      throw new OnboardingValidationError("Invalid onboarding case code");
    const requestMetadata = boundedObject(command.requestMetadata ?? {}),
      requestPayload = boundedObject(command.requestPayload ?? {}),
      idempotencyKeyHash = sha256(required(command.idempotencyKey)),
      fingerprint = sha256(
        JSON.stringify(
          canonicalize({
            caseId: command.caseId,
            caseCode,
            canonicalPartyId: command.canonicalPartyId,
            sourceMode: command.sourceMode ?? "self_service",
            activationCriticality:
              command.activationCriticality ?? "independent",
            requestMetadata,
            requestPayload,
          }),
        ),
      );
    return this.transactions.run(
      {
        tenantId: command.context.tenantId,
        principalId: command.context.principalId,
      },
      (transaction) =>
        this.repository.createDraft(
          {
            tenantId: command.context.tenantId,
            caseId: command.caseId,
            caseCode,
            canonicalPartyId: command.canonicalPartyId,
            requestedBy: command.context.principalId,
            sourceMode: command.sourceMode ?? "self_service",
            activationCriticality:
              command.activationCriticality ?? "independent",
            requestMetadata,
            requestPayload,
            idempotencyKeyHash,
            fingerprint,
          },
          transaction,
        ),
    );
  }
  submit(command: OnboardingCaseCommand) {
    return this.move(command, "submitted", true);
  }
  beginQualification(command: OnboardingCaseCommand) {
    return this.move(command, "qualifying");
  }
  compile(command: OnboardingCaseCommand) {
    if (!command.compilation)
      throw new OnboardingValidationError("Compilation is required");
    validateCompilation(command.compilation);
    return this.move(command, "awaiting_approval");
  }
  approve(command: OnboardingCaseCommand) {
    return this.move(command, "approved", true);
  }
  reject(command: OnboardingCaseCommand) {
    return this.move(command, "rejected");
  }
  provision(command: OnboardingCaseCommand) {
    return this.move(command, "provisioning");
  }
  reconcile(command: OnboardingCaseCommand) {
    return this.move(command, "reconciling");
  }
  activate(command: OnboardingCaseCommand) {
    return this.move(command, "active");
  }
  correct(command: OnboardingCaseCommand) {
    return this.move(command, "qualifying");
  }
  suspend(command: OnboardingCaseCommand) {
    return this.correct(command);
  }
  offboard(command: OnboardingCaseCommand) {
    return this.move(command, "offboarding");
  }
  finishOffboarding(command: OnboardingCaseCommand) {
    return this.move(command, "offboarded");
  }
  fail(command: OnboardingCaseCommand) {
    return this.move(command, "failed");
  }
  cancel(command: OnboardingCaseCommand) {
    return this.move(command, "cancelled");
  }
  private move(
    command: OnboardingCaseCommand,
    to: OnboardingCaseStatus,
    requiresRevision = false,
  ) {
    choice(command.expectedStatus, statuses, "expectedStatus");
    if (command.expectedDesiredVersion !== undefined)
      version(command.expectedDesiredVersion);
    if (!TRANSITIONS[command.expectedStatus].includes(to))
      throw new OnboardingValidationError(
        `Invalid onboarding transition: ${command.expectedStatus} -> ${to}`,
      );
    if (requiresRevision && !command.approvedRevision)
      throw new OnboardingValidationError(
        "A canonical approved revision is required",
      );
    if (command.compilation) validateCompilation(command.compilation);
    if (command.compilation && to !== "awaiting_approval")
      invalid("Compilation is only accepted by compile");
    if (command.approvedRevision && !requiresRevision)
      invalid("Canonical revisions are only accepted by submit and approve");
    const canonicalRevision = command.approvedRevision
      ? canonicalize(boundedObject(command.approvedRevision))
      : undefined;
    const desiredHash = canonicalRevision
      ? sha256(JSON.stringify(canonicalRevision))
      : undefined;
    const idempotencyKeyHash = sha256(required(command.idempotencyKey));
    const fingerprint = sha256(
      JSON.stringify(
        canonicalize({
          caseId: command.caseId,
          from: command.expectedStatus,
          to,
          expectedDesiredVersion: command.expectedDesiredVersion ?? null,
          desiredHash: desiredHash ?? null,
          compilation: command.compilation ?? null,
          reason: command.reason ?? null,
        }),
      ),
    );
    return this.transactions.run(
      {
        tenantId: command.context.tenantId,
        principalId: command.context.principalId,
      },
      (transaction) =>
        this.repository.transition(
          {
            tenantId: command.context.tenantId,
            caseId: command.caseId,
            from: command.expectedStatus,
            to,
            actorId: command.context.principalId,
            changedAt: this.now().toISOString(),
            idempotencyKeyHash,
            fingerprint,
            ...(command.expectedDesiredVersion !== undefined
              ? { expectedDesiredVersion: command.expectedDesiredVersion }
              : {}),
            ...(canonicalRevision ? { canonicalRevision, desiredHash } : {}),
            ...(command.compilation
              ? { compilation: command.compilation }
              : {}),
            ...(command.reason ? { reason: command.reason } : {}),
          },
          transaction,
        ),
    );
  }
}

export function validateCompilation(value: OnboardingCompilation): void {
  object(value, "compilation");
  uuid(value.evidenceId, "evidenceId");
  for (const field of ["targets", "steps", "checks", "resources"] as const) {
    if (!Array.isArray(value[field]))
      invalid(`compilation.${field} must be an array`);
    for (const entry of value[field]) {
      object(entry, field);
      uuid(entry.id, `${field}.id`);
    }
  }
  unique(
    value.targets.map(
      (target) => `${target.plane}:${String(target.tenantId).toLowerCase()}`,
    ),
    "target coordinate",
  );
  unique(
    value.steps.map((step) => step.code),
    "step code",
  );
  unique(
    value.checks.map((check) => check.code),
    "check code",
  );
  for (const target of value.targets) {
    choice(
      target.plane,
      ["studio", "neon", "mesh", "trustiam"],
      "target plane",
    );
    choice(target.criticality, criticalities, "target criticality");
    uuid(target.tenantId, "target tenantId");
    for (const field of [
      "requestedProjectionId",
      "requestedPlanId",
      "requestedWorkspaceId",
      "requestedScopeTargetId",
    ] as const)
      if (target[field] !== undefined) uuid(target[field], field);
  }
  for (const step of value.steps) {
    code(step.code, "step code");
    text(step.title, "step title");
    if (step.targetId !== undefined) uuid(step.targetId, "step targetId");
    if (step.criticality !== undefined)
      choice(step.criticality, criticalities, "step criticality");
    if (
      step.priority !== undefined &&
      (!Number.isInteger(step.priority) ||
        step.priority < 0 ||
        step.priority > 32767)
    )
      invalid("Invalid step priority");
    if (
      step.dependsOn !== undefined &&
      (!Array.isArray(step.dependsOn) ||
        step.dependsOn.some((id) => typeof id !== "string"))
    )
      invalid("Invalid step dependencies");
    unique(step.dependsOn ?? [], "step dependency");
  }
  for (const check of value.checks) {
    code(check.code, "check code");
    text(check.name, "check name");
    code(check.resourceType, "resourceType");
    uuid(check.targetId, "check targetId");
    if (check.stepId !== undefined) uuid(check.stepId, "check stepId");
    if (check.metadata !== undefined) boundedObject(check.metadata);
  }
  unique(
    value.resources.map((resource) => resource.id),
    "resource ID",
  );
  for (const resource of value.resources) {
    uuid(resource.targetId, "resource targetId");
    code(resource.kind, "resource kind");
    code(resource.key, "resource key", /^[a-z][a-z0-9_.:-]{1,126}$/);
    boundedObject(resource.desiredState);
    choice(
      resource.retention,
      ["deletable", "retain_business_data", "retain_legal_and_audit"],
      "resource retention",
    );
    if (resource.accessGates !== undefined) boundedObject(resource.accessGates);
  }
  const targets = unique(
    value.targets.map((x) => x.id),
    "target",
  );
  const steps = unique(
    value.steps.map((x) => x.id),
    "step",
  );
  unique(
    value.checks.map((x) => x.id),
    "check",
  );
  unique(
    value.resources.map((x) => `${x.targetId}:${x.key}`),
    "resource",
  );
  for (const target of value.targets)
    if (
      !target.requestedProjectionId &&
      !target.requestedPlanId &&
      !target.requestedWorkspaceId &&
      !target.requestedScopeTargetId
    )
      throw new OnboardingValidationError(
        `Target ${target.id} requires a bounded projection, plan, workspace, or scope coordinate`,
      );
  for (const step of value.steps) {
    if (step.targetId && !targets.has(step.targetId))
      throw new OnboardingValidationError(
        `Unknown step target: ${step.targetId}`,
      );
    for (const dependency of step.dependsOn ?? [])
      if (!steps.has(dependency))
        throw new OnboardingValidationError(
          `Unknown step dependency: ${dependency}`,
        );
  }
  for (const check of value.checks) {
    if (!targets.has(check.targetId))
      throw new OnboardingValidationError(
        `Unknown check target: ${check.targetId}`,
      );
    if (check.stepId && !steps.has(check.stepId))
      throw new OnboardingValidationError(
        `Unknown check step: ${check.stepId}`,
      );
  }
  for (const resource of value.resources)
    if (!targets.has(resource.targetId))
      throw new OnboardingValidationError(
        `Unknown resource target: ${resource.targetId}`,
      );
  for (const resource of value.resources)
    if (
      resource.accessGates &&
      (Array.isArray(resource.accessGates) ||
        typeof resource.accessGates !== "object")
    )
      throw new OnboardingValidationError(
        `Invalid access gates for resource: ${resource.key}`,
      );
  const visiting = new Set<string>(),
    visited = new Set<string>(),
    byId = new Map(value.steps.map((x) => [x.id, x]));
  const visit = (id: string) => {
    if (visiting.has(id))
      throw new OnboardingValidationError(
        "Onboarding step graph contains a cycle",
      );
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of steps) visit(id);
}
export function canonicalize(value: unknown): any {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  return value;
}
function unique(values: readonly string[], kind: string) {
  const result = new Set<string>();
  for (const value of values) {
    if (!value || result.has(value))
      throw new OnboardingValidationError(
        `Duplicate or empty ${kind}: ${value}`,
      );
    result.add(value);
  }
  return result;
}
function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function required(value: string) {
  const result = value.trim();
  if (!result)
    throw new OnboardingValidationError("Idempotency key is required");
  return result;
}
function boundedObject(value: Readonly<Record<string, unknown>>) {
  object(value, "payload");
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 65536)
    throw new OnboardingValidationError(
      "Onboarding payload must be a bounded object",
    );
  return value;
}

function code(
  value: string,
  name: string,
  pattern = /^[a-z][a-z0-9_.-]{1,126}$/,
): void {
  text(value, name);
  if (!pattern.test(value)) invalid(`Invalid ${name}`);
}
