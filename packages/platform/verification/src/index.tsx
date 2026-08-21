"use client";

import { ApiTransportError, verificationFunctionalRunOperation, verificationSnapshotOperation, type PlatformVerificationRun, type VerificationCheckResult, type VerificationPlane } from "@athyper/platform-api-client";
import { useApiClient, useSessionIdentity } from "@athyper/platform-shell-app-foundation";
import { useCallback, useEffect, useMemo, useState } from "react";

export function SystemVerificationPage({ plane }: { readonly plane: VerificationPlane }) {
  const client = useApiClient();
  const identity = useSessionIdentity();
  const [run, setRun] = useState<PlatformVerificationRun>();
  const [state, setState] = useState<"loading" | "running" | "ready" | "error">("loading");
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    setState("loading"); setError(undefined);
    try { setRun(await client.request(verificationSnapshotOperation)); setState("ready"); }
    catch (cause) { setError(message(cause)); setState("error"); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  const functional = useCallback(async () => {
    setState("running"); setError(undefined);
    try { setRun(await client.request(verificationFunctionalRunOperation, { body: { mode: "functional" }, idempotencyKey: `verification:${plane}:${crypto.randomUUID()}`, timeoutMs: 120_000 })); setState("ready"); }
    catch (cause) { setError(message(cause)); setState("error"); }
  }, [client, plane]);
  const categories = useMemo(() => group(run?.checks ?? []), [run]);
  const copy = useCallback(async () => { if (!run) return; await navigator.clipboard.writeText(JSON.stringify(run, null, 2)); setCopied(true); window.setTimeout(() => setCopied(false), 2_000); }, [run]);
  return <section className="verification" aria-labelledby="verification-title">
    <header className="verification__hero">
      <div><p className="verification__eyebrow">{plane === "studio" ? "Platform operations" : `${title(plane)} system`}</p><h1 id="verification-title">System verification</h1><p>Authenticated checks exercise application adapters without exposing container endpoints or credentials.</p></div>
      <div className="verification__actions"><button type="button" className="verification__button verification__button--secondary" onClick={() => void load()} disabled={state === "loading" || state === "running"}>Quick check</button><button type="button" className="verification__button" onClick={() => void functional()} disabled={state === "loading" || state === "running"}>{state === "running" ? "Running functional checks…" : "Run functional check"}</button></div>
    </header>
    <div className="verification__context" aria-label="Verification context"><span>Plane <strong>{plane}</strong></span><span>Scope <strong>{plane === "studio" ? "all planes" : plane}</strong></span><span>Session <strong>{identity.state}</strong></span>{identity.scope ? <span>Auth epoch <strong>{identity.scope.authEpoch}</strong></span> : null}</div>
    {state === "loading" && !run ? <div className="verification__notice" role="status">Running the read-only verification snapshot…</div> : null}
    {error ? <div className="verification__notice verification__notice--error" role="alert"><strong>Verification unavailable</strong><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div> : null}
    {run ? <>
      <section className={`verification__summary verification__summary--${run.status}`} aria-label="Run summary">
        <div><span className="verification__status-dot" aria-hidden="true"/><strong>{run.status === "passed" ? "Verification passed" : "Verification needs attention"}</strong><small>{run.mode} run · {new Date(run.completedAt).toLocaleString()}</small></div>
        <dl><div><dt>Passed</dt><dd>{run.summary.passed}</dd></div><div><dt>Failed</dt><dd>{run.summary.failed}</dd></div><div><dt>Skipped</dt><dd>{run.summary.skipped}</dd></div></dl>
      </section>
      <div className="verification__evidence"><div><span>Run ID</span><code>{run.runId}</code></div><div><span>Log query</span><code>{run.evidence.logQuery}</code></div><div className="verification__evidence-actions"><button type="button" onClick={() => void copy()}>{copied ? "Copied" : "Copy report"}</button>{run.evidence.grafanaExploreUrl ? <a href={run.evidence.grafanaExploreUrl} target="_blank" rel="noreferrer">Open Grafana Explore</a> : null}</div></div>
      <div className="verification__groups">{categories.map(([category, checks]) => <section className="verification__group" key={category}><h2>{categoryLabel(category)} <span>{checks.length}</span></h2><ul>{checks.map((check) => <Check key={check.id} value={check}/>)}</ul></section>)}</div>
    </> : null}
  </section>;
}

function Check({ value }: { readonly value: VerificationCheckResult }) { return <li className={`verification__check verification__check--${value.status}`}><span className="verification__check-icon" aria-label={value.status}>{value.status === "passed" ? "✓" : value.status === "failed" ? "!" : "–"}</span><div><strong>{value.label}</strong><p>{value.detail}</p><small>{value.durationMs} ms{value.cleanup && value.cleanup !== "not-required" ? ` · cleanup ${value.cleanup}` : ""}</small></div></li>; }
function group(checks: readonly VerificationCheckResult[]) { const result = new Map<string, VerificationCheckResult[]>(); for (const check of checks) result.set(check.category, [...(result.get(check.category) ?? []), check]); return [...result.entries()]; }
function categoryLabel(value: string): string { return value === "runtime" ? "Worker and scheduler" : value === "document" ? "Document pipeline" : title(value); }
function title(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function message(cause: unknown): string { if (cause instanceof ApiTransportError) { if (cause.status === 404) return "System verification is disabled for this environment."; if (cause.status === 429) return `Wait ${cause.retryAfter ?? "a few seconds"} before running it again.`; return `${cause.message}${cause.requestId ? ` Support reference: ${cause.requestId}.` : ""}`; } return "The verification request could not be completed."; }
