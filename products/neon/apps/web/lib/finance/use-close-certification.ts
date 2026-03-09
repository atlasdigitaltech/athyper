"use client";

// lib/finance/use-close-certification.ts
//
// Phase 9C: Close Certification Pack hooks.
// Certification lifecycle, evidence retrieval, and pack assembly.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet, finPost, finPatch } from "./fetcher";

import type {
  CloseCertificationDTO,
  CloseCertificationPackDTO,
  CloseTaskEvidenceDTO,
  CloseExceptionRegisterDTO,
  CloseOverrideRegisterDTO,
  CloseSlaComplianceDTO,
  AssembleCertificationInput,
  CertifyCloseInput,
  AttestCloseInput,
} from "./types";

// ---------------------------------------------------------------------------
// Shared params
// ---------------------------------------------------------------------------

export interface CloseCertificationParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Certification Record Hook
// ---------------------------------------------------------------------------

export interface UseCloseCertificationResult {
  certification: CloseCertificationDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  assemble: (input?: AssembleCertificationInput) => Promise<CloseCertificationDTO>;
  certify: (input: CertifyCloseInput) => Promise<CloseCertificationDTO>;
  attest: (input: AttestCloseInput) => Promise<CloseCertificationDTO>;
  revoke: (reason: string, revokedBy: string) => Promise<void>;
}

export function useCloseCertification(
  params: CloseCertificationParams | null,
): UseCloseCertificationResult {
  const [certification, setCertification] = useState<CloseCertificationDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const baseUrl = useMemo(() => {
    if (!params) return null;
    const qs = new URLSearchParams({
      entityCode: params.entityCode,
      fiscalYear: String(params.fiscalYear),
      periodNumber: String(params.periodNumber),
    });
    return `/api/fin/close-certification?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!baseUrl) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: CloseCertificationDTO | null }>(baseUrl, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setCertification(res.data);
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
  }, [baseUrl, refreshKey]);

  const assemble = useCallback(
    async (input?: AssembleCertificationInput) => {
      if (!params) throw new Error("Missing params");
      const res = await finPost<{ data: CloseCertificationDTO }>(
        "/api/fin/close-certification/assemble",
        { ...params, ...input },
      );
      setCertification(res.data);
      return res.data;
    },
    [params],
  );

  const certify = useCallback(
    async (input: CertifyCloseInput) => {
      if (!certification) throw new Error("No certification to sign off");
      const res = await finPatch<{ data: CloseCertificationDTO }>(
        `/api/fin/close-certification/${certification.id}/certify`,
        input,
      );
      setCertification(res.data);
      return res.data;
    },
    [certification],
  );

  const attest = useCallback(
    async (input: AttestCloseInput) => {
      if (!certification) throw new Error("No certification to attest");
      const res = await finPatch<{ data: CloseCertificationDTO }>(
        `/api/fin/close-certification/${certification.id}/attest`,
        input,
      );
      setCertification(res.data);
      return res.data;
    },
    [certification],
  );

  const revoke = useCallback(
    async (reason: string, revokedBy: string) => {
      if (!certification) throw new Error("No certification to revoke");
      await finPatch(
        `/api/fin/close-certification/${certification.id}/revoke`,
        { reason, revokedBy },
      );
      refresh();
    },
    [certification, refresh],
  );

  return { certification, loading, error, refresh, assemble, certify, attest, revoke };
}

// ---------------------------------------------------------------------------
// Task Evidence Hook
// ---------------------------------------------------------------------------

export interface UseCloseTaskEvidenceResult {
  evidence: CloseTaskEvidenceDTO[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useCloseTaskEvidence(
  params: CloseCertificationParams | null,
): UseCloseTaskEvidenceResult {
  const [evidence, setEvidence] = useState<CloseTaskEvidenceDTO[] | null>(null);
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
    return `/api/fin/close-certification/task-evidence?${qs}`;
  }, [params?.entityCode, params?.fiscalYear, params?.periodNumber]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    finGet<{ data: CloseTaskEvidenceDTO[] }>(url, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setEvidence(res.data);
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

  return { evidence, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Full Certification Pack Hook (for export)
// ---------------------------------------------------------------------------

export interface UseCloseCertificationPackResult {
  pack: CloseCertificationPackDTO | null;
  loading: boolean;
  error: string | null;
  fetchPack: () => Promise<CloseCertificationPackDTO>;
}

export function useCloseCertificationPack(
  params: CloseCertificationParams | null,
): UseCloseCertificationPackResult {
  const [pack, setPack] = useState<CloseCertificationPackDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPack = useCallback(async () => {
    if (!params) throw new Error("Missing params");
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        entityCode: params.entityCode,
        fiscalYear: String(params.fiscalYear),
        periodNumber: String(params.periodNumber),
      });
      const res = await finGet<{ data: CloseCertificationPackDTO }>(
        `/api/fin/close-certification/pack?${qs}`,
      );
      setPack(res.data);
      return res.data;
    } catch (err) {
      const msg =
        err instanceof FinanceHttpError
          ? err.message
          : String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [params]);

  return { pack, loading, error, fetchPack };
}
