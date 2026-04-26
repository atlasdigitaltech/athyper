"use client";

/**
 * GenericMetaEditPage — full-page edit surface for Tier 1 and Tier 2 adapters.
 *
 * Tier resolution (in priority order):
 *   Tier 2 — registered EntityEditAdapter (custom logic, fieldRenderers, etc.)
 *   Tier 1 — metadata-driven: fetches CompiledEntity → builds descriptor → adapter
 *
 * The Tier 1 path covers every entity in the registry with zero custom code.
 * No static descriptor files are needed.
 *
 * Architecture:
 *   Outer (GenericMetaEditPage)
 *     - Fetches CompiledEntity from metadata API (Tier 1 only)
 *     - Looks up or derives adapter
 *     - Fetches record via adapter.fetchRecord
 *     - Runs useEntityEditState (framework-owned dirty/save lifecycle)
 *     - Provides EntityWorkspaceShell
 *   Inner (GenericMetaEditInner)
 *     - Consumes EditGuardContext (guardNavigate)
 *     - Builds header model via adapter.buildHeaderModel
 *     - Renders EntityHeader + form content
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@athyper/ui/primitives";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { EntityHeader } from "../header/EntityHeader";
import { EntityWorkspaceShell } from "./EntityWorkspaceShell";
import { useEntityEdit } from "./useEntityEdit";
import { useEntityEditState } from "./useEntityEditState";
import { getEntityEditAdapter } from "./adapter/registry";
import type { EntityEditAdapter } from "./adapter/types";
import { GenericMetaEditForm } from "./GenericMetaEditForm";
import { buildTier1Adapter } from "./buildTier1Adapter";
import { buildDescriptorFromCompiledEntity } from "./buildDescriptorFromCompiledEntity";
import type { EntityEditStateResult } from "./useEntityEditState";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface GenericMetaEditPageProps {
  entityCode: string;
  /**
   * Canonical business key from the URL [id] segment.
   * Passed to adapter.fetchRecord and used in navigation.
   */
  recordId: string;
}

// ── Inner — consumes EditGuardContext ─────────────────────────────────────────

function GenericMetaEditInner({
  entityCode,
  recordId,
  adapter,
  fetchedRecord,
  stateResult,
}: {
  entityCode:    string;
  recordId:      string;
  adapter:       EntityEditAdapter;
  fetchedRecord: { id: string; data: Record<string, unknown>; status?: string };
  stateResult:   EntityEditStateResult;
}) {
  const router = useRouter();
  const { guardNavigate } = useEntityEdit();
  const { patch, updateField, fieldErrors, globalError, ...editState } = stateResult;

  const headerModel = useMemo(
    () =>
      adapter.buildHeaderModel({
        entityCode,
        recordId,
        data:      fetchedRecord.data,
        editState,
      }),
    // Re-compute when dirty/saving state changes so header actions update immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adapter, entityCode, recordId, fetchedRecord.data, editState.isDirty, editState.isSaving],
  );

  // Editable field names filtered by current status (editableInStatus constraint)
  const editableFieldNames = useMemo(() => {
    const currentStatus = fetchedRecord.status ?? "";
    const names = new Set<string>();
    for (const f of adapter.editableFields ?? []) {
      if (!f.editable) continue;
      if (f.editableInStatus && !f.editableInStatus.includes(currentStatus)) continue;
      names.add(f.name);
    }
    return names;
  }, [adapter.editableFields, fetchedRecord.status]);

  function handleAction(action: string) {
    if (action === "discard") {
      editState.discard();
      return;
    }
    if (action === "cancel") {
      guardNavigate(() => router.push(`/app/${entityCode}/${recordId}`));
      return;
    }
    if (action === "save") {
      void editState.save();
      return;
    }
  }

  const CustomForm = adapter.renderForm;

  return (
    <div className="flex flex-col gap-2.5">
      <EntityHeader
        model={headerModel}
        onBack={() => guardNavigate(() => router.back())}
        onTypeClick={() => guardNavigate(() => router.push(`/app/${entityCode}`))}
        onAction={handleAction}
      />
      {CustomForm ? (
        <CustomForm
          record={fetchedRecord.data as never}
          editState={editState}
          updateField={updateField}
        />
      ) : (
        <GenericMetaEditForm
          record={fetchedRecord.data}
          patch={patch}
          updateField={updateField}
          editableFields={adapter.editableFields ?? []}
          fieldRenderers={adapter.fieldRenderers}
          sectionRenderers={adapter.sectionRenderers}
          fieldErrors={fieldErrors}
          globalError={globalError}
          isSaving={editState.isSaving}
          editableFieldNames={editableFieldNames}
        />
      )}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function EditSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-6">
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

// ── Outer — provides workspace shell ─────────────────────────────────────────

export function GenericMetaEditPage({ entityCode, recordId }: GenericMetaEditPageProps) {
  // Tier 1 metadata fetch — skipped when a Tier 2 adapter is already registered.
  // useMemo is intentionally not used here: getEntityEditAdapter is a synchronous
  // Map.get() that is stable for the lifetime of a mounted page.
  const hasRegisteredAdapter = !!getEntityEditAdapter(entityCode);

  const { data: compiledEntity, isLoading: isMetadataLoading } = useQuery<CompiledEntity>({
    queryKey:  ["entity-compiled", entityCode],
    queryFn:   () =>
      fetch(`/api/relay/api/metadata/entities/${encodeURIComponent(entityCode)}/compiled`)
        .then((r) => {
          if (!r.ok) throw new Error(`Metadata fetch failed: ${r.status}`);
          return r.json() as Promise<CompiledEntity>;
        }),
    staleTime: 5 * 60 * 1000,
    enabled:   !hasRegisteredAdapter,
  });

  // Build adapter — Tier 2 (registered) wins; Tier 1 derives from CompiledEntity.
  // useMemo keeps the adapter reference stable across re-renders so that
  // useEntityEditState's `fields` dependency array doesn't change identity.
  const adapter = useMemo<EntityEditAdapter | null>(() => {
    const registered = getEntityEditAdapter(entityCode);
    if (registered) return registered;
    if (compiledEntity) {
      return buildTier1Adapter(buildDescriptorFromCompiledEntity(compiledEntity));
    }
    return null;
  }, [entityCode, compiledEntity]);

  const { data: fetchedRecord, isLoading: isRecordLoading } = useQuery({
    queryKey: ["entity-edit-record", entityCode, recordId],
    queryFn:  () => adapter!.fetchRecord({ entityCode, recordId }),
    enabled:  !!adapter,
    staleTime: 0,
    retry:     false,
  });

  const stateResult = useEntityEditState({
    entityCode,
    recordId,
    record:      fetchedRecord?.data ?? ({} as Record<string, unknown>),
    fields:      adapter?.editableFields ?? [],
    currentStatus: fetchedRecord?.status,
    save: (patch) =>
      adapter!.save({
        entityCode,
        recordId,
        recordUuid: fetchedRecord?.id,
        record:     fetchedRecord?.data ?? ({} as Record<string, unknown>),
        patch,
      }),
    beforeSubmit:  adapter?.beforeSubmit as never,
    validatePatch: adapter?.validatePatch as never,
  });

  const { patch: _patch, updateField: _uf, fieldErrors: _fe, globalError: _ge, ...baseEditState } =
    stateResult;

  // ── Loading metadata (Tier 1 only) ────────────────────────────────────────
  if (!adapter && isMetadataLoading) {
    return <EditSkeleton />;
  }

  // ── No edit configuration available ──────────────────────────────────────
  if (!adapter) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        No edit configuration found for entity &quot;{entityCode}&quot;.
      </div>
    );
  }

  // ── Loading record ────────────────────────────────────────────────────────
  if (isRecordLoading || !fetchedRecord) {
    return <EditSkeleton />;
  }

  return (
    <EntityWorkspaceShell editState={baseEditState}>
      <GenericMetaEditInner
        entityCode={entityCode}
        recordId={recordId}
        adapter={adapter}
        fetchedRecord={fetchedRecord}
        stateResult={stateResult}
      />
    </EntityWorkspaceShell>
  );
}
