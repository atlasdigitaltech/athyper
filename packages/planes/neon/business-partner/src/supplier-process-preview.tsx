"use client";
import { useEffect, useState } from "react";
import {
  createOperation,
  encodePathSegment,
} from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
type Preview = {
  status: string;
  code?: string;
  selection?: {
    requestedRequirement: string;
    candidateProfile: { code: string };
    effectiveProfile: { code: string };
    winningRuleId: string;
    minimumControls: unknown[];
    policy: unknown;
  };
};
const operation = createOperation<Preview>({
  method: "GET",
  path: ({ caseId }) =>
    `/api/governance/process-selection/cases/${encodePathSegment(caseId)}/preview`,
});
export function SupplierProcessPreview({
  caseId,
  rowVersion,
  unsaved = false,
}: {
  caseId?: string;
  rowVersion?: number;
  unsaved?: boolean;
}) {
  const http = useApiClient(),
    [value, setValue] = useState<Preview>(),
    [error, setError] = useState(false);
  useEffect(() => {
    setValue(undefined);
    setError(false);
    if (!caseId || unsaved) return;
    const c = new AbortController();
    void http
      .request(operation, { params: { caseId }, signal: c.signal })
      .then(value => { if (!c.signal.aborted) setValue(value); })
      .catch(() => {
        if (!c.signal.aborted) setError(true);
      });
    return () => c.abort();
  }, [http, caseId, rowVersion, unsaved]);
  return (
    <section aria-label="Onboarding profile preview">
      <h3>Onboarding profile preview</h3>
      {!caseId || unsaved ? (
        <p>Save the draft to preview the profile for these changes.</p>
      ) : error ? (
        <p role="alert">
          Profile preview is unavailable. Refresh before submitting.
        </p>
      ) : value?.selection ? (
        <>
          <p>
            Requested: {value.selection.requestedRequirement} · Candidate:{" "}
            {value.selection.candidateProfile.code} · Effective:{" "}
            {value.selection.effectiveProfile.code}
          </p>
          <p>
            Submission validates and pins the selection. Corrections must retain
            the previously selected profile; to change it, close this request
            and create a new one.
          </p>
          <details>
            <summary>Selection explanation</summary>
            <pre>{JSON.stringify(value.selection, null, 2)}</pre>
          </details>
        </>
      ) : (
        <p role="status">
          {value
            ? `Preview ${value.status}: ${value.code ?? "Complete the requirement and scoped configuration."}`
            : "Loading profile preview…"}
        </p>
      )}
    </section>
  );
}
