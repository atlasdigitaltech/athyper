"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "./use-csrf";

// ─── Types ───────────────────────────────────────────────────

export interface QueueMetrics {
    name: string;
    isPaused: boolean;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}

export type JobStatus = "pending" | "active" | "completed" | "failed" | "delayed";

export interface JobSummary {
    id: string;
    name: string;
    status: JobStatus;
    priority: number;
    attempts: number;
    maxAttempts: number;
    createdAt: string;
    processedAt?: string;
    completedAt?: string;
    failedReason?: string;
}

export interface JobDetail extends JobSummary {
    data: Record<string, unknown>;
    returnValue?: unknown;
    stackTrace?: string[];
    progress?: number;
    delay?: number;
}

// ─── useJobQueues ────────────────────────────────────────────

interface UseJobQueuesResult {
    queues: QueueMetrics[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

export function useJobQueues(autoRefreshMs = 10_000): UseJobQueuesResult {
    const [queues, setQueues] = useState<QueueMetrics[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchQueues = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/admin/mesh/jobs/queues", {
                headers: buildHeaders(),
                credentials: "same-origin",
                signal: controller.signal,
            });

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load queues (${res.status})`);
            }

            const body = (await res.json()) as { data: QueueMetrics[] };
            setQueues(body.data ?? []);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load queues");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchQueues();
        const interval = setInterval(fetchQueues, autoRefreshMs);
        return () => {
            clearInterval(interval);
            abortRef.current?.abort();
        };
    }, [fetchQueues, autoRefreshMs]);

    return { queues, loading, error, refresh: fetchQueues };
}

// ─── useJobList ──────────────────────────────────────────────

interface UseJobListResult {
    jobs: JobSummary[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

export function useJobList(
    queue: string | null,
    status: JobStatus = "active",
    autoRefreshMs = 10_000,
): UseJobListResult {
    const [jobs, setJobs] = useState<JobSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchJobs = useCallback(async () => {
        if (!queue) {
            setJobs([]);
            setLoading(false);
            return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const qs = new URLSearchParams({ status });
            const res = await fetch(
                `/api/admin/mesh/jobs/queues/${encodeURIComponent(queue)}?${qs.toString()}`,
                {
                    headers: buildHeaders(),
                    credentials: "same-origin",
                    signal: controller.signal,
                },
            );

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load jobs (${res.status})`);
            }

            const body = (await res.json()) as { data: JobSummary[] };
            setJobs(body.data ?? []);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load jobs");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [queue, status]);

    useEffect(() => {
        fetchJobs();
        const interval = setInterval(fetchJobs, autoRefreshMs);
        return () => {
            clearInterval(interval);
            abortRef.current?.abort();
        };
    }, [fetchJobs, autoRefreshMs]);

    return { jobs, loading, error, refresh: fetchJobs };
}

// ─── useJobDetail ────────────────────────────────────────────

interface UseJobDetailResult {
    job: JobDetail | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

export function useJobDetail(queue: string | null, jobId: string | null): UseJobDetailResult {
    const [job, setJob] = useState<JobDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchDetail = useCallback(async () => {
        if (!queue || !jobId) {
            setJob(null);
            setLoading(false);
            return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/admin/mesh/jobs/queues/${encodeURIComponent(queue)}/${encodeURIComponent(jobId)}`,
                {
                    headers: buildHeaders(),
                    credentials: "same-origin",
                    signal: controller.signal,
                },
            );

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load job (${res.status})`);
            }

            const body = (await res.json()) as { data: JobDetail };
            setJob(body.data ?? null);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load job");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [queue, jobId]);

    useEffect(() => {
        fetchDetail();
        return () => abortRef.current?.abort();
    }, [fetchDetail]);

    return { job, loading, error, refresh: fetchDetail };
}
