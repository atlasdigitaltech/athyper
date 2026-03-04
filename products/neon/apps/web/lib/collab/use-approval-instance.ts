"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { buildHeaders } from "@/lib/schema-manager/use-csrf";

// ─── Types ───────────────────────────────────────────────────

export interface ApprovalTask {
    id: string;
    stageId: string;
    assigneeId: string;
    assigneeName?: string;
    taskType: string;
    status: "pending" | "approved" | "rejected" | "skipped";
    decisionNote?: string;
    decidedAt?: string;
    dueDate?: string;
}

export interface ApprovalStage {
    id: string;
    stageNumber: number;
    name: string;
    mode: "all" | "any" | "majority";
    status: "pending" | "active" | "completed" | "rejected" | "skipped";
    tasks: ApprovalTask[];
}

export interface ApprovalInstance {
    id: string;
    entityType: string;
    entityId: string;
    policyName: string;
    status: "open" | "completed" | "rejected" | "canceled";
    requestedBy: string;
    requestedByName?: string;
    requestedAt: string;
    completedAt?: string;
    stages: ApprovalStage[];
    currentStageNumber: number;
}

// ─── Hook ────────────────────────────────────────────────────

interface UseApprovalInstanceResult {
    instance: ApprovalInstance | null;
    currentUserTask: ApprovalTask | null;
    isLoading: boolean;
    error: string | null;
    mutate: () => void;
}

export function useApprovalInstance(instanceId: string): UseApprovalInstanceResult {
    const [instance, setInstance] = useState<ApprovalInstance | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchInstance = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/collab/approvals/${encodeURIComponent(instanceId)}`, {
                headers: buildHeaders(),
                credentials: "same-origin",
                signal: controller.signal,
            });

            if (!res.ok) {
                const body = (await res.json()) as { error?: { message?: string } };
                throw new Error(body.error?.message ?? `Failed to load approval (${res.status})`);
            }

            const body = (await res.json()) as { data: ApprovalInstance };
            setInstance(body.data ?? null);
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Failed to load approval");
        } finally {
            if (!controller.signal.aborted) setIsLoading(false);
        }
    }, [instanceId]);

    useEffect(() => {
        fetchInstance();
        return () => abortRef.current?.abort();
    }, [fetchInstance]);

    // Derive current user's pending task (the BFF tags it)
    const currentUserTask =
        instance?.stages
            .flatMap((s) => s.tasks)
            .find((t) => t.status === "pending" && t.taskType === "current_user") ?? null;

    return { instance, currentUserTask, isLoading, error, mutate: fetchInstance };
}
