"use client";

/**
 * Generic object-page client wrapper shared by both view + edit routes:
 *   - `/app/[entity]/[id]`        → autoEnterEdit unset → read-only render
 *   - `/app/[entity]/[id]/edit`   → autoEnterEdit=true  → enters edit on mount
 *
 * Renders `DocumentObjectPageWorkspace` for any entity whose descriptor
 * declares `renderer === "document"`. Master / ledger / simple entities
 * continue to render via `RuntimeEditPage` / `RuntimeDetailPage`.
 */

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  DocumentObjectPageWorkspace,
  buildRuntimeRecordChromeModel,
  getSurfaceRenderer,
  readRuntimeCanvasFlags,
  type RuntimeRecordChromeModel,
} from "@athyper/runtime-canvas";
import type {
  DocumentEditSessionSaveOutcome,
  DocumentSectionDescriptor,
} from "@athyper/content-ui";
import type {
  DocumentEditContext,
  EditSessionPatchBody,
  EditSessionPatchResponse,
} from "@athyper/api-contracts/edit-session";
import type {
  MetaEntityRuntimeDescriptor,
  MetaEntitySurfaceKind,
  ProcessRuntimeState,
} from "@athyper/runtime-contracts";
import {
  flattenRuntimeRecord,
  type RuntimeRecordRow,
} from "@athyper/runtime-shared/core";

interface DocumentObjectPageClientProps {
  entityCode: string;
  recordId: string;
  recordUuid: string;
  descriptor: MetaEntityRuntimeDescriptor;
  record: RuntimeRecordRow;
  processState?: ProcessRuntimeState;
  /**
   * When true (typical for `/.../[id]/edit` routes), the workspace fires
   * `enterEdit()` on mount. When omitted/false (typical for view routes at
   * `/.../[id]`), the page renders read-only until the user clicks Edit
   * in the chrome action bar, which navigates to the `/edit` URL.
   */
  autoEnterEdit?: boolean;
}

/**
 * Surfaces rendered as side drawers (context panels), not as object-page
 * sections. Mirrors `DescriptorSurfaceShell`.
 */
const CONTEXT_PANEL_KINDS: ReadonlySet<MetaEntitySurfaceKind> = new Set<MetaEntitySurfaceKind>([
  "attachments",
  "comments",
  "activity_log",
  "audit_trail",
  "versions",
  "compare",
]);

export default function DocumentObjectPageClient({
  entityCode,
  recordId,
  recordUuid,
  descriptor,
  record,
  processState,
  autoEnterEdit = false,
}: DocumentObjectPageClientProps) {
  const router = useRouter();
  const flags = useMemo(() => readRuntimeCanvasFlags(descriptor), [descriptor]);

  // ── Chrome ────────────────────────────────────────────────────────────────
  // Chrome mode tracks the URL intent so the action set surfaces correctly:
  // view route (autoEnterEdit=false) → "detail" → Edit button + Print icon
  // edit route (autoEnterEdit=true)  → "edit"   → Save button, no Print
  // The Edit action in detail mode navigates to `/.../[id]/edit`, where
  // autoEnterEdit then fires `enterEdit()` automatically.
  const chromeMode = autoEnterEdit ? "edit" : "detail";
  const baseChrome = useMemo<RuntimeRecordChromeModel>(
    () => buildRuntimeRecordChromeModel({
      contract: descriptor,
      record,
      recordId,
      mode: chromeMode,
      processState,
      flags,
    }),
    [descriptor, record, recordId, chromeMode, processState, flags],
  );

  // ── Sections derived from main surfaces ───────────────────────────────────
  const mainSurfaces = useMemo(
    () => descriptor.surfaces
      .filter((s) => s.enabled && !CONTEXT_PANEL_KINDS.has(s.kind))
      .filter((s) => s.placement === "main")
      .filter((s) => !flags.disabledSurfaceKinds?.includes(s.kind))
      .sort((a, b) => a.order - b.order),
    [descriptor.surfaces, flags.disabledSurfaceKinds],
  );

  const sections = useMemo<DocumentSectionDescriptor<string>[]>(
    () => mainSurfaces.map((surface, idx) => ({
      id: `surface_${surface.key}`,
      label: surface.label ?? surface.kind,
      kind: surface.kind,
      // First section eager so the page renders content immediately;
      // subsequent sections defer queries until they approach the viewport.
      loadPolicy: idx === 0 ? "eager" : "nearViewport",
      hash: surface.key,
    })),
    [mainSurfaces],
  );

  const chrome = useMemo<RuntimeRecordChromeModel>(
    () => ({
      ...baseChrome,
      header: {
        ...baseChrome.header,
        tabs: sections.map((s) => ({ id: s.id, label: s.label })),
      },
    }),
    [baseChrome, sections],
  );

  // ── Per-section renderer ──────────────────────────────────────────────────
  const recordData = useMemo(() => flattenRuntimeRecord(record), [record]);

  const renderSection = useCallback(
    (descr: DocumentSectionDescriptor<string>) => {
      const surface = mainSurfaces.find((s) => `surface_${s.key}` === descr.id);
      if (!surface) return null;
      const Renderer = getSurfaceRenderer(surface.kind);
      if (!Renderer) return null;
      return (
        <Renderer
          contract={descriptor}
          surface={surface}
          record={recordData}
          recordId={recordId}
          processState={processState}
          flags={flags}
        />
      );
    },
    [mainSurfaces, descriptor, recordData, recordId, processState, flags],
  );

  // ── Edit-session transport ────────────────────────────────────────────────
  const loadEditContext = useCallback(async (): Promise<DocumentEditContext> => {
    const res = await fetch(
      `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/edit-context`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      throw new Error(`Failed to load edit context (${res.status})`);
    }
    return res.json() as Promise<DocumentEditContext>;
  }, [entityCode, recordId]);

  const saveEditSession = useCallback(
    async (body: EditSessionPatchBody, etag: string): Promise<DocumentEditSessionSaveOutcome> => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/edit-session`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "If-Match": etag,
          },
          body: JSON.stringify(body),
        },
      );

      if (res.ok) {
        const response = await res.json() as EditSessionPatchResponse;
        return { type: "ok", response };
      }

      // 412 Precondition Failed (etag mismatch) and 409 Conflict are both
      // surfaced via the proactive conflict path so the user can resolve.
      if (res.status === 409 || res.status === 412) {
        const errBody = await res.json().catch(() => ({}));
        return {
          type: "conflict",
          currentEtag: errBody.currentEtag,
          message: errBody.message,
        };
      }

      if (res.status === 422) {
        const errBody = await res.json().catch(() => ({}));
        return {
          type: "validation",
          message: errBody.message,
          fieldErrors: errBody.fieldErrors ?? {},
        };
      }

      const text = await res.text().catch(() => "");
      return { type: "error", message: text || `Save failed (${res.status})` };
    },
    [entityCode, recordId],
  );

  const streamUrl = `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/stream`;

  const onRefreshRecord = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <DocumentObjectPageWorkspace
      contract={descriptor}
      record={record}
      recordId={recordId}
      recordUuid={recordUuid}
      processState={processState}
      chrome={chrome}
      sections={sections}
      renderSection={renderSection}
      loadEditContext={loadEditContext}
      saveEditSession={saveEditSession}
      streamUrl={streamUrl}
      onRefreshRecord={onRefreshRecord}
      autoEnterEdit={autoEnterEdit}
      flags={flags}
    />
  );
}
