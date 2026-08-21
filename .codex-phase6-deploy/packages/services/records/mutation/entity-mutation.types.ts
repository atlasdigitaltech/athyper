import type { VerifiedRequestContext } from "@athyper/svc-iam";

export type MutationOrigin = "classic" | "workspace" | "import" | "job" | "operation";
import type { MutationFieldViolations } from "./field-validation.js";

export type MutationValidationMode = "strict" | "lenient";

export interface BaseEntityCommand {
  context: VerifiedRequestContext;
  entityCode: string;
  recordId?: string;
  expectedVersion?: number;
  lockToken?: string;
  idempotencyKey?: string;
  origin: MutationOrigin;
  validationMode: MutationValidationMode;
}

export interface CreateEntityCommand extends BaseEntityCommand {
  input: Readonly<Record<string, unknown>>;
}

export interface PatchEntityCommand extends BaseEntityCommand {
  recordId: string;
  input: Readonly<Record<string, unknown>>;
}

export interface DeleteEntityCommand extends BaseEntityCommand {
  recordId: string;
}

export interface TransitionEntityCommand extends BaseEntityCommand {
  recordId: string;
  transitionCode: string;
  input: Readonly<Record<string, unknown>>;
}

export interface AggregateCollectionChangeSet {
  create?: ReadonlyArray<Readonly<Record<string, unknown>>>;
  update?: ReadonlyArray<{ id: string; patch: Readonly<Record<string, unknown>> }>;
  delete?: ReadonlyArray<string>;
  replace?: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

export interface AggregateChangeSet {
  header: { patch: Readonly<Record<string, unknown>> };
  collections: Readonly<Record<string, AggregateCollectionChangeSet>>;
}

export interface AggregateMutationCommand extends BaseEntityCommand {
  recordId: string;
  changes: AggregateChangeSet;
  planHash: string;
  invalidationGraph?: ReadonlyArray<Readonly<Record<string, unknown>>>;
  transition?: { code: string; payload?: Readonly<Record<string, unknown>> };
  requestHash?: string;
}

export type MutationResult =
  | { kind: "NotFound"; entityCode: string; recordId?: string }
  | { kind: "CapabilityUnavailable"; entityCode: string }
  | { kind: "IncompatibleAction"; action: "create" | "patch" | "delete" | "transition" | "aggregate"; reason: string }
  | { kind: "Forbidden"; permissionCode?: string }
  | { kind: "VersionRequired" }
  | { kind: "VersionConflict"; expectedVersion: number; currentVersion: number }
  | { kind: "FieldsNotWritable"; fields: MutationFieldViolations; currentStatus?: string | null }
  | { kind: "ValidationFailed"; code: string; message: string; fields?: readonly string[] }
  | { kind: "LockRequired"; reason: "required" | "not_found" | "expired" | "wrong_owner" | "wrong_token" }
  | { kind: "InvalidTransition"; transitionCode: string; reason: string }
  | { kind: "IdempotencyConflict"; reason: "required" | "reused" | "in_progress" | "invalid" }
  | { kind: "AggregateRejected"; status: number; body: Record<string, unknown> }
  | {
      kind: "Committed";
      action: "create" | "patch" | "delete" | "transition" | "aggregate";
      entityCode: string;
      recordId: string;
      record?: Record<string, unknown>;
      version?: number;
      replayed: boolean;
      durableSideEffects?: true;
      warnings?: { fields: MutationFieldViolations };
      validationMetrics?: { supplied: number; accepted: number; rejected: number };
    };

export interface EntityMutationService {
  validateCreate(command: CreateEntityCommand): Promise<MutationResult | null>;
  validatePatch(command: PatchEntityCommand): Promise<MutationResult | null>;
  validateDelete(command: DeleteEntityCommand): Promise<MutationResult | null>;
  create(command: CreateEntityCommand): Promise<MutationResult>;
  patch(command: PatchEntityCommand): Promise<MutationResult>;
  delete(command: DeleteEntityCommand): Promise<MutationResult>;
  transition(command: TransitionEntityCommand): Promise<MutationResult>;
  mutateAggregate(command: AggregateMutationCommand): Promise<MutationResult>;
}
