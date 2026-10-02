"use client";
import * as React from "react";
import { useState } from "react";
import type {
  useAtlasAnswer,
  AtlasExperienceAgent,
} from "@athyper/platform-ai-agent-ui";
import { ChoiceSelect } from "@athyper/platform-ui";
import { useOptionalPermission } from "@athyper/platform-shell-app-foundation";

/** The full-view context panel, in the person's terms: what Atlas can see, where
 * an answer came from, and what to ask here. Configuration detail is for
 * Atlas administrators only. */
export function AtlasContextInspector({
  atlas,
  recordLabel,
  entityLabel,
  sectionLabel,
  recordHref,
  agent,
  id,
  suggestions = [],
  onSuggest,
}: {
  readonly atlas: ReturnType<typeof useAtlasAnswer>;
  readonly recordLabel?: string;
  readonly entityLabel: string;
  readonly sectionLabel?: string;
  readonly recordHref?: string;
  readonly agent?: AtlasExperienceAgent;
  readonly id: string;
  /** Questions that fit this page; choosing one fills the composer. */
  readonly suggestions?: readonly string[];
  readonly onSuggest?: (prompt: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const administrator = useOptionalPermission("atlas.admin.manage");
  const answers = atlas.messages.filter(
    (message) => message.role === "assistant" && message.status === "completed",
  );
  const selected =
    answers.find((message) => message.messageId === selectedId) ??
    answers.at(-1);
  const answer = selected?.answer;
  const page = atlas.businessContext;
  const record = page?.kind === "record";
  const work = record ? page.workContext : undefined;
  const safeHref =
    recordHref?.startsWith("/") &&
    !recordHref.startsWith("//") &&
    !recordHref.includes("\\")
      ? recordHref
      : undefined;
  const sourceName = (entityCode: string, recordId: string) =>
    record && page.recordId === recordId && page.entityCode === entityCode && recordLabel
      ? recordLabel
      : `${entityCode.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} record`;
  return (
    <aside
      id={id}
      className="athyper-atlas-workspace__inspector"
      aria-label="Atlas context"
    >
      <section>
        <header>
          <strong>What Atlas can see</strong>
          <small>Used for your next question</small>
        </header>
        {record ? (
          <div className="athyper-atlas-inspector__focus">
            <span className="athyper-atlas-inspector__record">{recordLabel ?? entityLabel}</span>
            <small>
              {entityLabel}
              {sectionLabel ? ` · ${sectionLabel}` : ""}
            </small>
            {safeHref ? <a href={safeHref}>Open record</a> : null}
          </div>
        ) : (
          <div className="athyper-atlas-inspector__focus">
            <span className="athyper-atlas-inspector__record">This workspace</span>
            <small>Open a record to ask about it specifically.</small>
          </div>
        )}
        {record && page.dirty ? <p>Unsaved changes are not included; Atlas uses the saved record.</p> : null}
        {record && page.asOf ? <p>You are viewing history as of {page.asOf}.</p> : null}
        <p className="athyper-atlas-inspector__note">Atlas only uses what you can open.</p>
      </section>
      {record && page.entityCode === "business_partner" ? (
        <section>
          <header>
            <strong>Working for</strong>
            <small>Applies when a question needs it</small>
          </header>
          <dl>
            <div>
              <dt>Organization</dt>
              <dd>{work?.operatingOrganizationId ? "Selected on the record" : "Not selected"}</dd>
            </div>
            <div>
              <dt>Company</dt>
              <dd>{work?.companyCodeId ? "Selected on the record" : "Not selected"}</dd>
            </div>
          </dl>
        </section>
      ) : null}
      {selected ? (
        <section>
          <header>
            <strong>Where this answer came from</strong>
          </header>
          {answers.length > 1 ? (
            <div className="athyper-atlas-inspector__answer-picker">
              <ChoiceSelect
                label="Answer"
                value={selected.messageId}
                options={answers.map((message, index) => ({
                  value: message.messageId,
                  label: `Answer ${index + 1} · ${new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`,
                }))}
                onChange={setSelectedId}
              />
            </div>
          ) : null}
          {answer && (answer.citations.length || answer.attachmentCitations.length) ? (
            <ol>
              {answer.citations.map((source, index) => (
                <li key={`record-${index}`}>
                  <strong>{sourceName(source.entityCode, source.recordId)}</strong>
                  <small>Record</small>
                </li>
              ))}
              {answer.attachmentCitations.map((source) => (
                <li key={source.attachmentId}>
                  <strong>{source.fileName}</strong>
                  <small>File</small>
                </li>
              ))}
            </ol>
          ) : (
            <p>No records or files were cited for this answer.</p>
          )}
        </section>
      ) : null}
      {suggestions.length && onSuggest ? (
        <section>
          <header>
            <strong>What you can ask here</strong>
            <small>Atlas checks your permissions before it acts</small>
          </header>
          <ul className="athyper-atlas-inspector__suggestions">
            {suggestions.slice(0, 4).map((prompt) => (
              <li key={prompt}>
                <button type="button" onClick={() => onSuggest(prompt)}>
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {administrator ? (
        <section>
          <details>
            <summary>Details for administrators</summary>
            <dl>
              <div>
                <dt>Agent</dt>
                <dd>{agent?.name ?? "Default Atlas agent"}</dd>
              </div>
              <div>
                <dt>Answer model</dt>
                <dd>{answer?.publicModelId ?? "Not available"}</dd>
              </div>
              <div>
                <dt>Configured data class</dt>
                <dd>{agent?.dataClass ?? "Not provided"}</dd>
              </div>
            </dl>
            {answer?.citations.length ? (
              <>
                <p>Cited record versions</p>
                <ul>
                  {answer.citations.map((source, index) => (
                    <li key={`version-${index}`}>
                      {source.entityCode} {source.recordId} · v{source.revision}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {agent?.toolCodes.length ? (
              <>
                <p>Configured tools; availability is checked per request.</p>
                <ul>
                  {agent.toolCodes.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </details>
        </section>
      ) : null}
    </aside>
  );
}
