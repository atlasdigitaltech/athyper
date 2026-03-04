"use client";

import { useCallback, useState } from "react";

import { buildHeaders } from "./use-csrf";

interface MutationState {
    loading: boolean;
    error: string | null;
}

interface UsePolicyMutationsOptions {
    policyId: string;
    onSuccess: () => void;
}

export function usePolicyMutations({ policyId, onSuccess }: UsePolicyMutationsOptions) {
    const [state, setState] = useState<MutationState>({ loading: false, error: null });

    const apiCall = useCallback(async (url: string, method: string, body?: unknown) => {
        setState({ loading: true, error: null });
        try {
            const headers: Record<string, string> = { ...buildHeaders() };
            if (body !== undefined) headers["Content-Type"] = "application/json";

            const res = await fetch(url, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                credentials: "same-origin",
            });

            if (!res.ok) {
                const data = (await res.json()) as { error?: { message?: string } };
                throw new Error(data.error?.message ?? `Request failed (${res.status})`);
            }

            onSuccess();
            return true;
        } catch (err) {
            setState({ loading: false, error: err instanceof Error ? err.message : "Operation failed" });
            return false;
        } finally {
            setState((prev) => ({ ...prev, loading: false }));
        }
    }, [onSuccess]);

    const base = `/api/admin/mesh/policy-studio/${encodeURIComponent(policyId)}`;

    const addRule = useCallback(async (rule: Record<string, unknown>) => {
        return apiCall(`${base}/rules`, "POST", rule);
    }, [apiCall, base]);

    const duplicateRule = useCallback(async (rule: Record<string, unknown>) => {
        // Create a copy of the rule with a new priority
        const { id, ...rest } = rule;
        return apiCall(`${base}/rules`, "POST", { ...rest, priority: (rest.priority as number ?? 0) + 1 });
    }, [apiCall, base]);

    const updateRule = useCallback(async (ruleId: string, rule: Record<string, unknown>) => {
        return apiCall(`${base}/rules`, "PUT", { ruleId, ...rule });
    }, [apiCall, base]);

    const deleteRule = useCallback(async (ruleId: string) => {
        return apiCall(`${base}/rules`, "DELETE", { ruleId });
    }, [apiCall, base]);

    const newVersion = useCallback(async () => {
        return apiCall(`${base}/versions`, "POST", { action: "create" });
    }, [apiCall, base]);

    const publishVersion = useCallback(async (versionId: string) => {
        return apiCall(`${base}/versions`, "POST", { action: "publish", versionId });
    }, [apiCall, base]);

    const archiveVersion = useCallback(async (versionId: string) => {
        return apiCall(`${base}/versions`, "POST", { action: "archive", versionId });
    }, [apiCall, base]);

    const recompile = useCallback(async () => {
        return apiCall(`${base}/compile`, "POST");
    }, [apiCall, base]);

    const deletePolicy = useCallback(async () => {
        return apiCall(base, "DELETE");
    }, [apiCall, base]);

    return {
        ...state,
        addRule,
        updateRule,
        duplicateRule,
        deleteRule,
        newVersion,
        publishVersion,
        archiveVersion,
        recompile,
        deletePolicy,
    };
}
