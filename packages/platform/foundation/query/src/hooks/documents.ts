"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type DocumentListParams,
  type StatusTransitionRequest,
  type DocumentBundle,
} from "@athyper/platform-api-client";
import { queryKeys } from "../query-keys";
import { clients } from "../client-store";
import { invalidateRuntimeListEntity } from "../_utils/invalidate";

export function useDocumentList(
  docType: string,
  params?: DocumentListParams,
) {
  const queryKey = params
    ? queryKeys.documentList.byTypeFiltered(docType, params as Record<string, unknown>)
    : queryKeys.documentList.byType(docType);

  return useQuery({
    queryKey,
    queryFn:   () => clients.documents().list(docType, params),
    staleTime: 30 * 1000,
  });
}

export function useDocumentDetail(docType: string, id: string) {
  return useQuery({
    queryKey:  queryKeys.documentDetail.byId(docType, id),
    queryFn:   () => clients.documents().get(docType, id),
    staleTime: 60 * 1000,
    enabled:   Boolean(id),
  });
}

/**
 * Preferred hook for document detail pages.
 * Fetches header + lines + workflow state + matching status in one round-trip.
 * Invalidated by status transitions, line mutations, and matching updates.
 */
export function useDocumentBundle<
  H = Record<string, unknown>,
  L = Record<string, unknown>,
>(
  docType: string,
  id:      string,
  opts?:   { enabled?: boolean },
) {
  return useQuery<DocumentBundle<H, L>>({
    queryKey:  queryKeys.documentBundle.byId(docType, id),
    queryFn:   () => clients.documents().getBundle<H, L>(docType, id),
    staleTime: 60 * 1000,
    enabled:   Boolean(id) && (opts?.enabled ?? true),
  });
}

export function useCreateDocument(docType: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      clients.documents().create(docType, { data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.documentList.byType(docType) });
      invalidateRuntimeListEntity(docType, "create");
    },
  });
}

export function useDocumentStatusTransition(docType: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StatusTransitionRequest) =>
      clients.documents().transition(docType, id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.documentDetail.byId(docType, id) });
      qc.invalidateQueries({ queryKey: queryKeys.documentBundle.byId(docType, id) });
      qc.invalidateQueries({ queryKey: queryKeys.documentList.byType(docType) });
      invalidateRuntimeListEntity(docType, "status_transition");
    },
  });
}
