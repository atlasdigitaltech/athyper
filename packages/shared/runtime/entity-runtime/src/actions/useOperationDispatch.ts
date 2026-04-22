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
 * Reusable across ApprovableDetailPage and any future document page.
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

export interface UseOperationDispatchOptions {
  entityCode: string;
  /** Canonical business-key from the URL (NOT a UUID). */
  recordId: string;
  /** User permissions used to gate the MODAL flow overrides. */
  userPermissions?: string[];
}

export interface UseOperationDispatchReturn {
  dispatch: (actionCode: string, operations: EntityOperation[]) => void;
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

export function useOperationDispatch({
  entityCode,
  recordId,
  userPermissions = [],
}: UseOperationDispatchOptions): UseOperationDispatchReturn {
  const qc = useQueryClient();

  const [activeOpCode, setActiveOpCode]   = useState<string | null>(null);
  const [activeBundle, setActiveBundle]   = useState<FlowBundle | null>(null);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [isModalOpen,  setIsModalOpen]    = useState(false);

  const closeModal = useCallback(() => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setActiveOpCode(null);
    setActiveBundle(null);
  }, [isSubmitting]);

  const dispatch = useCallback(
    (actionCode: string, operations: EntityOperation[]) => {
      const op = operations.find((o) => o.permission_code === actionCode);
      if (!op || op.handler_type !== "MODAL") return;

      const flowCode = extractFlowCode(op.handler_target);
      if (!flowCode) return;

      // Fetch the flow bundle for this specific flow_code + entity
      setActiveOpCode(actionCode);
      setIsModalOpen(true);

      fetch(
        `/api/relay/api/meta/flow?entity=${encodeURIComponent(entityCode)}&flow_code=${encodeURIComponent(flowCode)}`,
      )
        .then(async (res) => {
          if (!res.ok) throw new Error(`Failed to fetch flow bundle: ${res.status}`);
          const json = (await res.json()) as { bundle: FlowBundle } | FlowBundle;
          // Support both { bundle: FlowBundle } and FlowBundle directly
          const bundle = "bundle" in json ? json.bundle : json;
          // Merge the caller's permissions into the bundle
          setActiveBundle({
            ...bundle,
            user_permissions: [
              ...new Set([...(bundle.user_permissions ?? []), ...userPermissions]),
            ],
          });
        })
        .catch(() => {
          // If we can't fetch the flow, close gracefully
          setIsModalOpen(false);
          setActiveOpCode(null);
        });
    },
    [entityCode, userPermissions],
  );

  const submitModal = useCallback(
    async (draft: Record<string, unknown>) => {
      if (!activeOpCode) return;
      setIsSubmitting(true);
      try {
        const res = await fetch(
          `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/action/${encodeURIComponent(activeOpCode)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as Record<string, unknown>;
          const msg = typeof body["message"] === "string" ? body["message"] : `Operation failed (${res.status})`;
          throw new Error(msg);
        }
        // Invalidate the record so the detail page refetches the promoted record
        await qc.invalidateQueries({
          queryKey: ["record", entityCode, recordId],
          exact: false,
        });
        setIsModalOpen(false);
        setActiveOpCode(null);
        setActiveBundle(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeOpCode, entityCode, recordId, qc],
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
