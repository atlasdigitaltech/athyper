"use client";
import { useEffect, useState } from "react";
import {
  createOperation,
  encodePathSegment,
} from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { Button } from "@athyper/platform-ui";
type Readiness = {
  ready: boolean;
  reasons?: string[];
  evidence: {
    runVersion: number;
    runStatus?: string;
    canComplete?: boolean;
    completion?: {
      gates?: {
        code: string;
        status: string;
        owner: string;
        action: string | null;
        evidence: unknown;
      }[];
    };
  };
};
const read = createOperation<Readiness>({
  method: "GET",
  path: ({ runId }) =>
    `/api/governance/supplier-onboarding/runs/${encodePathSegment(runId)}/readiness`,
});
const complete = createOperation<
  unknown,
  { expectedVersion: number; idempotencyKey: string }
>({
  method: "POST",
  path: ({ runId }) =>
    `/api/governance/supplier-onboarding/runs/${encodePathSegment(runId)}/completion`,
  idempotency: "required",
});
export function SupplierProcessReadiness({
  runId,
  onChanged,
}: {
  runId: string;
  onChanged: () => Promise<void>;
}) {
  const http = useApiClient(),
    [value, setValue] = useState<Readiness>(),
    [error, setError] = useState<string>(),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    void http
      .request(read, { params: { runId }, signal: c.signal })
      .then(value => { if (!c.signal.aborted) setValue(value); })
      .catch(() => {
        if (!c.signal.aborted)
          setError(
            "Completion readiness is unavailable. Refresh to try again.",
          );
      });
    return () => c.abort();
  }, [http, runId]);
  async function refresh() {
    setBusy(true);
    setError(undefined);
    try {
      setValue(await http.request(read, { params: { runId } }));
    } catch {
      setError("Completion readiness could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    if (!value?.evidence.canComplete) return;
    setBusy(true);
    setError(undefined);
    try {
      const idempotencyKey = crypto.randomUUID();
      await http.request(complete, {
        params: { runId },
        body: { expectedVersion: value.evidence.runVersion, idempotencyKey },
        idempotencyKey,
      });
      await onChanged();
      setValue(await http.request(read, { params: { runId } }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Closure failed. Refresh readiness before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bp-journey-panel">
      <h3>Readiness and closure</h3>
      {error ? <p role="alert">{error}</p> : null}
      {value ? (
        <>
          <p>
            Onboarding: {value.evidence.runStatus ?? "Status unavailable"} ·{" "}
            {value.ready
              ? "Completion gates satisfied"
              : "Completion gates pending"}
          </p>
          <ul>
            {value.evidence.completion?.gates?.map((g) => (
              <li key={g.code}>
                {g.code.replaceAll("_", " ")} · {g.status} · Owner: {g.owner}
                {g.action ? ` · Next: ${g.action.replaceAll("_", " ")}` : ""}
                <details>
                  <summary>Gate evidence</summary>
                  <pre>{JSON.stringify(g.evidence, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
          {value.evidence.canComplete ? (
            <Button disabled={busy} onClick={() => void close()}>
              Close completed onboarding
            </Button>
          ) : null}
        </>
      ) : null}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Refresh readiness
      </Button>
    </section>
  );
}
