/**
 * useSubmitPreflight — read the pre-submit blocker/warning list for a record.
 *
 * Fetches via runtimePath.submitPreflight(entityCode, id) (BFF catchall →
 * records router). Backend currently only has real checks for
 * `purchase_invoice`; other entities return `{ ok: true, blockers: [],
 * warnings: [] }` so the hook is safe to mount conditionally without
 * shimming a stub.
 *
 * Re-fetch policy: short staleTime (30s) so the panel reflects fresh state
 * shortly after the user fixes a blocker, without spamming the endpoint on
 * every render. Callers that just saved the record should `refetch()` to
 * pull a fresh view immediately.
 */
import { useQuery } from "@tanstack/react-query";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";

export interface SubmitPreflightIssue {
  code:     string;
  message:  string;
  section?: string;
  details?: Record<string, unknown>;
}

export interface SubmitPreflightResult {
  ok:       boolean;
  blockers: SubmitPreflightIssue[];
  warnings: SubmitPreflightIssue[];
}

const EMPTY_RESULT: SubmitPreflightResult = { ok: true, blockers: [], warnings: [] };

async function fetchSubmitPreflight(entityCode: string, recordId: string): Promise<SubmitPreflightResult> {
  const res = await fetch(runtimePath.submitPreflight(entityCode, recordId));
  if (!res.ok) {
    // Don't block the user on a broken preflight — fall back to "no issues".
    // The real submit handler runs the same checks; preflight is advisory.
    return EMPTY_RESULT;
  }
  const json = await res.json() as unknown;
  if (!isPreflightShape(json)) return EMPTY_RESULT;
  return json;
}

function isPreflightShape(value: unknown): value is SubmitPreflightResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v["ok"] === "boolean"
      && Array.isArray(v["blockers"])
      && Array.isArray(v["warnings"]);
}

export function useSubmitPreflight(entityCode: string, recordId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["submit-preflight", entityCode, recordId] as const,
    queryFn:  () => fetchSubmitPreflight(entityCode, recordId!),
    enabled:  Boolean(recordId) && (options?.enabled ?? true),
    staleTime: 30 * 1000,
  });
}
