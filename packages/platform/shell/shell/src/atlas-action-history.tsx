"use client";
import * as React from "react";
import {
  type AtlasActionAuditEntry,
  useAtlasAnswer,
} from "@athyper/platform-ai-agent-ui";

const friendly = (value: string) =>
  value.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
function operationName(entry: AtlasActionAuditEntry) {
  // Use the recorded operation summary, never the current page's entity for an older action.
  if (entry.summary === "Read entity record" && entry.affectedEntityType)
    return `Read ${friendly(entry.affectedEntityType).toLocaleLowerCase()} record`;
  return entry.summary || "Atlas operation";
}
export function AtlasActionHistory({
  atlas,
}: {
  readonly atlas: ReturnType<typeof useAtlasAnswer>;
}) {
  if (atlas.historyStatus === "loading")
    return (
      <p className="athyper-atlas-audit-notice" role="status">
        Loading Atlas actions…
      </p>
    );
  if (atlas.historyStatus === "error" || atlas.historyStatus === "unavailable")
    return (
      <div className="athyper-atlas-audit-notice" role="alert">
        <p>{atlas.historyMessage || "Atlas actions could not be loaded."}</p>
        <button type="button" onClick={() => void atlas.loadHistory()}>
          Retry
        </button>
      </div>
    );
  if (!atlas.history.length)
    return (
      <p className="athyper-atlas-audit-notice">
        No Atlas actions have been recorded for this account.
      </p>
    );
  return (
    <ol className="athyper-atlas-audit-list">
      {atlas.history.map((entry) => (
        <li key={entry.proposalId}>
          <article>
            <strong>{operationName(entry)}</strong>
            <p>
              <span
                className="athyper-atlas-audit-status"
                data-status={entry.status}
              >
                {friendly(entry.status)}
              </span>
              <time dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </p>
            <details>
              <summary>Technical details</summary>
              <dl>
                <div>
                  <dt>Tool</dt>
                  <dd>
                    {entry.toolCode}@{entry.toolVersion}
                  </dd>
                </div>
                <div>
                  <dt>Policy</dt>
                  <dd>{entry.policyRevision}</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>{friendly(entry.access)}</dd>
                </div>
                <div>
                  <dt>Risk</dt>
                  <dd>{friendly(entry.risk)}</dd>
                </div>
                {entry.durationMs !== undefined ? (
                  <div>
                    <dt>Duration</dt>
                    <dd>{entry.durationMs} ms</dd>
                  </div>
                ) : null}
                {entry.affectedEntityType ? (
                  <div>
                    <dt>Entity type</dt>
                    <dd>{entry.affectedEntityType}</dd>
                  </div>
                ) : null}
                {entry.affectedEntityId ? (
                  <div>
                    <dt>Record ID</dt>
                    <dd>{entry.affectedEntityId}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Action ID</dt>
                  <dd>{entry.proposalId}</dd>
                </div>
                {entry.businessTransactionId ? (
                  <div>
                    <dt>Transaction</dt>
                    <dd>
                      {entry.businessTransactionType ?? "command"} ·{" "}
                      {entry.businessTransactionId}
                    </dd>
                  </div>
                ) : null}
                {entry.terminalErrorClass ? (
                  <div>
                    <dt>Outcome evidence</dt>
                    <dd>{entry.terminalErrorClass}</dd>
                  </div>
                ) : null}
              </dl>
            </details>
          </article>
        </li>
      ))}
    </ol>
  );
}
