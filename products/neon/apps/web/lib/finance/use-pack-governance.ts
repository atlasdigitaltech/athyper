"use client";

// lib/finance/use-pack-governance.ts
//
// Data-fetching hooks for Pack Governance: certification, distribution, activity.

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet, finPost, finPatch } from "./fetcher";

import type {
  PackCertificationDTO,
  CertificationStatus,
  AdvanceCertificationInput,
  PackDistributionDTO,
  PackDistributionRecipientDTO,
  CreateDistributionInput,
  PackActivityDTO,
  ForecastScenarioDTO,
} from "./types";

// ---------------------------------------------------------------------------
// usePackCertification — fetch and manage certification for a pack
// ---------------------------------------------------------------------------

export interface UsePackCertificationResult {
  certification: PackCertificationDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  advanceCertification: (input: AdvanceCertificationInput) => Promise<PackCertificationDTO | null>;
  advancing: boolean;
}

export function usePackCertification(
  packInstanceId: string | null,
): UsePackCertificationResult {
  const [certification, setCertification] = useState<PackCertificationDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!packInstanceId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await finGet<PackCertificationDTO>(
        `/api/fin/packs/instances/${packInstanceId}/certification`,
        controller.signal,
      );
      if (!controller.signal.aborted) setCertification(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load certification";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [packInstanceId]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  const advanceCertification = useCallback(
    async (input: AdvanceCertificationInput): Promise<PackCertificationDTO | null> => {
      if (!packInstanceId) return null;
      setAdvancing(true);
      setError(null);

      try {
        const result = await finPatch<PackCertificationDTO>(
          `/api/fin/packs/instances/${packInstanceId}/certification`,
          input,
        );
        setCertification(result);
        return result;
      } catch (err) {
        const message =
          err instanceof FinanceHttpError ? err.message
          : err instanceof Error ? err.message
          : "Failed to advance certification";
        setError(message);
        return null;
      } finally {
        setAdvancing(false);
      }
    },
    [packInstanceId],
  );

  return { certification, loading, error, refresh, advanceCertification, advancing };
}

// ---------------------------------------------------------------------------
// usePackDistributions — list and manage distributions
// ---------------------------------------------------------------------------

export interface UsePackDistributionsResult {
  distributions: PackDistributionDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createDistribution: (input: CreateDistributionInput) => Promise<PackDistributionDTO | null>;
  creating: boolean;
}

export function usePackDistributions(
  packInstanceId: string | null,
): UsePackDistributionsResult {
  const [distributions, setDistributions] = useState<PackDistributionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!packInstanceId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await finGet<PackDistributionDTO[]>(
        `/api/fin/packs/instances/${packInstanceId}/distributions`,
        controller.signal,
      );
      if (!controller.signal.aborted) setDistributions(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load distributions";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [packInstanceId]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  const createDistribution = useCallback(
    async (input: CreateDistributionInput): Promise<PackDistributionDTO | null> => {
      setCreating(true);
      setError(null);

      try {
        const result = await finPost<PackDistributionDTO>(
          "/api/fin/packs/distributions",
          input,
        );
        fetchData();
        return result;
      } catch (err) {
        const message =
          err instanceof FinanceHttpError ? err.message
          : err instanceof Error ? err.message
          : "Failed to create distribution";
        setError(message);
        return null;
      } finally {
        setCreating(false);
      }
    },
    [fetchData],
  );

  return { distributions, loading, error, refresh, createDistribution, creating };
}

// ---------------------------------------------------------------------------
// useDistributionRecipients — get recipients for a distribution
// ---------------------------------------------------------------------------

export interface UseDistributionRecipientsResult {
  recipients: PackDistributionRecipientDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDistributionRecipients(
  distributionId: string | null,
): UseDistributionRecipientsResult {
  const [recipients, setRecipients] = useState<PackDistributionRecipientDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!distributionId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await finGet<{ recipients: PackDistributionRecipientDTO[] }>(
        `/api/fin/packs/distributions/${distributionId}`,
        controller.signal,
      );
      if (!controller.signal.aborted) setRecipients(data.recipients);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load recipients";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [distributionId]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { recipients, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// usePackActivity — fetch activity timeline
// ---------------------------------------------------------------------------

export interface UsePackActivityResult {
  activities: PackActivityDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePackActivity(
  packInstanceId: string | null,
  limit?: number,
): UsePackActivityResult {
  const [activities, setActivities] = useState<PackActivityDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!packInstanceId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));

      const url = `/api/fin/packs/instances/${packInstanceId}/activity${params.toString() ? `?${params}` : ""}`;
      const data = await finGet<PackActivityDTO[]>(url, controller.signal);
      if (!controller.signal.aborted) setActivities(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load activity";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [packInstanceId, limit]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { activities, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useForecastScenarios — list forecast scenarios
// ---------------------------------------------------------------------------

export interface UseForecastScenariosResult {
  scenarios: ForecastScenarioDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useForecastScenarios(
  entityCode: string | null,
  scenarioType?: string,
): UseForecastScenariosResult {
  const [scenarios, setScenarios] = useState<ForecastScenarioDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!entityCode) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ entityCode });
      if (scenarioType) params.set("scenarioType", scenarioType);

      const data = await finGet<ForecastScenarioDTO[]>(
        `/api/fin/forecasts/scenarios?${params}`,
        controller.signal,
      );
      if (!controller.signal.aborted) setScenarios(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load forecast scenarios";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [entityCode, scenarioType]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { scenarios, loading, error, refresh };
}
