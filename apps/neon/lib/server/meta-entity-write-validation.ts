import "server-only";

import type { MetaEntityField, MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import {
  evaluateMetaEntityFieldEditability,
  validateMetaEntityFieldValue,
} from "@athyper/runtime-shared/meta-entity";

const SYSTEM_FIELD_NAMES = new Set([
  "id",
  "tenant_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "deleted_by",
  "row_version",
  "is_deleted",
  "is_active",
  "status_changed_at",
  "status_changed_by",
]);

export type WriteMode = "create" | "edit";
export type RuntimeOperationAction = WriteMode | "delete";

export interface RuntimeWriteActor {
  userId: string;
  tenantId?: string;
  plane: string;
  checkPermission: (code: string) => boolean;
  organizationScope?: Record<string, unknown>;
}

export type WriteValidationResult =
  | { ok: true; filteredData: Record<string, unknown> }
  | {
      ok: false;
      status: 400 | 403 | 422;
      error: string;
      message: string;
      fieldErrors?: Record<string, string>;
    };

export function validateRuntimeWrite(
  descriptor: MetaEntityRuntimeDescriptor,
  input: {
    mode: WriteMode;
    actor: RuntimeWriteActor;
    data: Record<string, unknown>;
    currentRecord?: Record<string, unknown>;
  },
): WriteValidationResult {
  const { actor, currentRecord, data: inputData, mode } = input;
  const permissionFailure = authorizeRuntimeOperation(descriptor, mode, actor);
  if (permissionFailure) {
    emitRuntimeWriteAuditEvent(descriptor, actor, mode, currentRecord, [], permissionFailure.error);
    return permissionFailure;
  }

  const fieldByName = new Map(descriptor.fields.map((field) => [field.name, field]));
  const fieldErrors: Record<string, string> = {};
  const filteredData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(inputData)) {
    const field = fieldByName.get(key);
    if (!field) {
      fieldErrors[key] = "This field is not part of the runtime contract.";
      continue;
    }

    const fieldAccess = validateWritableField(descriptor, field, mode, currentRecord);
    if (!fieldAccess.ok) {
      fieldErrors[key] = fieldAccess.message;
      continue;
    }

    filteredData[key] = value;
  }

  if (Object.keys(fieldErrors).length > 0) {
    const deniedFields = Object.keys(fieldErrors).filter((fieldName) =>
      fieldErrors[fieldName]?.toLowerCase().includes("permission")
    );
    if (deniedFields.length > 0) {
      emitRuntimeWriteAuditEvent(descriptor, actor, mode, currentRecord, deniedFields, "FIELD_WRITE_DENIED");
      return {
        ok: false,
        status: 403,
        error: "FIELD_WRITE_DENIED",
        message: "You do not have permission to update one or more submitted fields.",
        fieldErrors,
      };
    }
    return {
      ok: false,
      status: 400,
      error: "INVALID_FIELDS",
      message: "Some submitted fields are not writable.",
      fieldErrors,
    };
  }

  if (Object.keys(filteredData).length === 0) {
    return {
      ok: false,
      status: 400,
      error: mode === "create" ? "EMPTY_CREATE" : "EMPTY_PATCH",
      message:
        mode === "create"
          ? "No editable values were submitted."
          : "No editable changes were submitted.",
    };
  }

  if (mode === "edit" && currentRecord && descriptor.lifecycle?.enabled) {
    const terminalStates = descriptor.lifecycle.terminalStates;
    const currentStatus = readRecordStatus(currentRecord);
    if (currentStatus && terminalStates.includes(currentStatus)) {
      emitRuntimeWriteAuditEvent(descriptor, actor, mode, currentRecord, [], "RECORD_IMMUTABLE");
      return {
        ok: false,
        status: 403,
        error: "RECORD_IMMUTABLE",
        message: `This record is in the "${currentStatus}" state and cannot be edited.`,
      };
    }
  }

  const validationErrors: Record<string, string> = {};
  if (mode === "create") {
    for (const field of descriptor.fields) {
      const fieldAccess = validateWritableField(descriptor, field, mode, currentRecord);
      if (!fieldAccess.ok) continue;
      if (field.isRequired) {
        const value = filteredData[field.name];
        if (value === undefined || value === null || value === "") {
          validationErrors[field.name] = `${field.label} is required.`;
        }
      }
    }
  }

  for (const [fieldName, value] of Object.entries(filteredData)) {
    const field = fieldByName.get(fieldName);
    if (!field) continue;
    const result = validateMetaEntityFieldValue(field, value, filteredData);
    if (!result.valid) {
      if (result.fieldErrors) {
        Object.assign(validationErrors, result.fieldErrors);
      } else if (result.message) {
        validationErrors[fieldName] = result.message;
      }
    }
  }

  if (Object.keys(validationErrors).length > 0) {
    return {
      ok: false,
      status: 422,
      error: "VALIDATION_FAILED",
      message: "Please fix the highlighted fields before saving.",
      fieldErrors: validationErrors,
    };
  }

  return { ok: true, filteredData };
}

export function checkVersionConflict(
  descriptor: MetaEntityRuntimeDescriptor,
  currentRecord: Record<string, unknown>,
  expectedVersion: string | null,
): {
  conflict: true;
  status: 409;
  message: string;
  versionField?: string;
  expected?: string;
  actual?: string;
} | { conflict: false } {
  const concurrency = descriptor.concurrency;
  if (!concurrency || concurrency.strategy === "none") return { conflict: false };
  if (concurrency.rollout !== "enforced") return { conflict: false };

  const versionField = concurrency.versionColumn ?? "row_version";
  const actual = normalizeVersion(currentRecord[versionField]);
  const expected = normalizeVersion(expectedVersion);
  if (!expected) {
    return {
      conflict: true,
      status: 409,
      versionField,
      actual,
      message: "This record requires a version token before it can be saved. Refresh and try again.",
    };
  }

  if (expected !== actual) {
    return {
      conflict: true,
      status: 409,
      versionField,
      expected,
      actual,
      message: "This record was modified by another session. Refresh and try again.",
    };
  }

  return { conflict: false };
}

export function maskFieldSecurityResponse(
  record: Record<string, unknown>,
  descriptor: MetaEntityRuntimeDescriptor,
): Record<string, unknown> {
  return maskRecordObject(record, descriptor);
}

function maskRecordObject(
  record: Record<string, unknown>,
  descriptor: MetaEntityRuntimeDescriptor,
): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "data" && isRecord(value)) {
      masked[key] = maskRecordObject(value, descriptor);
      continue;
    }

    const field = findDescriptorField(descriptor, key);
    if (!field || SYSTEM_FIELD_NAMES.has(key) || !isFieldReadDenied(descriptor, field)) {
      masked[key] = value;
    }
  }
  return masked;
}

export function buildRuntimeWriteActor(
  descriptor: MetaEntityRuntimeDescriptor,
  input: {
    userId: string;
    tenantId?: string;
    plane: string;
    organizationScope?: Record<string, unknown>;
  },
): RuntimeWriteActor {
  return {
    ...input,
    checkPermission: (code) => {
      const operation = descriptor.operations.find((item) => item.permissionCode === code);
      if (!operation) return true;
      return operation.enabled && !["deny", "not_granted", "not_in_plan", "addon_required"].includes(operation.permissionDecision ?? "allow");
    },
  };
}

export function normalizeExpectedVersion(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = normalizeVersion(value);
  return normalized || null;
}

export function authorizeRuntimeOperation(
  descriptor: MetaEntityRuntimeDescriptor,
  action: RuntimeOperationAction,
  actor: RuntimeWriteActor,
): Extract<WriteValidationResult, { ok: false }> | null {
  const candidates = descriptor.operations.filter((operation) => operationMatchesAction(operation.permissionCode, action));
  for (const operation of candidates) {
    if (!actor.checkPermission(operation.permissionCode)) {
      return {
        ok: false,
        status: 403,
        error: "ACCESS_DENIED",
        message: "You do not have permission to perform this action.",
      };
    }
  }
  return null;
}

function validateWritableField(
  descriptor: MetaEntityRuntimeDescriptor,
  field: MetaEntityField,
  mode: WriteMode,
  currentRecord: Record<string, unknown> | undefined,
): { ok: true } | { ok: false; message: string } {
  if (isFieldWriteDenied(descriptor, field)) {
    return { ok: false, message: "You do not have permission to update this field." };
  }
  if (field.isReadOnly) return { ok: false, message: "This field is read-only." };
  if (field.isComputed) return { ok: false, message: "This field is computed." };
  if (SYSTEM_FIELD_NAMES.has(field.name) || SYSTEM_FIELD_NAMES.has(field.columnName)) {
    return { ok: false, message: "This field is managed by the system." };
  }
  if (mode === "edit" && field.isWriteOnce) {
    return { ok: false, message: "This field can only be set on create." };
  }
  const origin = field.origin?.toLowerCase();
  if (origin === "system" || origin === "server") {
    return { ok: false, message: "This field is managed by the system." };
  }

  const editability = evaluateMetaEntityFieldEditability(field, {
    mode,
    status: currentRecord ? readRecordStatus(currentRecord) : undefined,
  });
  if (editability.disabled) {
    return { ok: false, message: editability.reason ?? "This field is not editable." };
  }
  return { ok: true };
}

function findDescriptorField(descriptor: MetaEntityRuntimeDescriptor, key: string): MetaEntityField | undefined {
  return descriptor.fields.find((item) => item.name === key || item.columnName === key);
}

function isFieldReadDenied(descriptor: MetaEntityRuntimeDescriptor, field: MetaEntityField): boolean {
  if (!descriptor.policy.hasFieldSecurity) return false;
  const visibility = asRecord(field.visibility);
  if (visibility?.["secured"] === true || visibility?.["readDenied"] === true || visibility?.["read_denied"] === true) {
    return true;
  }
  return isSensitiveFieldName(field.name);
}

function isFieldWriteDenied(descriptor: MetaEntityRuntimeDescriptor, field: MetaEntityField): boolean {
  if (!descriptor.policy.hasFieldSecurity) return false;
  const editability = asRecord(field.editability);
  if (editability?.["secured"] === true || editability?.["writeDenied"] === true || editability?.["write_denied"] === true) {
    return true;
  }
  return isSensitiveFieldName(field.name);
}

function isSensitiveFieldName(name: string): boolean {
  const normalized = name.toLowerCase();
  return /(^|_)(ssn|sin|tax_id|tin|pan|aadhaar|passport|bank_account|iban|swift|routing_number|secret|password|token|credential)($|_)/.test(normalized);
}

function operationMatchesAction(permissionCode: string, action: RuntimeOperationAction): boolean {
  const tokens = new Set(permissionCode.toLowerCase().replace(/[^a-z0-9]+/g, "_").split("_").filter(Boolean));
  if (action === "create") return tokens.has("create") || tokens.has("new") || tokens.has("insert") || tokens.has("add");
  if (action === "delete") return tokens.has("delete") || tokens.has("remove") || tokens.has("destroy");
  return tokens.has("edit") || tokens.has("update") || tokens.has("write") || tokens.has("save") || tokens.has("patch");
}

function normalizeVersion(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/^W\//, "").replace(/^"|"$/g, "");
}

function readRecordStatus(record: Record<string, unknown>): string | undefined {
  for (const key of ["status", "lifecycle_state", "state", "current_state"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return asRecord(value) !== null;
}

function emitRuntimeWriteAuditEvent(
  descriptor: MetaEntityRuntimeDescriptor,
  actor: RuntimeWriteActor,
  mode: WriteMode,
  currentRecord: Record<string, unknown> | undefined,
  rejectedFields: string[],
  reason: string,
): void {
  if (descriptor.policy.auditMode === "disabled") return;
  console.warn("[runtime-records] write rejected", {
    actor: actor.userId,
    entity: descriptor.entityCode,
    mode,
    recordId: currentRecord?.["id"],
    rejectedFields,
    reason,
  });
}
