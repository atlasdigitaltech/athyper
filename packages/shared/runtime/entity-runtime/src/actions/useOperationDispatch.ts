"use client";

/**
 * useOperationDispatch — generic entity-operation dispatcher.
 *
 * Handles control.entity_operation rows based on their handler_type:
 *
 *   MODAL    — fetches the flow bundle for handler_target='flow:<code>',
 *              opens a FlowModal, calls the operation endpoint on submit.
 *   NAVIGATE — router.push(handler_target) [handled in callers — not here].
 *   API      — direct POST to the operation endpoint, no UI required.
 *   INLINE   — edit-in-place, delegated to the field renderer.
 *
 * Reusable across DocumentDetailPage and any future document page.
 * NOT purchase-invoice-specific.
 *
 * Returns:
 *   dispatch(actionCode, operations)  — call from onAction; only handles
 *                                       MODAL operations, ignores others.
 *   activeBundle   — FlowBundle for the open modal (null when closed).
 *   activeOpCode   — permission_code of the open operation.
 *   isModalOpen    — true while FlowModal should be visible.
 *   isSubmitting   — true while the operation POST is in flight.
 *   closeModal     — dismiss without submitting.
 *   submitModal    — call with the final draft from FlowModal.onSubmit.
 */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EntityOperation } from "@athyper/api-contracts/metadata";
import type { FlowBundle } from "@athyper/api-contracts/documents";
import { queryKeys } from "@athyper/api-contracts/query-keys";

function getCsrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

export interface UseOperationDispatchOptions {
  entityCode: string;
  /** Canonical business-key from the URL (NOT a UUID). */
  recordId: string;
  /** Actual UUID of the record — required for direct action API calls. */
  recordUuid?: string;
  /** Metadata-configured status field to patch into the local detail cache. */
  statusFieldName?: string;
  /** User permissions used to gate the MODAL flow overrides. */
  userPermissions?: string[];
}

export interface UseOperationDispatchReturn {
  dispatch: (actionCode: string, operations: EntityOperation[], opts?: { remarks?: string }) => Promise<void> | void;
  activeBundle: FlowBundle | null;
  activeOpCode: string | null;
  isModalOpen: boolean;
  isSubmitting: boolean;
  closeModal: () => void;
  submitModal: (draft: Record<string, unknown>) => Promise<void>;
}

/** Parses 'flow:<code>' → '<code>'.  Returns null for any other format. */
function extractFlowCode(handlerTarget: string | null | undefined): string | null {
  if (!handlerTarget) return null;
  const m = /^flow:([a-z][a-z0-9_]*)$/.exec(handlerTarget);
  return m?.[1] ?? null;
}

function getRecordStatus(body: Record<string, unknown>, statusFieldName?: string): string | null {
  if (!statusFieldName) return null;
  const record = body["record"];
  if (!record || typeof record !== "object") return null;
  const status = (record as Record<string, unknown>)[statusFieldName];
  return typeof status === "string" ? status : null;
}

export function useOperationDispatch({
  entityCode,
  recordId,
  recordUuid,
  statusFieldName,
  userPermissions = [],
}: UseOperationDispatchOptions): UseOperationDispatchReturn {
  const qc = useQueryClient();

  const [activeOpCode, setActiveOpCode]   = useState<string | null>(null);
  const [activeBundle, setActiveBundle]   = useState<FlowBundle | null>(null);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [isModalOpen,  setIsModalOpen]    = useState(false);

  const applyStatusToDetailCache = useCallback((status: string | null) => {
    if (!status || !statusFieldName) return;
    qc.setQueryData(
      queryKeys.entityDetail.byId(entityCode, recordId),
      (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        const record = current as { data?: Record<string, unknown> };
        return {
          ...record,
          data: {
            ...(record.data ?? {}),
            [statusFieldName]: status,
          },
        };
      },
    );
  }, [entityCode, recordId, qc, statusFieldName]);

  const refreshRecordQueries = useCallback(async () => {
    const detailKey = queryKeys.entityDetail.byId(entityCode, recordId);
    await Promise.all([
      qc.invalidateQueries({ queryKey: detailKey }),
      recordUuid && recordUuid !== recordId
        ? qc.invalidateQueries({ queryKey: queryKeys.entityDetail.byId(entityCode, recordUuid) })
        : Promise.resolve(),
      qc.invalidateQueries({ queryKey: queryKeys.entityList.byType(entityCode) }),
      qc.invalidateQueries({ queryKey: queryKeys.workflowInbox.all }),
      qc.invalidateQueries({ queryKey: queryKeys.workflowInbox.count }),
      qc.invalidateQueries({ queryKey: ["record-workflow", entityCode, recordId] }),
      qc.invalidateQueries({ queryKey: ["record-approvals", entityCode, recordId] }),
      qc.invalidateQueries({ queryKey: ["activity", entityCode] }),
    ]);
    await qc.refetchQueries({ queryKey: detailKey, exact: true });
  }, [entityCode, recordId, recordUuid, qc]);

  const closeModal = useCallback(() => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setActiveOpCode(null);
    setActiveBundle(null);
  }, [isSubmitting]);

  const dispatch = useCallback(
    (actionCode: string, operations: EntityOperation[], opts?: { remarks?: string }): Promise<void> | void => {
      const op = operations.find((o) => o.permission_code === actionCode);
      if (!op || op.handler_type !== "MODAL") return;

      const flowCode = extractFlowCode(op.handler_target);

      if (flowCode) {
        // Complex flow modal — fetch bundle and open modal (non-blocking)
        setActiveOpCode(actionCode);
        setIsModalOpen(true);
        fetch(
          `/api/relay/api/metadata/entities/${encodeURIComponent(entityCode)}/flow?flow_code=${encodeURIComponent(flowCode)}`,
        )
          .then(async (res) => {
            if (!res.ok) throw new Error(`Failed to fetch flow bundle: ${res.status}`);
            const json = (await res.json()) as { bundle: FlowBundle } | FlowBundle;
            const bundle = "bundle" in json ? json.bundle : json;
            setActiveBundle({
              ...bundle,
              user_permissions: [
                ...new Set([...(bundle.user_permissions ?? []), ...userPermissions]),
              ],
            });
          })
          .catch(() => {
            setIsModalOpen(false);
            setActiveOpCode(null);
          });
        return;
      }

      // Direct status transition (handler_target = 'submit'/'approve'/etc.) —
      // POST to the action endpoint immediately and await the result.
      const uuid = recordUuid;
      if (!uuid) return;

      return (async () => {
        setIsSubmitting(true);
        try {
          const res = await fetch(
            `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(uuid)}/action/${encodeURIComponent(actionCode)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
              body: JSON.stringify({ remarks: opts?.remarks }),
            },
          );
          if (!res.ok) {
            const body = await res.json().catch(() => ({})) as Record<string, unknown>;
            const msg = typeof body["message"] === "string" ? body["message"] : `Action failed (${res.status})`;
            throw new Error(msg);
          }
          const body = await res.json().catch(() => ({})) as Record<string, unknown>;
          applyStatusToDetailCache(getRecordStatus(body, statusFieldName));
          await refreshRecordQueries();
        } finally {
          setIsSubmitting(false);
        }
      })();
    },
    [entityCode, recordId, recordUuid, statusFieldName, userPermissions, applyStatusToDetailCache, refreshRecordQueries],
  );

  const submitModal = useCallback(
    async (draft: Record<string, unknown>) => {
      if (!activeOpCode) return;
      setIsSubmitting(true);
      try {
        const targetId = recordUuid ?? recordId;
        const res = await fetch(
          `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(targetId)}/action/${encodeURIComponent(activeOpCode)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
            body: JSON.stringify(draft),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as Record<string, unknown>;
          const msg = typeof body["message"] === "string" ? body["message"] : `Operation failed (${res.status})`;
          throw new Error(msg);
        }
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        applyStatusToDetailCache(getRecordStatus(body, statusFieldName));
        await refreshRecordQueries();
        setIsModalOpen(false);
        setActiveOpCode(null);
        setActiveBundle(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeOpCode, entityCode, recordId, recordUuid, statusFieldName, applyStatusToDetailCache, refreshRecordQueries],
  );

  return {
    dispatch,
    activeBundle,
    activeOpCode,
    isModalOpen,
    isSubmitting,
    closeModal,
    submitModal,
  };
}
