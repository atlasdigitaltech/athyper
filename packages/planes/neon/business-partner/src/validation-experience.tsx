"use client";

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
  const editPath = `/mdg/business-partner/requests/${encodeURIComponent(view.case.id)}/edit`;
  return (
    <Card className="bp-section">
      <h2>Latest validation evidence</h2>
      {view.validationFindings.length ? (
        <ul className="bp-findings">
          {view.validationFindings.map((finding) => (
            <ValidationFindingItem
              key={`${finding.ruleCode}:${finding.fieldPath}`}
              finding={finding}
              editPath={editPath}
            />
          ))}
        </ul>
      ) : (
        <p>No validation run has been recorded.</p>
      )}
    </Card>
  );
}

function ValidationFindingItem({
  finding,
  editPath,
}: {
  readonly finding: ValidationFinding;
  readonly editPath: string;
}) {
  const target =
    finding.outcome === "failed" && finding.severity === "error"
      ? validationTarget(finding.fieldPath)
      : undefined;
  return (
    <li>
      <Badge
        tone={
          finding.outcome === "failed"
            ? "danger"
            : finding.severity === "warning"
              ? "warning"
              : "success"
        }
      >
        {display(finding.outcome)}
      </Badge>
      <div>
        <strong>{display(finding.ruleCode)}</strong>
        <span>
          {finding.messageCode} · {finding.fieldPath}
        </span>
        {target ? (
          <a className="bp-finding-link" href={`${editPath}#${target}`}>
            Fix this field
          </a>
        ) : null}
      </div>
    </li>
  );
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

function display(value: string) {
  return value
    .replaceAll(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function number(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}
