/**
 * buildTier1Adapter — converts an EntityViewDescriptor (with edit section)
 * into an ephemeral EntityEditAdapter for the generic meta-edit runtime.
 *
 * Tier 1 entities require zero custom React code. The descriptor alone
 * drives fetch, header, form layout, and save.
 *
 *   fetchRecord  → GET  /api/relay/api/records/:entityCode/:recordId
 *   save         → PATCH /api/relay/api/records/:entityCode/:recordUuid
 *   buildHeaderModel → derived from descriptor identity/facts/audit + editState
 *
 * The returned adapter is ephemeral — created via useMemo in GenericMetaEditPage,
 * not stored in the adapter registry. Descriptor registry drives Tier 1.
 */

import type { EntityViewDescriptor } from "@athyper/runtime-shared/descriptors";
import type { EntityEditAdapter } from "./adapter/types";
import type { EntityEditState } from "./types";
import type { EntityHeaderModel, HeaderFact, HeaderAuditMeta } from "../header/types";
import type { SemanticIntent } from "@athyper/theme/semantic-colors";

// ── Status helpers ─────────────────────────────────────────────────────────────

function tier1StatusIntent(status: string): SemanticIntent {
  switch (status.toLowerCase()) {
    case "active":   return "success";
    case "draft":    return "warning";
    case "inactive":
    case "archived": return "muted";
    default:         return "neutral";
  }
}

function tier1StatusLabel(status: string): string {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

// ── Header builder ─────────────────────────────────────────────────────────────

function buildTier1HeaderModel(
  descriptor: EntityViewDescriptor,
  data: Record<string, unknown>,
  editState: EntityEditState,
): EntityHeaderModel {
  const { identity, facts: factDefs, audit: auditDef } = descriptor;

  const number    = String(data[identity.numberField] ?? "—");
  const title     = identity.titleField ? String(data[identity.titleField] ?? "") : undefined;
  const statusRaw = identity.statusField ? String(data[identity.statusField] ?? "") : "";

  const statusLabel: string     = editState.isDirty ? "Unsaved changes" : tier1StatusLabel(statusRaw);
  const statusIntent: SemanticIntent = editState.isDirty ? "warning" : tier1StatusIntent(statusRaw);

  const facts: HeaderFact[] = (factDefs ?? []).map((f) => ({
    id:        f.id,
    label:     f.label,
    value:     String(data[f.field] ?? "—"),
    valueType: "text" as const,
  }));

  let auditMeta: HeaderAuditMeta | undefined;
  if (auditDef) {
    const at = auditDef.createdAtField  ? (data[auditDef.createdAtField]  as string | undefined) : undefined;
    const ab = auditDef.createdByField  ? (data[auditDef.createdByField]  as string | undefined) : undefined;
    const ut = auditDef.updatedAtField  ? (data[auditDef.updatedAtField]  as string | undefined) : undefined;
    const ub = auditDef.updatedByField  ? (data[auditDef.updatedByField]  as string | undefined) : undefined;
    if (at ?? ab ?? ut ?? ub) {
      auditMeta = { createdAt: at, createdBy: ab, updatedAt: ut, updatedBy: ub };
    }
  }

  return {
    identity: {
      typeLabel:        identity.typeLabel,
      typeHref:         `/app/${descriptor.entityCode}`,
      number,
      title:            title && title !== number ? title : undefined,
      identifierAction: "copy",
      status:           { label: statusLabel, intent: statusIntent },
    },
    actions: [
      {
        id:        "save",
        label:     "Save",
        placement: "primary",
        order:     1,
        icon:      "approve",
        disabled:  !editState.isDirty || editState.isSaving,
        pending:   editState.isSaving,
      },
      {
        id:        "discard",
        label:     "Discard",
        placement: "secondary",
        order:     2,
        disabled:  !editState.isDirty,
      },
      {
        id:        "cancel",
        label:     "Exit",
        placement: "secondary",
        order:     3,
      },
    ],
    facts: facts.length ? facts : undefined,
    audit: auditMeta,
  };
}

// ── Adapter factory ────────────────────────────────────────────────────────────

export function buildTier1Adapter(descriptor: EntityViewDescriptor): EntityEditAdapter {
  const edit = descriptor.edit!;

  return {
    entityCode: descriptor.entityCode,

    editableFields: edit.fields.map((f) => ({
      name:             f.name,
      label:            f.label,
      hint:             f.hint,
      editable:         f.editable,
      apiField:         f.apiField,
      inputType:        f.inputType,
      maxLength:        f.maxLength,
      placeholder:      f.placeholder,
      required:         f.required,
      editableInStatus: f.editableInStatus,
    })),

    editPolicy: edit.editableStatuses?.length
      ? { editableStatuses: edit.editableStatuses }
      : undefined,

    async fetchRecord({ entityCode, recordId }) {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}`,
      );
      if (!res.ok) throw new Error(`Failed to load ${entityCode}: ${res.status}`);
      return res.json() as Promise<{ id: string; data: Record<string, unknown>; status?: string }>;
    },

    buildHeaderModel({ data, editState }) {
      return buildTier1HeaderModel(descriptor, data, editState as EntityEditState);
    },

    async save({ entityCode, recordUuid, recordId, patch }) {
      const id  = recordUuid ?? recordId;
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(id)}`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(patch),
        },
      );
      if (res.ok) return { ok: true };
      const body = await res.json().catch(() => null) as { message?: string } | null;
      return {
        ok:          false,
        globalError: body?.message ?? "Save failed. Please try again.",
      };
    },
  };
}
