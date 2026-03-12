// lib/schema-manager/use-entity-validation.ts
//
// Hook for managing entity validation rules.
// Provides fetch, save, and test operations.

"use client";

import { useCallback, useEffect, useState } from "react";

import { buildHeaders } from "./use-csrf";

import type { MutationResult } from "./types";

// ─── Types ───────────────────────────────────────────────────

export interface ValidationRule {
  id: string;
  name: string;
  kind: string;
  severity: "error" | "warning";
  appliesOn: string[];
  phase: "beforePersist" | "beforeTransition";
  fieldPath: string;
  message?: string;
  /** Rule provenance: "field" = auto-derived from field constraints, "custom" = manually added */
  provenance?: "field" | "custom";
  // Rule-specific fields
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  flags?: string;
  allowedValues?: string[];
  compareField?: string;
  operator?: string;
  when?: unknown;
  then?: ValidationRule[];
  afterField?: string;
  beforeField?: string;
  minDate?: string;
  maxDate?: string;
  targetEntity?: string;
  targetField?: string;
  scope?: string[];
}

export interface ValidationRuleSet {
  version: number;
  rules: ValidationRule[];
}

export interface ValidationTestResult {
  valid: boolean;
  errors: Array<{
    ruleId: string;
    ruleName: string;
    fieldPath: string;
    message: string;
    severity: string;
    value?: unknown;
  }>;
  warnings: Array<{
    ruleId: string;
    ruleName: string;
    fieldPath: string;
    message: string;
    severity: string;
    value?: unknown;
  }>;
}

// ─── Hook ────────────────────────────────────────────────────

export function useEntityValidation(entityName: string | undefined) {
  const [ruleSet, setRuleSet] = useState<ValidationRuleSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [etag, setEtag] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    if (!entityName) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/validation`,
        { headers: buildHeaders() },
      );
      const body = (await res.json()) as {
        success: boolean;
        data?: ValidationRuleSet;
        error?: { message: string };
      };

      if (!res.ok || !body.success) {
        // No rules saved yet — return empty set
        if (res.status === 404) {
          setRuleSet({ version: 1, rules: [] });
        } else {
          setError(body.error?.message ?? "Failed to load validation rules");
        }
        return;
      }

      setRuleSet(body.data ?? { version: 1, rules: [] });

      const etagHeader = res.headers.get("ETag");
      if (etagHeader) setEtag(etagHeader);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [entityName]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const saveRules = useCallback(
    async (rules: ValidationRule[]): Promise<MutationResult> => {
      if (!entityName)
        return {
          success: false,
          error: { code: "NO_ENTITY", message: "No entity name" },
        };

      try {
        const headers: Record<string, string> = {
          ...buildHeaders(),
          "Content-Type": "application/json",
        };
        if (etag) headers["If-Match"] = etag;

        const res = await fetch(
          `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/validation`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              version: ruleSet?.version ?? 1,
              rules,
            }),
          },
        );

        const body = (await res.json()) as MutationResult;

        if (res.ok && body.success) {
          setRuleSet({ version: ruleSet?.version ?? 1, rules });
          const newEtag = res.headers.get("ETag");
          if (newEtag) setEtag(newEtag);
        }

        return body;
      } catch (err) {
        return {
          success: false,
          error: { code: "NETWORK_ERROR", message: String(err) },
        };
      }
    },
    [entityName, etag, ruleSet],
  );

  const testRules = useCallback(
    async (
      payload: Record<string, unknown>,
      rules?: ValidationRule[],
      trigger: string = "create",
    ): Promise<ValidationTestResult> => {
      if (!entityName) {
        return {
          valid: false,
          errors: [
            {
              ruleId: "",
              ruleName: "",
              fieldPath: "",
              message: "No entity",
              severity: "error",
            },
          ],
          warnings: [],
        };
      }

      try {
        const res = await fetch(
          `/api/admin/mesh/meta-studio/${encodeURIComponent(entityName)}/validation`,
          {
            method: "POST",
            headers: {
              ...buildHeaders(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "test",
              payload,
              rules,
              trigger,
            }),
          },
        );

        const body = (await res.json()) as {
          success: boolean;
          data?: ValidationTestResult;
        };
        return body.data ?? { valid: true, errors: [], warnings: [] };
      } catch {
        return {
          valid: false,
          errors: [
            {
              ruleId: "",
              ruleName: "",
              fieldPath: "",
              message: "Test request failed",
              severity: "error",
            },
          ],
          warnings: [],
        };
      }
    },
    [entityName],
  );

  return {
    ruleSet,
    rules: ruleSet?.rules ?? [],
    loading,
    error,
    etag,
    refresh: fetchRules,
    saveRules,
    testRules,
  };
}
