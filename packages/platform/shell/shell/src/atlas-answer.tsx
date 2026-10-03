"use client";

import * as React from "react";
import { useId } from "react";
import { useOptionalPermission } from "@athyper/platform-shell-app-foundation";
import {
  parseAtlasInsightResult,
  parseAtlasAnswerEnvelope,
  type AtlasGroundedAnswer,
  type AtlasAnswerAuthority,
  type AtlasAnswerEnvelope,
  type AtlasBusinessContextV1,
} from "@athyper/platform-ai-agent-ui";

/** A deliberately small Markdown subset. HTML, images and model URLs are inert text. */
export function AtlasSafeProse({ text }: { readonly text: string }) {
  const inline = (line: string) =>
    line
      .split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g)
      .map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("`") && part.endsWith("`") ? (
          <code key={i}>{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      );
  return (
    <div className="athyper-atlas-answer__prose">
      {text.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^[-*] /.test(line)))
          return (
            <ul key={i}>
              {lines.map((line, n) => (
                <li key={n}>{inline(line.slice(2))}</li>
              ))}
            </ul>
          );
        return <p key={i}>{inline(block)}</p>;
      })}
    </div>
  );
}

const assessmentInputLabels: Readonly<Record<string, string>> = {
  missingRole: "Supplier or customer role",
  missingOperatingOrganization: "Operating organization",
  missingCompany: "Company",
  missingOperation: "Transaction type (order, invoice or payment)",
  missingBusinessDate: "Business date",
};
function AtlasScopeGuidance({
  facts,
}: {
  readonly facts: Readonly<Record<string, unknown>>;
}) {
  const missing = Object.entries(assessmentInputLabels)
    .filter(([key]) => facts[key] === true)
    .map(([, label]) => label);
  return (
    <section
      aria-label="To check readiness or eligibility"
      className="athyper-atlas-answer"
    >
      <strong>To check readiness or eligibility</strong>
      {missing.length ? (
        <>
          <p>Select the assessment context:</p>
          <ul>
            {missing.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>Select the required assessment context.</p>
      )}
      <p>
        Select these in the record controls, apply the context, then ask for an
        assessment.
      </p>
    </section>
  );
}

function AtlasScopedAssessmentUnavailable() {
  return (
    <section
      aria-label="Organization/company assessment unavailable"
      className="athyper-atlas-answer"
    >
      <strong>Organization/company assessment unavailable</strong>
      <p>
        Shared partner information remains available. Readiness and eligibility
        have not been evaluated for the selected context.
      </p>
    </section>
  );
}

const entityName = (code: string) => code.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
/** The record route (mirrors entityRecordHref in the entity-runtime contract). */
function recordHref(entityCode: string, recordId: string): string | undefined {
  return /^[a-z][a-z0-9_]{0,62}$/.test(entityCode) && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(recordId)
    ? `/app/entity/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}`
    : undefined;
}

/** Sources as compact chips grouped by where they came from: one chip per record
 * (repeat citations merge into "N versions"), linking to it. Ids, revisions and
 * tools are for administrators only. */
type AtlasSourceItem = {
  readonly id: string;
  readonly key: string;
  readonly href?: string;
  readonly type: string;
  readonly label: string;
  readonly detail: string;
  readonly external?: boolean;
  readonly retrievedAt?: string;
};
/** One chip per source (repeat citations of a record merge into "N versions"),
 * numbered in reading order so statements can point at them. */
function mergeSources(evidence: readonly AtlasSourceItem[]) {
  const merged = new Map<string, { number: number; label: string; type: string; href?: string; external: boolean; retrievedAt?: string; ids: string[]; details: string[] }>();
  for (const source of evidence) {
    const entry = merged.get(source.key) ?? {
      number: merged.size + 1,
      label: source.label,
      type: source.type,
      href: source.href,
      external: source.external === true,
      retrievedAt: source.retrievedAt,
      ids: [],
      details: [],
    };
    entry.ids.push(source.id);
    entry.details.push(source.detail);
    merged.set(source.key, entry);
  }
  return [...merged.entries()].map(([key, value]) => ({ key, ...value }));
}

/** Statements with numbered markers for the sources behind each, so external
 * content is never silently blended with workspace data. */
function AtlasStatements({
  statements,
  evidence,
}: {
  readonly statements: readonly { readonly text: string; readonly evidenceIds: readonly string[] }[];
  readonly evidence: readonly AtlasSourceItem[];
}) {
  const sources = mergeSources(evidence);
  return (
    <div className="athyper-atlas-answer__prose">
      {statements.map((statement, index) => {
        const numbers = [...new Set(statement.evidenceIds.map((id) => sources.find((source) => source.ids.includes(id))?.number).filter((n): n is number => n !== undefined))];
        return (
          <p key={index}>
            {statement.text}
            {numbers.map((number) => (
              <sup key={number} className="athyper-atlas-answer__marker" data-external={sources[number - 1]?.external || undefined}>
                <span className="a-visually-hidden"> source </span>
                {number}
              </sup>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Sources as compact chips grouped by where they came from. Workspace records link
 * to the record; external sources show publisher and date, open in a new tab and
 * carry an External badge. Ids, revisions and tools are for administrators only. */
function AtlasSources({
  evidence,
  prefix,
  administrator,
}: {
  readonly evidence: readonly AtlasSourceItem[];
  readonly prefix: string;
  readonly administrator: boolean;
}) {
  const sources = mergeSources(evidence);
  const groups = [
    { label: "From this workspace", items: sources.filter((source) => !source.external) },
    { label: "From outside", items: sources.filter((source) => source.external) },
  ].filter((group) => group.items.length);
  const numbered = sources.length > 1;
  return (
    <div className="athyper-atlas-answer__sources" role="group" aria-label="Answer sources">
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <strong>{group.label}</strong>
          <ul>
            {group.items.map((source) => (
              <li key={source.key} data-external={source.external || undefined}>
                {source.href ? (
                  <a href={source.href} {...(source.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    {numbered ? <span className="athyper-atlas-answer__marker" aria-hidden="true">{source.number}</span> : null}
                    {source.label}
                  </a>
                ) : (
                  <span>{source.label}</span>
                )}
                <small>
                  {source.external ? <span className="athyper-atlas-answer__external">External</span> : null}
                  {source.type}
                  {source.external && source.retrievedAt ? ` · ${new Date(source.retrievedAt).toLocaleDateString()}` : ""}
                  {source.details.length > 1 ? ` · ${source.details.length} versions` : ""}
                </small>
                {administrator ? (
                  <details id={`${prefix}-source-${source.number}`}>
                    <summary>Details for administrators</summary>
                    {source.details.map((detail, n) => (
                      <p key={n}>{detail}</p>
                    ))}
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Both dock and fullscreen use the same trust boundary and source disclosure. */
export function AtlasValidatedAnswer({
  answer,
  envelope = answer.envelope,
  authority: suppliedAuthority,
  recordLabel,
  hideSummary = false,
}: {
  /** The answer's data is shown by a result view; keep only its sources. */
  readonly hideSummary?: boolean;
  readonly answer: AtlasGroundedAnswer;
  readonly recordLabel?: {
    readonly entityCode: string;
    readonly recordId: string;
    readonly label: string;
  };
  readonly envelope?: AtlasAnswerEnvelope;
  readonly authority?: AtlasAnswerAuthority;
}) {
  const prefix = useId();
  const administrator = useOptionalPermission("atlas.admin.manage");
  const sourceLabel = (source: { entityCode: string; recordId: string }) =>
    recordLabel?.entityCode === source.entityCode &&
    recordLabel.recordId === source.recordId
      ? recordLabel.label
      : `${source.entityCode.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} record`;
  const sources = [
    ...answer.citations.map((source, i) => ({
      id: `record:${i}`,
      key: `${source.entityCode}:${source.recordId}`,
      href: recordHref(source.entityCode, source.recordId),
      type: entityName(source.entityCode),
      label: sourceLabel(source),
      caption: `${source.entityCode.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} · ${source.toolCode === "entity_read_record" ? "Record summary" : "Saved record"}`,
      detail: `Record ID: ${source.recordId} · ${source.revision.startsWith("content-sha256:") ? "Version fingerprint" : "Revision"}: ${source.revision} · Tool: ${source.toolCode}`,
    })),
    ...(answer.externalCitations ?? []).map((source, i) => ({
      id: `external:${i}`,
      key: `external:${source.sourceId}`,
      href: source.url,
      type: source.publisher ?? new URL(source.url).hostname,
      label: source.title,
      caption: "External source",
      detail: `${source.url}${source.retrievedAt ? ` · retrieved ${source.retrievedAt}` : ""}`,
      external: true,
      retrievedAt: source.retrievedAt,
    })),
    ...answer.attachmentCitations.map((source, i) => ({
      id: `attachment:${i}`,
      key: `attachment:${source.attachmentId}`,
      href: undefined as string | undefined,
      type: "File",
      label: source.fileName,
      caption: "Verified attachment",
      detail: "Verified attachment",
    })),
  ];
  const authority = suppliedAuthority ?? {
    evidenceIds: sources.map((s) => s.id),
    actionIds: answer.actions
      .filter((a) => a.status === "proposed")
      .map((a) => a.proposalId),
  };
  let validated: AtlasAnswerEnvelope;
  try {
    validated = parseAtlasAnswerEnvelope(envelope, authority);
  } catch {
    return (
      <p role="status">
        This answer could not be verified. Ask Atlas to try again.
      </p>
    );
  }
  const insight = authority.insight;
  const evidence = [
    ...sources,
    ...(insight?.evidence.map((e) => ({
      id: e.id,
      key: `${e.entityCode}:${e.recordId}`,
      href: recordHref(e.entityCode, e.recordId),
      type: entityName(e.entityCode),
      label: sourceLabel(e),
      caption: "Record evidence",
      detail: `Record ID: ${e.recordId} · Revision ${e.sourceRevision} · Observed ${e.observedAt}`,
    })) ?? []),
  ].filter((e) => validated.evidenceIds.includes(e.id));
  return (
    <div className="athyper-atlas-answer" data-answer-kind={validated.kind}>
      {hideSummary ? null : validated.statements ? (
        <AtlasStatements statements={validated.statements} evidence={evidence} />
      ) : (
        <AtlasSafeProse text={validated.summary} />
      )}
      {validated.explanation && !hideSummary ? (
        <AtlasSafeProse text={validated.explanation} />
      ) : null}
      {insight &&
      !insight.findings.every((f) =>
        ["scope_required", "scoped_assessment_unavailable"].includes(f.code),
      ) ? (
        <p className="athyper-atlas-answer__coverage">
          {insight.scope.entityCode}
          {insight.scope.role ? ` · ${insight.scope.role}` : ""} ·{" "}
          {insight.coverage.target.replaceAll("_", " ")} ·{" "}
          {insight.coverage.state}
          {insight.coverage.evaluatedCount === undefined
            ? ""
            : ` · ${insight.coverage.evaluatedCount} evaluated`}
          {insight.coverage.authorizedTotalCount === undefined
            ? ""
            : ` of ${insight.coverage.authorizedTotalCount}`}{" "}
          · {insight.freshness} · Checked{" "}
          <time dateTime={insight.evaluatedAt}>{insight.evaluatedAt}</time>
        </p>
      ) : null}
      {insight?.findings.some((f) => f.code === "partner_comparison") ? (
        <table>
          <caption>Authorized partner comparison</caption>
          <thead>
            <tr>
              <th scope="col">Partner</th>
              <th scope="col">Lifecycle status</th>
              <th scope="col">Assessment</th>
              <th scope="col">Disclosed issues</th>
            </tr>
          </thead>
          <tbody>
            {insight.findings
              .filter(
                (f) =>
                  f.code === "partner_comparison" &&
                  validated.findingIds.includes(f.id),
              )
              .map((f) => (
                <tr key={f.id}>
                  <th scope="row">
                    {String(f.facts.display_name ?? f.facts.code ?? "Partner")}
                  </th>
                  <td>{String(f.facts.status ?? "Unavailable")}</td>
                  <td>
                    {f.facts.evaluated === true
                      ? "Complete assessment"
                      : "Partial or unavailable"}
                  </td>
                  <td>
                    {String(f.facts.disclosedIssueCount ?? "Unavailable")}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      ) : null}
      {insight?.findings
        .filter(
          (f) =>
            f.code !== "partner_comparison" &&
            validated.findingIds.includes(f.id),
        )
        .map((f) =>
          f.code === "list_coverage" ? (
            <section key={f.id} aria-label="List coverage">
              <strong>List coverage</strong>
              <p>
                {String(f.facts.examinedCount ?? 0)} partners examined;{" "}
                {String(f.facts.distinctPartnersWithFindings ?? 0)} distinct
                partners with disclosed findings.
              </p>
              <p>
                Issue counts overlap: a partner can have more than one issue.
              </p>
              {f.facts.narrowingRequired === true ? (
                <p>
                  Coverage is partial. Narrow the filters or select fewer
                  partners, and check the assessment context.
                </p>
              ) : null}
            </section>
          ) : f.code === "scope_required" && f.state === "not_evaluated" ? (
            <AtlasScopeGuidance key={f.id} facts={f.facts} />
          ) : f.code === "scoped_assessment_unavailable" &&
            f.state === "not_evaluated" ? (
            <AtlasScopedAssessmentUnavailable key={f.id} />
          ) : administrator ? (
            // A finding without a view is never shown as raw fields to people;
            // administrators see it so a view can be added.
            <details key={f.id} className="athyper-atlas-answer__about">
              <summary>Details for administrators · {f.code}</summary>
              <pre>{JSON.stringify(f.facts, null, 2)}</pre>
            </details>
          ) : null,
        )}
      {answer.insights?.map((owner, i) => (
        <AtlasOwnerAssessment key={i} value={owner} />
      ))}
      {validated.nextActionId ? (
        <p>Next step: Review the authorized action preview below.</p>
      ) : null}
      {evidence.length ? (
        <AtlasSources evidence={evidence} prefix={prefix} administrator={administrator} />
      ) : null}
    </div>
  );
}

export function atlasStarterQuestions(
  context?: AtlasBusinessContextV1,
): readonly string[] {
  if (!context) return ["What can you help me with in this workspace?"];
  if (context.kind === "manage")
    return context.analysisTarget === "selection" && context.selectedIds.length
      ? [
          "Compare my selected records using available evidence.",
          "What information is available about my selected records?",
        ]
      : [
          "What information is available about these filtered records?",
          "Summarize these filtered records and show the coverage.",
        ];
  if (context.asOf)
    return [
      "Summarize this historical record using available evidence.",
      "What does this historical view cover?",
    ];
  if (context.dirty)
    return [
      "Summarize the saved record, excluding my unsaved edits.",
      "Explain the saved information in this section.",
    ];
  if (context.caseId)
    return [
      "Explain this case using available evidence.",
      "What information is available about this record?",
    ];
  return [
    "Show this record summary",
    `Explain the saved information in ${context.section ?? "this record"}.`,
  ];
}

/** Replayed tool results have already passed server lineage authorization; still validate the wire shape. */
export function AtlasOwnerAssessment({ value }: { readonly value: unknown }) {
  try {
    const owner = parseAtlasInsightResult(value);
    if (
      owner.findings.length === 1 &&
      owner.findings[0]!.code === "scope_required" &&
      owner.findings[0]!.state === "not_evaluated"
    )
      return <AtlasScopeGuidance facts={owner.findings[0]!.facts} />;
    if (
      owner.findings.length === 1 &&
      owner.findings[0]!.code === "scoped_assessment_unavailable" &&
      owner.findings[0]!.state === "not_evaluated"
    )
      return <AtlasScopedAssessmentUnavailable />;
    return (
      <AtlasValidatedAnswer
        answer={{
          text: "",
          threadId: "",
          publicModelId: "",
          citations: [],
          attachmentCitations: [],
          actions: [],
        }}
        envelope={{
          schemaVersion: 1,
          kind:
            owner.coverage.state === "unavailable" ? "unavailable" : "brief",
          summary: "Authorized assessment",
          findingIds: owner.findings.map((f) => f.id),
          evidenceIds: owner.evidence.map((e) => e.id),
        }}
        authority={{ insight: owner, evidenceIds: [], actionIds: [] }}
      />
    );
  } catch {
    return (
      <p role="status">
        This assessment could not be verified. Ask Atlas to refresh it.
      </p>
    );
  }
}
