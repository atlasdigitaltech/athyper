import type { MetaEntityField, MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";

export interface RuntimeFieldEditabilityContext {
  mode: "create" | "edit";
  status?: string;
}

export interface RuntimeFieldEditabilityResult {
  editable: boolean;
  disabled: boolean;
  reason?: string;
  editableInStatus?: string[];
}

export interface EntityEditableFieldLike {
  name: string;
  label: string;
  hint?: string;
  editable?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  apiField?: string;
  editableInStatus?: string[];
  editingForcesStatus?: string;
  inputType?: "text" | "textarea" | "date" | "number" | "email";
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readBool(obj: Record<string, unknown> | null, ...keys: string[]): boolean | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    if (typeof obj[key] === "boolean") return obj[key] as boolean;
  }
  return undefined;
}

function readStringField(obj: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    if (typeof obj[key] === "string" && (obj[key] as string).trim()) {
      return (obj[key] as string).trim();
    }
  }
  return undefined;
}

function readStringArray(obj: Record<string, unknown> | null, ...keys: string[]): string[] | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const val = obj[key];
    if (Array.isArray(val)) {
      const arr = val.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []);
      if (arr.length > 0) return arr;
    }
  }
  return undefined;
}

export function evaluateMetaEntityFieldEditability(
  field: MetaEntityField,
  context: RuntimeFieldEditabilityContext,
): RuntimeFieldEditabilityResult {
  const { mode, status } = context;
  const editability = asRecord(field.editability);

  if (field.isReadOnly) {
    return { editable: false, disabled: true, reason: "Field is read-only." };
  }

  if (field.isComputed) {
    return { editable: false, disabled: true, reason: "Field is computed." };
  }

  if (mode === "edit" && field.isWriteOnce) {
    return { editable: false, disabled: true, reason: "Field can only be set on create." };
  }

  const origin = field.origin?.toLowerCase();
  if (origin === "system" || origin === "server") {
    return { editable: false, disabled: true, reason: "Field is managed by the system." };
  }

  if (readBool(editability, "disabled") === true) {
    const reason = readStringField(editability, "reason") ?? "Field is not editable.";
    return { editable: false, disabled: true, reason };
  }

  if (readBool(editability, "editable") === false) {
    return { editable: false, disabled: true, reason: "Field is not editable." };
  }

  if (mode === "create" && readBool(editability, "editableOnCreate") === false) {
    return { editable: false, disabled: true, reason: "Field is not editable on create." };
  }

  if (mode === "edit" && readBool(editability, "editableOnEdit") === false) {
    return { editable: false, disabled: true, reason: "Field is not editable on edit." };
  }

  const editableInStatus = readStringArray(
    editability,
    "editableInStatus",
    "editable_in_status",
    "editableInStatuses",
    "editable_in",
  );

  if (editableInStatus && editableInStatus.length > 0) {
    const currentStatus = status?.trim().toLowerCase();
    const allowed = editableInStatus.map((s) => s.toLowerCase());
    if (currentStatus && !allowed.includes(currentStatus)) {
      return {
        editable: true,
        disabled: true,
        reason: `Field is only editable when status is ${editableInStatus.join(" or ")}.`,
        editableInStatus,
      };
    }
    return { editable: true, disabled: false, editableInStatus };
  }

  return { editable: true, disabled: false };
}

function resolveInputType(field: MetaEntityField): EntityEditableFieldLike["inputType"] {
  const control = field.editor?.control;
  if (control === "textarea" || control === "json") return "textarea";
  if (control === "date" || control === "datetime") return "date";
  if (control === "number") return "number";
  if (control === "text") return "text";

  const dataType = field.dataType.toLowerCase();
  if (dataType === "text" || dataType === "json" || dataType === "jsonb") return "textarea";
  if (["date", "datetime", "timestamptz", "timestamp"].includes(dataType)) return "date";
  if (["integer", "bigint", "decimal", "numeric", "money"].includes(dataType)) return "number";
  if (field.uiType === "email") return "email";
  return "text";
}

function resolveMaxLength(field: MetaEntityField): number | undefined {
  const validation = asRecord(field.validation);
  if (!validation) return undefined;
  const raw = validation["max_length"] ?? validation["maxLength"];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function resolveEditingForcesStatus(field: MetaEntityField): string | undefined {
  const editability = asRecord(field.editability);
  return readStringField(editability, "editingForcesStatus", "editing_forces_status");
}

const HARD_EXCLUDED_ORIGINS = new Set(["system", "server"]);

export function buildMetaEntityEditableFields(
  descriptor: MetaEntityRuntimeDescriptor,
  mode: "create" | "edit",
  options?: { status?: string },
): EntityEditableFieldLike[] {
  const status = options?.status;
  const result: EntityEditableFieldLike[] = [];

  for (const field of descriptor.fields) {
    if (field.isReadOnly) continue;
    if (field.isComputed) continue;

    const origin = field.origin?.toLowerCase();
    if (origin && HARD_EXCLUDED_ORIGINS.has(origin)) continue;

    const editability = asRecord(field.editability);
    if (readBool(editability, "disabled") === true) continue;
    if (readBool(editability, "editable") === false) continue;
    if (mode === "create" && readBool(editability, "editableOnCreate") === false) continue;
    if (mode === "edit") {
      if (field.isWriteOnce) continue;
      if (readBool(editability, "editableOnEdit") === false) continue;
    }

    const result_ = evaluateMetaEntityFieldEditability(field, { mode, status });

    const editableInStatus = readStringArray(
      editability,
      "editableInStatus",
      "editable_in_status",
      "editableInStatuses",
      "editable_in",
    );

    result.push({
      name: field.name,
      label: field.label,
      editable: result_.editable,
      disabled: result_.disabled,
      disabledReason: result_.reason,
      apiField: field.name,
      editableInStatus: editableInStatus ?? result_.editableInStatus,
      editingForcesStatus: resolveEditingForcesStatus(field),
      inputType: resolveInputType(field),
      maxLength: resolveMaxLength(field),
      placeholder: field.editor?.placeholder,
      required: field.isRequired,
    });
  }

  return result;
}
