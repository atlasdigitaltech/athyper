"use client";

// lib/finance/use-remediation-campaigns.ts
//
// Phase 8D: Campaign management, preview/dry-run, and audit export hooks.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet, finPost } from "./fetcher";

import type {
  RemediationCampaignDTO,
  RemediationPreviewDTO,
  RemediationActionTypeDTO,
  RemediationPriorityDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Campaign List Hook
// ---------------------------------------------------------------------------

export interface CampaignListParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

export interface UseCampaignListResult {
  campaigns: RemediationCampaignDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createCampaign: (input: CreateCampaignInput) => Promise<RemediationCampaignDTO>;
  approveCampaign: (campaignId: string) => Promise<void>;
  cancelCampaign: (campaignId: string, reason: string) => Promise<void>;
}

export interface CreateCampaignInput {
  campaignName: string;
  description?: string;
  actionType: RemediationActionTypeDTO;
  priorityFilter?: RemediationPriorityDTO;
  actionIds: string[];
}

export function useCampaignList(
  params: CampaignListParams | null,
): UseCampaignListResult {
  const [campaigns, setCampaigns] = useState<RemediationCampaignDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams({
      entityCode: params.entityCode,
      fiscalYear: String(params.fiscalYear),
      periodNumber: String(params.periodNumber),
    });
    return `/api/fin/close-command-center/campaigns?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: { campaigns: RemediationCampaignDTO[] } }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setCampaigns(res.data.campaigns);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof FinanceHttpError
              ? err.message
              : String(err),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, refreshKey]);

  const createCampaign = useCallback(async (input: CreateCampaignInput) => {
    const res = await finPost<{ data: RemediationCampaignDTO }>(
      `/api/fin/close-command-center/campaigns`,
      {
        entityCode: params?.entityCode,
        fiscalYear: params?.fiscalYear,
        periodNumber: params?.periodNumber,
        ...input,
      },
    );
    refresh();
    return res.data;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber, refresh]);

  const approveCampaign = useCallback(async (campaignId: string) => {
    await finPost(`/api/fin/close-command-center/campaigns/${campaignId}/approve`, {});
    refresh();
  }, [refresh]);

  const cancelCampaign = useCallback(async (campaignId: string, reason: string) => {
    await finPost(`/api/fin/close-command-center/campaigns/${campaignId}/cancel`, { reason });
    refresh();
  }, [refresh]);

  return { campaigns, loading, error, refresh, createCampaign, approveCampaign, cancelCampaign };
}

// ---------------------------------------------------------------------------
// Preview / Dry-Run Hook
// ---------------------------------------------------------------------------

export interface UseRemediationPreviewResult {
  preview: RemediationPreviewDTO | null;
  loading: boolean;
  error: string | null;
  runPreview: (actionId: string) => Promise<RemediationPreviewDTO>;
}

export function useRemediationPreview(): UseRemediationPreviewResult {
  const [preview, setPreview] = useState<RemediationPreviewDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPreview = useCallback(async (actionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await finPost<{ data: RemediationPreviewDTO }>(
        `/api/fin/close-command-center/remediation/${actionId}/preview`,
        {},
      );
      setPreview(res.data);
      return res.data;
    } catch (err) {
      const msg = err instanceof FinanceHttpError
        ? err.message
        : String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { preview, loading, error, runPreview };
}
