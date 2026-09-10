"use client";

import * as React from "react";
import { useId } from "react";
import { parseAtlasInsightResult, parseAtlasAnswerEnvelope, type AtlasGroundedAnswer, type AtlasAnswerAuthority, type AtlasAnswerEnvelope, type AtlasBusinessContextV1 } from "@athyper/platform-ai-agent-ui";

/** A deliberately small Markdown subset. HTML, images and model URLs are inert text. */
export function AtlasSafeProse({ text }: { readonly text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> :
      part.startsWith("`") && part.endsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part);
  return <div className="athyper-atlas-answer__prose">{text.split(/\n\s*\n/).map((block, i) => {
    const lines = block.split("\n");
    if (lines.every(line => /^[-*] /.test(line))) return <ul key={i}>{lines.map((line, n) => <li key={n}>{inline(line.slice(2))}</li>)}</ul>;
    return <p key={i}>{inline(block)}</p>;
  })}</div>;
}


const assessmentInputLabels: Readonly<Record<string, string>> = {
  missingRole: "Supplier or customer role",
  missingOperatingOrganization: "Operating organization",
  missingCompany: "Company",
  missingOperation: "Transaction type (order, invoice or payment)",
  missingBusinessDate: "Business date",
};
function AtlasScopeGuidance({ facts }: { readonly facts: Readonly<Record<string, unknown>> }) {
  const missing = Object.entries(assessmentInputLabels).filter(([key]) => facts[key] === true).map(([, label]) => label);
  return <section aria-label="To check readiness or eligibility" className="athyper-atlas-answer">
    <strong>To check readiness or eligibility</strong>
    {missing.length ? <><p>Select the assessment context:</p><ul>{missing.map(label => <li key={label}>{label}</li>)}</ul></> : <p>Select the required assessment context.</p>}
    <p>Select these in the record controls, apply the context, then ask for an assessment.</p>
  </section>;
}

function AtlasScopedAssessmentUnavailable() {
  return <section aria-label="Organization/company assessment unavailable" className="athyper-atlas-answer">
    <strong>Organization/company assessment unavailable</strong>
    <p>Shared partner information remains available. Readiness and eligibility have not been evaluated for the selected context.</p>
  </section>;
}

/** Both dock and fullscreen use the same trust boundary and source disclosure. */
export function AtlasValidatedAnswer({ answer, envelope = answer.envelope, authority: suppliedAuthority }: {
  readonly answer: AtlasGroundedAnswer;
  readonly envelope?: AtlasAnswerEnvelope;
  readonly authority?: AtlasAnswerAuthority;
}) {
  const prefix = useId();
  const sources = [...answer.citations.map((source, i) => ({ id: `record:${i}`, label: `${source.entityCode} · ${source.recordId}`, detail: `Revision ${source.revision} · ${source.toolCode}` })),
    ...answer.attachmentCitations.map((source, i) => ({ id: `attachment:${i}`, label: source.fileName, detail: "Verified attachment" }))];
  const authority = suppliedAuthority ?? { evidenceIds: sources.map(s => s.id), actionIds: answer.actions.filter(a => a.status === "proposed").map(a => a.proposalId) };
  let validated: AtlasAnswerEnvelope;
  try {
    validated = parseAtlasAnswerEnvelope(envelope, authority);
  } catch {
    return <p role="status">This answer could not be verified. Ask Atlas to try again.</p>;
  }
  const insight = authority.insight;
  const evidence = [...sources, ...(insight?.evidence.map(e => ({ id: e.id, label: `${e.entityCode} · ${e.recordId}`, detail: `Revision ${e.sourceRevision} · Observed ${e.observedAt}` })) ?? [])].filter(e => validated.evidenceIds.includes(e.id));
  return <div className="athyper-atlas-answer" data-answer-kind={validated.kind}>
    <AtlasSafeProse text={validated.summary}/>
    {validated.explanation ? <AtlasSafeProse text={validated.explanation}/> : null}
    {insight && !insight.findings.every(f => ["scope_required", "scoped_assessment_unavailable"].includes(f.code)) ? <p className="athyper-atlas-answer__coverage">{insight.scope.entityCode}{insight.scope.role ? ` · ${insight.scope.role}` : ""} · {insight.coverage.target.replaceAll("_", " ")} · {insight.coverage.state}{insight.coverage.evaluatedCount === undefined ? "" : ` · ${insight.coverage.evaluatedCount} evaluated`}{insight.coverage.authorizedTotalCount === undefined ? "" : ` of ${insight.coverage.authorizedTotalCount}`} · {insight.freshness} · Checked <time dateTime={insight.evaluatedAt}>{insight.evaluatedAt}</time></p> : null}
    {insight?.findings.some(f => f.code === "partner_comparison") ? <table><caption>Authorized partner comparison</caption><thead><tr><th scope="col">Partner</th><th scope="col">Lifecycle status</th><th scope="col">Assessment</th><th scope="col">Disclosed issues</th></tr></thead><tbody>{insight.findings.filter(f => f.code === "partner_comparison" && validated.findingIds.includes(f.id)).map(f => <tr key={f.id}><th scope="row">{String(f.facts.display_name ?? f.facts.code ?? "Partner")}</th><td>{String(f.facts.status ?? "Unavailable")}</td><td>{f.facts.evaluated === true ? "Complete assessment" : "Partial or unavailable"}</td><td>{String(f.facts.disclosedIssueCount ?? "Unavailable")}</td></tr>)}</tbody></table> : null}
    {insight?.findings.filter(f => f.code !== "partner_comparison" && validated.findingIds.includes(f.id)).map(f => f.code === "list_coverage" ? <section key={f.id} aria-label="List coverage"><strong>List coverage</strong><p>{String(f.facts.examinedCount ?? 0)} partners examined; {String(f.facts.distinctPartnersWithFindings ?? 0)} distinct partners with disclosed findings.</p><p>Issue counts overlap: a partner can have more than one issue.</p>{f.facts.narrowingRequired === true ? <p>Coverage is partial. Narrow the filters or select fewer partners, and check the assessment context.</p> : null}</section> : f.code === "scope_required" && f.state === "not_evaluated" ? <AtlasScopeGuidance key={f.id} facts={f.facts}/> : f.code === "scoped_assessment_unavailable" && f.state === "not_evaluated" ? <AtlasScopedAssessmentUnavailable key={f.id}/> : <section key={f.id} aria-label={f.code}><strong>{f.code}</strong><p>{f.severity} · {f.state.replaceAll("_", " ")}</p><dl>{Object.entries(f.facts).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value === null ? "Unavailable" : String(value)}</dd></div>)}</dl></section>)}
    {answer.insights?.map((owner, i) => <AtlasOwnerAssessment key={i} value={owner}/>)}
    {validated.nextActionId ? <p>Next step: Review the authorized action preview below.</p> : null}
    {evidence.length ? <div role="group" aria-label="Answer sources"><strong>Sources</strong><ol>{evidence.map((source, i) => <li key={source.id}><a href={`#${prefix}-source-${i}`} onClick={event => { event.preventDefault(); const target = document.getElementById(`${prefix}-source-${i}`); if (target instanceof HTMLDetailsElement) { target.open = true; target.querySelector("summary")?.focus(); target.scrollIntoView?.({ block: "nearest" }); } }}>{source.label}</a><details id={`${prefix}-source-${i}`}><summary>Source details: {source.label}</summary><p>{source.detail}</p></details></li>)}</ol></div> : null}
  </div>;
}

export function atlasStarterQuestions(context?: AtlasBusinessContextV1): readonly string[] {
  if (!context) return ["What can you help me with on this page?"];
  if (context.kind === "manage" && context.entityCode !== "business_partner") return ["What can you help me with for these records?"];
  if (context.kind === "manage") return context.analysisTarget === "selection" && context.selectedIds.length
    ? ["Compare my selected business partners.", "Which selected partners need attention?"]
    : ["Which partners in these filtered results need attention?", "Summarize these filtered partners and show the coverage."];
  if (context.asOf) return ["Summarize this historical record using available evidence.", "What does this historical view cover?"];
  if (context.dirty) return ["Summarize the saved record, excluding my unsaved edits.", "Explain the saved information in this section."];
  if (context.caseId) return ["Explain this case using available evidence.", "What information is available about this record?"];
  return [context.entityCode === "business_partner" ? "Summarize this business partner." : "Show this record summary", `Explain the saved information in ${context.section ?? "this record"}.`];
}

/** Replayed tool results have already passed server lineage authorization; still validate the wire shape. */
export function AtlasOwnerAssessment({ value }: { readonly value: unknown }) {
  try {
    const owner = parseAtlasInsightResult(value);
    if (owner.findings.length === 1 && owner.findings[0]!.code === "scope_required" && owner.findings[0]!.state === "not_evaluated") return <AtlasScopeGuidance facts={owner.findings[0]!.facts}/>;
    if (owner.findings.length === 1 && owner.findings[0]!.code === "scoped_assessment_unavailable" && owner.findings[0]!.state === "not_evaluated") return <AtlasScopedAssessmentUnavailable/>;
    return <AtlasValidatedAnswer answer={{ text: "", threadId: "", publicModelId: "", citations: [], attachmentCitations: [], actions: [] }} envelope={{ schemaVersion: 1, kind: owner.coverage.state === "unavailable" ? "unavailable" : "brief", summary: "Authorized assessment", findingIds: owner.findings.map(f => f.id), evidenceIds: owner.evidence.map(e => e.id) }} authority={{ insight: owner, evidenceIds: [], actionIds: [] }}/>;
  } catch {
    return <p role="status">This assessment could not be verified. Ask Atlas to refresh it.</p>;
  }
}
