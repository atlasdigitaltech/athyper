"use client";
import * as React from "react";
import { useState } from "react";
import type {
  useAtlasAnswer,
  AtlasExperienceAgent,
} from "@athyper/platform-ai-agent-ui";

export function AtlasContextInspector({
  atlas,
  recordLabel,
  entityLabel,
  sectionLabel,
  recordHref,
  agent,
  id,
}: {
  readonly atlas: ReturnType<typeof useAtlasAnswer>;
  readonly recordLabel?: string;
  readonly entityLabel: string;
  readonly sectionLabel?: string;
  readonly recordHref?: string;
  readonly agent?: AtlasExperienceAgent;
  readonly id: string;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const answers = atlas.messages.filter(
    (message) => message.role === "assistant" && message.status === "completed",
  );
  const selected =
    answers.find((message) => message.messageId === selectedId) ??
    answers.at(-1);
  const answer = selected?.answer;
  const page = atlas.businessContext;
  const work = page?.kind === "record" ? page.workContext : undefined;
  const safeHref =
    recordHref?.startsWith("/") &&
    !recordHref.startsWith("//") &&
    !recordHref.includes("\\")
      ? recordHref
      : undefined;
  return (
    <aside
      id={id}
      className="athyper-atlas-workspace__inspector"
      aria-label="Atlas context"
    >
      <section>
        <header>
          <strong>
            {page?.kind === "record" ? "Current record" : "Workspace context"}
          </strong>
          <small>Context for your next question</small>
        </header>
        {page ? (
          <>
            <p className="athyper-atlas-inspector__record">
              {recordLabel ?? entityLabel}
            </p>
            <p>{entityLabel}</p>
            <dl>
              <div>
                <dt>Current page</dt>
                <dd>{sectionLabel ?? "Current workspace"}</dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <p className="athyper-atlas-inspector__record">
              No record selected
            </p>
            <p>
              Ask a workspace question, or open a record to use its context.
              Access follows your current tenant and permissions.
            </p>
          </>
        )}
        {safeHref ? <a href={safeHref}>Open record</a> : null}
        {page?.kind === "record" && page.dirty ? (
          <p>Answers use saved data.</p>
        ) : null}
        {page?.kind === "record" && page.asOf ? (
          <p>Historical view · {page.asOf}</p>
        ) : null}
      </section>
      {page?.kind === "record" && page.entityCode === "business_partner" ? (
        <section>
          <header>
            <strong>Transaction context</strong>
          </header>
          <dl>
            <div>
              <dt>Organization</dt>
              <dd>
                {work?.operatingOrganizationId
                  ? "Selected — see record"
                  : "Not selected"}
              </dd>
            </div>
            <div>
              <dt>Company</dt>
              <dd>
                {work?.companyCodeId ? "Selected — see record" : "Not selected"}
              </dd>
            </div>
          </dl>
          <p>Transaction context applies when the question requires it.</p>
        </section>
      ) : null}
      <section>
        <header>
          <strong>Answer sources</strong>
          <small>Evidence for the selected answer</small>
        </header>
        {answers.length > 1 ? (
          <label className="athyper-atlas-inspector__answer-picker">
            Answer
            <select
              value={selected?.messageId ?? ""}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {answers.map((message, index) => (
                <option key={message.messageId} value={message.messageId}>
                  Answer {index + 1} ·{" "}
                  {new Date(message.createdAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {answer &&
        (answer.citations.length || answer.attachmentCitations.length) ? (
          <ol>
            {answer.citations.map((source, index) => (
              <li key={`record-${index}`}>
                <strong>
                  {page?.kind === "record" &&
                  page.recordId === source.recordId &&
                  page.entityCode === source.entityCode &&
                  recordLabel
                    ? recordLabel
                    : `${source.entityCode.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} record`}
                </strong>
                <small>Record evidence</small>
                <details>
                  <summary>Technical details</summary>
                  <p>Record ID: {source.recordId}</p>
                  <p>Version: {source.revision}</p>
                </details>
              </li>
            ))}
            {answer.attachmentCitations.map((source) => (
              <li key={source.attachmentId}>
                <strong>{source.fileName}</strong>
                <small>Verified attachment</small>
              </li>
            ))}
          </ol>
        ) : (
          <p>
            {selected
              ? "This answer has no verified sources."
              : "Select or ask a question to view answer sources."}
          </p>
        )}
      </section>
      <section>
        <header>
          <strong>Available assistance</strong>
        </header>
        <p>
          Assistance is checked against your permissions when you ask a
          question. The current page does not provide a complete capability
          list.
        </p>
      </section>
      <section>
        <details>
          <summary>Technical details</summary>
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
    </aside>
  );
}
