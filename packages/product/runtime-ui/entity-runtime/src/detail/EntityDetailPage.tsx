/**
 * @athyper/entity-runtime — EntityDetailPage
 *
 * Top-level dispatcher for /app/[entity]/[id]. Routes to one of three shells:
 *   ledger    → LedgerDetailPage  (read-only, NAVIGATE ops only)
 *   master    → MasterDetailPage  (rich profile) or SimpleDetailPage (simple/read-only)
 *   document  → injected documentRenderer (e.g. DocumentDetailPage)
 */
"use client";

import { useRouter } from "next/navigation";
import { useCompiledEntity, useEntityDetail, useEntityOperations } from "@athyper/query";
import { resolveRendererFamily } from "@athyper/metadata-client/compiled-reader";
import { MasterDetailPage, SimpleDetailPage } from "./MasterDetailPage";
import { LedgerDetailPage } from "./LedgerDetailPage";
import { Skeleton } from "@athyper/ui/primitives";
import type { CompiledEntity, EntityOperation } from "@athyper/api-contracts/metadata";

// ── Props ──────────────────────────────────────────────────────────────────────

/** Props passed to the injected document-renderer component. */
export interface DocumentRendererProps {
  entity:     CompiledEntity;
  record:     { id: string; data: Record<string, unknown>; status?: string };
  operations: EntityOperation[] | undefined;
  recordId:   string;
  editMode?:  boolean;
}

export interface EntityDetailPageProps {
  entityCode: string;
  recordId: string;
  /** When true (URL: ?mode=edit) renders the entity form in-place. */
  editMode?: boolean;
  /** Optional internal URL to return to when opened from a workbench or launcher. */
  returnTo?: string;
  /** Renderer for entities with detail_renderer="document". Pass DocumentDetailPage from @athyper/document-runtime. */
  documentRenderer?: React.ComponentType<DocumentRendererProps>;
}

// ── Main dispatcher ────────────────────────────────────────────────────────────

export function EntityDetailPage({
  entityCode, recordId, editMode = false, returnTo, documentRenderer: DocumentRenderer,
}: EntityDetailPageProps) {
  useRouter();
  const { data: entity,     isLoading: metaLoading   } = useCompiledEntity(entityCode);
  const { data: record,     isLoading: recordLoading } = useEntityDetail(entityCode, recordId);
  const { data: operations }                            = useEntityOperations(entityCode);

  // canEdit is explicit: missing operation metadata means view-only.
  const isEntityReadOnly = entity?.feature_flags?.is_readonly === true;
  const canEdit = !isEntityReadOnly && operations?.some((op) => {
    const code = op.permission_code.includes(".")
      ? op.permission_code.split(".").pop()!
      : op.permission_code;
    return op.is_enabled && (
      ["edit", "update"].includes(code) ||
      (
        op.handler_type === "NAVIGATE" &&
        (
          (op.handler_target ?? "").includes("mode=edit") ||
          (op.handler_target ?? "").includes("/edit")
        )
      )
    );
  }) === true;
  const effectiveEditMode = editMode && canEdit;

  if (metaLoading || recordLoading || !entity) {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <Skeleton className="h-7 w-56" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">
          Record <code className="font-mono">{recordId}</code> not found
          in <code className="font-mono">{entityCode}</code>.
        </p>
      </div>
    );
  }

  const renderer   = resolveRendererFamily(entity);
  const profile    = entity.display_config.detail_profile ?? "simple";
  const isReadOnly = profile === "read-only";

  if (renderer === "ledger") {
    return (
      <LedgerDetailPage
        entity={entity}
        record={record}
        operations={operations}
        recordId={recordId}
      />
    );
  }

  if (renderer === "master") {
    if (profile === "rich") {
      return (
        <MasterDetailPage
          entity={entity}
          record={record}
          operations={operations}
          recordId={recordId}
          editMode={effectiveEditMode}
          returnTo={returnTo}
        />
      );
    }
    return (
      <SimpleDetailPage
        entityCode={entityCode}
        entity={entity}
        record={record}
        operations={operations}
        recordId={recordId}
        editMode={!isReadOnly && effectiveEditMode}
        returnTo={returnTo}
        canEdit={!isReadOnly && canEdit}
      />
    );
  }

  if (renderer === "document" && DocumentRenderer) {
    return (
      <DocumentRenderer
        entity={entity}
        record={record}
        operations={operations}
        recordId={recordId}
        editMode={effectiveEditMode}
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <p className="text-sm font-medium text-foreground">Detail renderer unavailable</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Entity <code className="font-mono">{entityCode}</code> resolved to{" "}
        <code className="font-mono">{renderer}</code>, but no matching renderer was available.
      </p>
    </div>
  );
}
