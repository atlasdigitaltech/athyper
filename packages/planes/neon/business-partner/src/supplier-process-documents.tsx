"use client";
import { useEffect, useState } from "react";
import {
  createOperation,
  encodePathSegment,
} from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { Button } from "@athyper/platform-ui";
type DocumentJob = {
  id: string;
  purpose: string;
  attempt_id: string;
  status: string;
  gate_status: string;
  source_snapshot: unknown;
  template: unknown;
  result: unknown;
  required_before: string;
  canDownload: boolean;
  canRetry: boolean;
};
const documents = createOperation<DocumentJob[]>({
  method: "GET",
  path: ({ caseId }) =>
    `/api/governance/process-documents/cases/${encodePathSegment(caseId)}/view`,
});
const command = createOperation<{ url?: string }, Record<string, never>>({
  method: "POST",
  idempotency: "required",
  path: ({ jobId, action }) =>
    `/api/governance/process-documents/jobs/${encodePathSegment(jobId)}/${encodePathSegment(action)}`,
});
const purposes = {
  submitted_review_pack: "Submitted review pack",
  decision_document: "Decision document",
  activation_confirmation: "Activation confirmation",
};
export function SupplierProcessDocuments({
  caseId,
  rowVersion,
  pinnedJobId,
  pinnedAttemptId,
  onlyPinned = false,
}: {
  caseId: string;
  rowVersion: number;
  pinnedJobId?: string;
  pinnedAttemptId?: string;
  onlyPinned?: boolean;
}) {
  const http = useApiClient(),
    [jobs, setJobs] = useState<DocumentJob[]>(),
    [error, setError] = useState<string>(),
    [busy, setBusy] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    setJobs(undefined);
    setError(undefined);
    void http
      .request(documents, { params: { caseId }, signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setJobs(value); })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Documents could not be loaded. Refresh to try again.");
      });
    return () => controller.abort();
  }, [http, caseId, rowVersion]);
  async function act(job: DocumentJob, action: "download" | "retry") {
    setBusy(job.id);
    setError(undefined);
    try {
      const result = await http.request(command, {
        params: { jobId: job.id, action },
        body: {},
        idempotencyKey: crypto.randomUUID(),
      });
      if (action === "download") {
        if (!result.url)
          throw new Error("The download service did not return a link.");
        const url = new URL(result.url, window.location.origin);
        if (!["https:", "http:"].includes(url.protocol))
          throw new Error("The download link is invalid.");
        const link = document.createElement("a");
        link.href = url.toString();
        link.rel = "noopener noreferrer";
        link.target = "_blank";
        link.click();
      } else setJobs(await http.request(documents, { params: { caseId } }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The document action failed. Refresh and try again.",
      );
    } finally {
      setBusy(undefined);
    }
  }
  const visibleJobs = jobs?.filter(
    (j) =>
      !onlyPinned ||
      (j.id === pinnedJobId &&
        (!pinnedAttemptId || j.attempt_id === pinnedAttemptId)),
  );
  return (
    <section className="bp-journey-panel bp-document-panel" aria-label="Generated documents">
      <h3>Generated documents</h3>
      {error ? <p role="alert">{error}</p> : null}
      {!jobs && !error ? <p role="status">Loading documents…</p> : null}
      {pinnedJobId &&
      jobs &&
      !visibleJobs?.some((j) => j.id === pinnedJobId) ? (
        <p role="alert">
          The document linked by this notice is unavailable. No replacement
          document has been selected.
        </p>
      ) : null}
      {Object.entries(purposes).map(([purpose, label]) => (
        <section className="bp-document-purpose" key={purpose}>
          <h4>{label}</h4>
          {visibleJobs
            ?.filter((j) => j.purpose === purpose)
            .map((job) => (
              <div key={job.id} data-document-job={job.id}>
                <p>
                  {job.id === pinnedJobId ? "Linked document · " : ""}
                  {job.status} · Gate: {job.gate_status}
                </p>
                {job.status !== "ready" ? (
                  <p>
                    Required before {job.required_before.replaceAll("_", " ")}.
                    The document service owns generation; this gate remains
                    waiting until the document is ready.
                  </p>
                ) : null}
                {job.canDownload ? (
                  <Button
                    disabled={Boolean(busy)}
                    onClick={() => void act(job, "download")}
                  >
                    Download {label.toLowerCase()}
                  </Button>
                ) : null}
                {job.canRetry && !onlyPinned ? (
                  <Button
                    disabled={Boolean(busy)}
                    onClick={() => void act(job, "retry")}
                  >
                    Retry {label.toLowerCase()}
                  </Button>
                ) : null}
                {job.status === "failed" && !job.canRetry ? (
                  <p>
                    An authorized request owner must resolve this document
                    failure.
                  </p>
                ) : null}
                <details>
                  <summary>Document provenance</summary>
                  <pre>
                    {JSON.stringify(
                      {
                        jobId: job.id,
                        attemptId: job.attempt_id,
                        sourceSnapshot: job.source_snapshot,
                        template: job.template,
                        result: job.result,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </div>
            ))}
          {jobs && !visibleJobs?.some((j) => j.purpose === purpose) ? (
            <p>Not generated yet.</p>
          ) : null}
        </section>
      ))}
    </section>
  );
}
