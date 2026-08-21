import type { EntityCapabilityManifest } from "@athyper/api-contracts/metadata";

import {
  isEntityFieldWritable,
  type EntityWriteFieldRule,
  type FieldNonWritableReason,
} from "../routes/entity-mutation-guard.js";

export type MutationFieldViolationReason =
  | "FIELD_NOT_REGISTERED"
  | "READ_ONLY"
  | "COMPUTED"
  | "WRITE_ONCE"
  | "SYSTEM_MANAGED"
  | "LOCKED_IN_CURRENT_STATUS";

export type MutationFieldViolations = Readonly<Record<string, MutationFieldViolationReason>>;
export type StrictOrLenientValidationMode = "strict" | "lenient";

export interface MutationFieldDecision {
  accepted: Record<string, unknown>;
  violations: Record<string, MutationFieldViolationReason>;
  warnings: Record<string, MutationFieldViolationReason>;
  metrics: {
    supplied: number;
    accepted: number;
    rejected: number;
  };
}

const SYSTEM_MANAGED_COLUMNS = new Set([
  "id", "tenant_id", "created_at", "created_by", "updated_at", "updated_by",
  "deleted_at", "deleted_by", "is_active", "is_deleted", "row_version",
  "status", "status_changed_at", "status_changed_by",
]);

interface ValidateFieldsArgs {
  input: Readonly<Record<string, unknown>>;
  action: "create" | "update";
  validationMode: StrictOrLenientValidationMode;
  currentStatus?: string | null;
  pathPrefix?: string;
}

/** Shared collector used by classic, workspace, and the transport-independent kernel. */
export function validateEntityWriteFields(
  args: ValidateFieldsArgs & { rules: ReadonlyMap<string, EntityWriteFieldRule> },
): MutationFieldDecision {
  return collectFieldDecisions(args, (name) => {
    const rule = args.rules.get(name);
    if (!rule) return "FIELD_NOT_REGISTERED";
    // Explain the most specific ownership rule even when metadata also carries
    // a broad read-only flag.
    if (rule.compiled?.computed || rule.is_computed) return "COMPUTED";
    if (rule.compiled?.systemManaged || rule.compiled?.systemOrigin
      || rule.origin === "system" || SYSTEM_MANAGED_COLUMNS.has(storageColumn(rule.column_name))) {
      return "SYSTEM_MANAGED";
    }
    if ((rule.compiled?.writeOnce || rule.is_write_once) && args.action === "update") return "WRITE_ONCE";
    const result = isEntityFieldWritable(rule, args.action, args.currentStatus);
    return result.writable ? null : canonicalReason(result.reason);
  });
}

export function validateCompiledWriteFields(
  args: ValidateFieldsArgs & { fields: EntityCapabilityManifest["write"]["fields"] },
): MutationFieldDecision {
  const fields = new Map(args.fields.map((field) => [field.name, field]));
  return collectFieldDecisions(args, (name) => {
    const field = fields.get(name);
    if (!field) return "FIELD_NOT_REGISTERED";
    if (field.computed) return "COMPUTED";
    if (field.systemManaged || field.systemOrigin) return "SYSTEM_MANAGED";
    if (field.writeOnce && args.action === "update") return "WRITE_ONCE";
    if (field.readOnly) return "READ_ONLY";
    if (args.action === "update" && field.statusLimited) {
      const status = normalizeStatus(args.currentStatus);
      if (status && !field.editableInStatuses.map(normalizeStatus).includes(status)) {
        return "LOCKED_IN_CURRENT_STATUS";
      }
    }
    return field.writable[args.action] ? null : "READ_ONLY";
  });
}

export function mergeFieldViolations(
  ...sets: ReadonlyArray<MutationFieldViolations>
): Record<string, MutationFieldViolationReason> {
  return Object.assign({}, ...sets);
}

export function hasFieldViolations(fields: MutationFieldViolations): boolean {
  return Object.keys(fields).length > 0;
}

function collectFieldDecisions(
  args: ValidateFieldsArgs,
  decide: (name: string) => MutationFieldViolationReason | null,
): MutationFieldDecision {
  const accepted: Record<string, unknown> = {};
  const rejected: Record<string, MutationFieldViolationReason> = {};
  for (const [name, value] of Object.entries(args.input)) {
    const reason = decide(name);
    if (reason) {
      rejected[fieldPath(args.pathPrefix, name)] = reason;
    } else if (value !== undefined) {
      accepted[name] = value;
    }
  }
  const rejectedCount = Object.keys(rejected).length;
  return {
    accepted,
    violations: args.validationMode === "strict" ? rejected : {},
    warnings: args.validationMode === "lenient" ? rejected : {},
    metrics: {
      supplied: Object.keys(args.input).length,
      accepted: Object.keys(accepted).length,
      rejected: rejectedCount,
    },
  };
}

function canonicalReason(reason: FieldNonWritableReason): MutationFieldViolationReason {
  switch (reason) {
    case "FIELD_NOT_REGISTERED": return "FIELD_NOT_REGISTERED";
    case "FIELD_COMPUTED": return "COMPUTED";
    case "FIELD_WRITE_ONCE": return "WRITE_ONCE";
    case "FIELD_SYSTEM_MANAGED":
    case "FIELD_SYSTEM_ORIGIN": return "SYSTEM_MANAGED";
    case "FIELD_LOCKED_BY_STATUS": return "LOCKED_IN_CURRENT_STATUS";
    case "FIELD_READ_ONLY":
    case "FIELD_NOT_EDITABLE": return "READ_ONLY";
  }
}

function fieldPath(prefix: string | undefined, name: string): string {
  return prefix ? `${prefix}.${name}` : name;
}

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function storageColumn(value: string): string {
  return value.split(".")[0] ?? value;
}
