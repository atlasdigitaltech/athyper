"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EntityOperation } from "@athyper/api-contracts/metadata";
import type { FlowBundle } from "@athyper/api-contracts/documents";
import { queryKeys } from "@athyper/api-contracts/query-keys";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import { getCsrfToken } from "@athyper/runtime-shared/client";
import type {
  RuntimeOperationExecutionInput,
  RuntimeOperationExecutionResult,
} from "@athyper/runtime-contracts";

export interface UseOperationDispatchOptions {
  entityCode: string;
  recordId: string;
  recordUuid?: string;
  statusFieldName?: string;
  userPermissions?: string[];
  executeOperation?: (input: RuntimeOperationExecutionInput) => Promise<RuntimeOperationExecutionResult>;
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

function extractFlowCode(handlerTarget: string | null | undefined): string | null {
  if (!handlerTarget) return null;
  const match = /^flow:([a-z][a-z0-9_]*)$/.exec(handlerTarget);
  return match?.[1] ?? null;
}

function getRecordStatus(body: Record<string, unknown>, statusFieldName?: string): string | null {
  if (!statusFieldName) return null;
  const record = body["record"];
  if (!record || typeof record !== "object") return null;
  const status = (record as Record<string, unknown>)[statusFieldName];
  return typeof status === "string" ? status : null;
}

function getExecutionStatus(
  result: RuntimeOperationExecutionResult,
  statusFieldName?: string,
): string | null {
  if (result.lifecycleState) return result.lifecycleState;
  if (result.processState?.lifecycle?.currentState) return result.processState.lifecycle.currentState;
  const record = result.record;
  if (!record) return null;
  if (typeof record.status === "string") return record.status;
  if (!statusFieldName) return null;
  const data = record.data ?? {};
  const value = data[statusFieldName] ?? record[statusFieldName];
  return typeof value === "string" ? value : null;
}

function getExecutionError(result: RuntimeOperationExecutionResult): string | null {
  const first = result.errors?.[0];
  return first?.message ?? null;
}

function createIdempotencyKey(entityCode: string, recordId: string, actionCode: string): string {
  const random = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${entityCode}:${recordId}:${actionCode}:${random}`;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  return typeof body["message"] === "string" ? body["message"] : fallback;
}

export function useOperationDispatch({
  entityCode,
  recordId,
  recordUuid,
  statusFieldName,
  userPermissions = [],
  executeOperation,
}: UseOperationDispatchOptions): UseOperationDispatchReturn {
  const queryClient = useQueryClient();

  const [activeOpCode, setActiveOpCode] = useState<string | null>(null);
  const [activeBundle, setActiveBundle] = useState<FlowBundle | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const idempotencyKeysRef = useRef(new Map<string, string>());

  const getIdempotencyKey = useCallback((targetId: string, actionCode: string) => {
    const key = `${entityCode}:${targetId}:${actionCode}`;
    const existing = idempotencyKeysRef.current.get(key);
    if (existing) return existing;
    const created = createIdempotencyKey(entityCode, targetId, actionCode);
    idempotencyKeysRef.current.set(key, created);
    return created;
  }, [entityCode]);

  const clearIdempotencyKey = useCallback((targetId: string, actionCode: string) => {
    idempotencyKeysRef.current.delete(`${entityCode}:${targetId}:${actionCode}`);
  }, [entityCode]);

  const applyStatusToDetailCache = useCallback((status: string | null) => {
    if (!status || !statusFieldName) return;
    queryClient.setQueryData(
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
  }, [entityCode, queryClient, recordId, statusFieldName]);

  const refreshRecordQueries = useCallback(async () => {
    const detailKey = queryKeys.entityDetail.byId(entityCode, recordId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: detailKey }),
      recordUuid && recordUuid !== recordId
        ? queryClient.invalidateQueries({ queryKey: queryKeys.entityDetail.byId(entityCode, recordUuid) })
        : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: queryKeys.entityList.byType(entityCode) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowInbox.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowInbox.count }),
      queryClient.invalidateQueries({ queryKey: queryKeys.entityOperations.byEntity(entityCode) }),
      queryClient.invalidateQueries({ queryKey: ["runtime-process-state", entityCode, recordId] }),
      queryClient.invalidateQueries({ queryKey: ["record-workflow", entityCode, recordId] }),
      queryClient.invalidateQueries({ queryKey: ["record-approvals", entityCode, recordId] }),
      queryClient.invalidateQueries({ queryKey: ["activity", entityCode] }),
    ]);
    await queryClient.refetchQueries({ queryKey: detailKey, exact: true });
  }, [entityCode, queryClient, recordId, recordUuid]);

  const postAction = useCallback(async (
    actionCode: string,
    targetId: string,
    body: Record<string, unknown>,
  ) => {
    const idempotencyKey = getIdempotencyKey(targetId, actionCode);
    if (executeOperation) {
      const result = await executeOperation({
        entityCode,
        recordId: targetId,
        operationCode: actionCode,
        payload: body,
        remarks: typeof body["remarks"] === "string" ? body["remarks"] : undefined,
        idempotencyKey,
      });
      const error = getExecutionError(result);
      if (error) {
        clearIdempotencyKey(targetId, actionCode);
        throw new Error(error);
      }
      applyStatusToDetailCache(getExecutionStatus(result, statusFieldName));
      clearIdempotencyKey(targetId, actionCode);
      await refreshRecordQueries();
      return;
    }

    const response = await fetch(
      runtimePath.action(entityCode, targetId, actionCode),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      clearIdempotencyKey(targetId, actionCode);
      throw new Error(await readErrorMessage(response, `Action failed (${response.status})`));
    }
    const responseBody = await response.json().catch(() => ({})) as Record<string, unknown>;
    applyStatusToDetailCache(getRecordStatus(responseBody, statusFieldName));
    clearIdempotencyKey(targetId, actionCode);
    await refreshRecordQueries();
  }, [applyStatusToDetailCache, clearIdempotencyKey, entityCode, executeOperation, getIdempotencyKey, refreshRecordQueries, statusFieldName]);

  const closeModal = useCallback(() => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setActiveOpCode(null);
    setActiveBundle(null);
  }, [isSubmitting]);

  const dispatch = useCallback(
    (actionCode: string, operations: EntityOperation[], opts?: { remarks?: string }): Promise<void> | void => {
      if (isSubmitting) return;
      const operation = operations.find((item) => item.permission_code === actionCode);
      if (!operation || (operation.handler_type !== "MODAL" && operation.handler_type !== "API")) return;

      if (operation.handler_type === "API") {
        const targetId = recordUuid ?? recordId;
        if (!targetId) return;
        return (async () => {
          setIsSubmitting(true);
          try {
            await postAction(actionCode, targetId, { remarks: opts?.remarks });
          } finally {
            setIsSubmitting(false);
          }
        })();
      }

      const flowCode = extractFlowCode(operation.handler_target);
      if (!flowCode) {
        const targetId = recordUuid ?? recordId;
        if (!targetId) return;
        return (async () => {
          setIsSubmitting(true);
          try {
            await postAction(actionCode, targetId, { remarks: opts?.remarks });
          } finally {
            setIsSubmitting(false);
          }
        })();
      }

      setActiveOpCode(actionCode);
      setIsModalOpen(true);
      fetch(
        `/api/relay/api/metadata/entities/${encodeURIComponent(entityCode)}/flow?flow_code=${encodeURIComponent(flowCode)}`,
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(`Failed to fetch flow bundle: ${response.status}`);
          const json = await response.json() as { bundle: FlowBundle } | FlowBundle;
          const bundle = "bundle" in json ? json.bundle : json;
          setActiveBundle({
            ...bundle,
            user_permissions: [
              ...new Set([...(bundle.user_permissions ?? []), ...userPermissions]),
            ],
          });
        })
        .catch((err: unknown) => {
          console.error("[useOperationDispatch] Failed to fetch flow bundle:", err);
          setIsModalOpen(false);
          setActiveOpCode(null);
          setActiveBundle(null);
        });
    },
    [entityCode, isSubmitting, postAction, recordId, recordUuid, userPermissions],
  );

  const submitModal = useCallback(async (draft: Record<string, unknown>) => {
    if (!activeOpCode) return;
    setIsSubmitting(true);
    try {
      await postAction(activeOpCode, recordUuid ?? recordId, draft);
      setIsModalOpen(false);
      setActiveOpCode(null);
      setActiveBundle(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [activeOpCode, postAction, recordId, recordUuid]);

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
