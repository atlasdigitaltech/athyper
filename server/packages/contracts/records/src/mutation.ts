import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export type RecordMutationAction = "create" | "patch" | "delete" | "transition" | "aggregate";
export type MutationOrigin = "classic" | "workspace" | "import" | "job" | "operation";
export type MutationValidationMode = "strict" | "lenient";

export interface FieldViolation {
  readonly code: string;
  readonly message: string;
}

export type MutationFieldViolations = Readonly<Record<string, readonly FieldViolation[]>>;

export interface BaseRecordCommand {
  readonly context: VerifiedRequestContext;
  readonly entityCode: string;
  readonly expectedVersion?: number;
  readonly lockToken?: string;
  readonly idempotencyKey?: string;
  readonly origin: MutationOrigin;
  readonly validationMode: MutationValidationMode;
}

export interface CreateRecordCommand extends BaseRecordCommand {
  readonly input: Readonly<Record<string, unknown>>;
}

export interface PatchRecordCommand extends BaseRecordCommand {
  readonly recordId: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface DeleteRecordCommand extends BaseRecordCommand {
  readonly recordId: string;
}

export interface TransitionRecordCommand extends BaseRecordCommand {
  readonly recordId: string;
  readonly transitionCode: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface AggregateCollectionChangeSet {
  readonly create?: readonly Readonly<Record<string, unknown>>[];
  readonly update?: readonly { readonly id: string; readonly patch: Readonly<Record<string, unknown>> }[];
  readonly delete?: readonly string[];
  readonly replace?: readonly Readonly<Record<string, unknown>>[];
}

export interface AggregateChangeSet {
  readonly header: { readonly patch: Readonly<Record<string, unknown>> };
  readonly collections: Readonly<Record<string, AggregateCollectionChangeSet>>;
}

export interface AggregateRecordCommand extends BaseRecordCommand {
  readonly recordId: string;
  readonly changes: AggregateChangeSet;
  readonly planHash: string;
  readonly requestHash?: string;
  readonly transition?: {
    readonly code: string;
    readonly payload?: Readonly<Record<string, unknown>>;
  };
}

export type RecordMutationResult =
  | { readonly kind: "NotFound"; readonly entityCode: string; readonly recordId?: string }
  | { readonly kind: "CapabilityUnavailable"; readonly entityCode: string }
  | { readonly kind: "IncompatibleAction"; readonly action: RecordMutationAction; readonly reason: string }
  | { readonly kind: "Forbidden"; readonly permissionCode?: string }
  | { readonly kind: "VersionRequired" }
  | { readonly kind: "VersionConflict"; readonly expectedVersion: number; readonly currentVersion: number }
  | { readonly kind: "FieldsNotWritable"; readonly fields: MutationFieldViolations; readonly currentStatus?: string | null }
  | { readonly kind: "ValidationFailed"; readonly code: string; readonly message: string; readonly fields?: readonly string[] }
  | { readonly kind: "LockRequired"; readonly reason: "required" | "not_found" | "expired" | "wrong_owner" | "wrong_token" }
  | { readonly kind: "InvalidTransition"; readonly transitionCode: string; readonly reason: string }
  | { readonly kind: "IdempotencyConflict"; readonly reason: "required" | "reused" | "in_progress" | "invalid" }
  | {
      readonly kind: "Committed";
      readonly action: RecordMutationAction;
      readonly entityCode: string;
      readonly recordId: string;
      readonly record?: Readonly<Record<string, unknown>>;
      readonly version?: number;
      readonly replayed: boolean;
      readonly warnings?: { readonly fields: MutationFieldViolations };
    };
