"use client";
import { businessLabel } from "./360/display-values";

import { validationMessage, validationNotApplicable } from "./validation-messages";
import { Badge, Card } from "@athyper/platform-ui";
import type { PartnerRequest, RequestView, ValidationFinding } from "./client";

const editableTargets = Object.freeze({
  "$.legalName": "bp-edit-legal-name",
  "$.registrationCountryCode": "bp-edit-country",
} as const);

export function validationTarget(fieldPath: string): string | undefined {
  return editableTargets[fieldPath as keyof typeof editableTargets];
}

export function ValidationEvidence({ view }: { readonly view: RequestView }) {
  const findings = view.validationFindings;
  const failed = findings.filter(f => f.outcome === "failed");
  const passed = findings.filter(f => f.outcome === "passed");
  const skipped = findings.filter(f => f.outcome === "skipped");
  const notApplicable = skipped.filter(validationNotApplicable);
  const notChecked = skipped.filter(f => !validationNotApplicable(f));
  const errors = failed.filter(f => f.severity === "error").length;
  const evidence = view.validationRun;
  const ruleset = record(view.request.validationSummary?.ruleset);
  const stale = evidence?.stale === true;
  const checked = findings.length > 0 || Boolean(view.request.validationSummary?.outcome);
  const editable = view.case.allowedActions?.some(action => action.id === "edit");
  const list = (items: readonly ValidationFinding[]) => <ul className="bp-findings">{items.map(f => <li key={`${f.ruleCode}:${f.fieldPath}`}>
    <Badge tone={f.outcome === "skipped" ? "neutral" : f.outcome === "passed" ? "success" : f.severity === "error" ? "danger" : "warning"}>{f.outcome === "skipped" ? validationNotApplicable(f) ? "Not applicable" : "Not checked" : f.outcome === "passed" ? "Passed" : f.severity === "error" ? "Needs correction" : "Review"}</Badge>
    <div><strong>{validationMessage(f, view.request)}</strong>{f.outcome === "failed" && editable ? <a href={`/mdg/business-partner/requests/${encodeURIComponent(view.case.id)}/edit`}>Edit request</a> : null}</div>
  </li>)}</ul>;
  return <Card className="bp-section bp-validation">
    <h2>Validation checks</h2>
    <p role="status"><strong>{stale ? "Outdated—validate again" : !checked ? "Not checked" : errors || view.request.validationSummary?.outcome === "failed" ? "Validation needs attention" : failed.length ? "Validation completed with warnings" : "Validation passed"}</strong></p>
    {findings.length ? <p>{passed.length} checks passed · {notApplicable.length} not applicable{notChecked.length ? ` · ${notChecked.length} not checked` : ""} · {failed.length ? `${errors} errors · ${failed.length-errors} warnings` : "No issues found"}</p> : <p>{checked ? "Individual check results are unavailable." : "Validate the request to check for missing or inconsistent information."}</p>}
    {evidence ? <p className="bp-context-note">Checked {new Date(evidence.evaluatedAt).toLocaleString()} · Request revision {evidence.requestVersion}</p> : null}
    {stale ? <p>The request has changed since these checks. These are the previous results.</p> : null}
    {failed.length ? <details open><summary>Needs attention ({failed.length})</summary>{list(failed)}</details> : null}
    {passed.length ? <details><summary>Passed checks ({passed.length})</summary>{list(passed)}</details> : null}
    {notApplicable.length ? <details><summary>Not applicable ({notApplicable.length})</summary>{list(notApplicable)}</details> : null}
    {notChecked.length ? <details><summary>Not checked ({notChecked.length})</summary>{list(notChecked)}</details> : null}
    {checked ? <details className="bp-request-technical"><summary>Technical details</summary>{typeof ruleset.code === "string" ? <p>Ruleset: {ruleset.code} · Version {String(ruleset.version ?? "—")}</p> : null}{evidence ? <p>Evaluation: {evidence.evaluationId} · Snapshot: {evidence.snapshotId}</p> : null}<ul>{findings.map(f => <li key={`${f.ruleCode}:${f.fieldPath}`}>{f.ruleCode} · {f.messageCode} · {f.fieldPath} · {f.outcome}</li>)}</ul></details> : null}
  </Card>;
}

export function DuplicateEvidence({
  request,
}: {
  readonly request: PartnerRequest;
}) {
  const summary = request.duplicateSummary;
  const candidates = Array.isArray(summary["candidates"])
    ? summary["candidates"]
    : [];
  return (
    <Card className="bp-section">
      <h2>Duplicate review</h2>
      <dl className="bp-definition">
        <div>
          <dt>Method</dt>
          <dd>Exact legal-name match (case-insensitive)</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>NEON Business Partner master · legal name or registered name</dd>
        </div>
        <div>
          <dt>Candidate count</dt>
          <dd>{number(summary["exactLegalNameCandidateCount"])}</dd>
        </div>
      </dl>
      <p className="bp-context-note">
        This deterministic check does not calculate or imply a similarity score.
      </p>
      {candidates.length ? (
        <ul className="bp-duplicate-candidates">
          {candidates.map((candidate, index) => {
            const item = record(candidate);
            return (
              <li key={String(item["id"] ?? index)}>
                <strong>
                  {String(item["name"] ?? "Restricted candidate")}
                </strong>
                {item["code"] ? <span>{String(item["code"])}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p>No exact legal-name candidates were found.</p>
      )}
    </Card>
  );
}

function display(value: string): string { return businessLabel(value, "title"); }

function number(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}
