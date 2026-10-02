"use client";
import * as React from "react";
import { useState } from "react";
import {
  type AtlasActionAuditEntry,
  useAtlasAnswer,
} from "@athyper/platform-ai-agent-ui";
import { FilterChipGroup } from "@athyper/platform-ui";
import { useOptionalPermission } from "@athyper/platform-shell-app-foundation";
import { groupByDay } from "./atlas-day-groups";

const friendly = (value: string) =>
  value.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
function operationName(entry: AtlasActionAuditEntry) {
  // Use the recorded operation summary, never the current page's entity for an older action.
  if (entry.summary === "Read entity record" && entry.affectedEntityType)
    return `Read ${friendly(entry.affectedEntityType).toLocaleLowerCase()} record`;
  return entry.summary || "Atlas operation";
}

/** What happened, in the person's words. */
const OUTCOME: Record<AtlasActionAuditEntry["status"], { readonly label: string; readonly tone: "done" | "attention" | "progress" | "neutral" }> = {
  completed: { label: "Done", tone: "done" },
  failed: { label: "Couldn’t complete", tone: "attention" },
  denied: { label: "Not allowed", tone: "attention" },
  expired: { label: "Expired before it was confirmed", tone: "attention" },
  proposed: { label: "Waiting for your confirmation", tone: "progress" },
  confirmed: { label: "In progress", tone: "progress" },
  executing: { label: "In progress", tone: "progress" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
const NEEDS_ATTENTION = new Set<AtlasActionAuditEntry["status"]>(["failed", "denied", "expired", "proposed"]);
const EXPLANATION: Partial<Record<AtlasActionAuditEntry["status"], string>> = {
  failed: "Atlas couldn’t finish this. Ask again, or contact support with the reference.",
  denied: "Your permissions don’t allow this action here.",
  expired: "It wasn’t confirmed in time, so nothing changed.",
};

/** Atlas actions as a readable log: what Atlas did, for which record, and how it
 * ended. The governance record (tool, policy, risk) is for Atlas administrators. */
export function AtlasActionHistory({
  atlas,
  query = "",
}: {
  readonly atlas: ReturnType<typeof useAtlasAnswer>;
  /** Filters by what was done or the record type. */
  readonly query?: string;
}) {
  const administrator = useOptionalPermission("atlas.admin.manage");
  const [scope, setScope] = useState("all");
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
        Atlas hasn’t done anything for you yet.
      </p>
    );
  const term = query.trim().toLocaleLowerCase();
  const attention = atlas.history.filter((entry) => NEEDS_ATTENTION.has(entry.status)).length;
  const shown = atlas.history.filter(
    (entry) =>
      (scope === "all" || NEEDS_ATTENTION.has(entry.status)) &&
      (!term ||
        operationName(entry).toLocaleLowerCase().includes(term) ||
        (entry.affectedEntityType ?? "").replaceAll("_", " ").toLocaleLowerCase().includes(term)),
  );
  return (
    <div className="athyper-atlas-audit">
      <FilterChipGroup
        label="Atlas action filters"
        value={scope}
        onValueChange={setScope}
        items={[
          { value: "all", label: "All" },
          { value: "attention", label: "Needs attention", count: attention || undefined },
        ]}
      />
      {!shown.length ? (
        <p className="athyper-atlas-audit-notice">
          {term ? `No Atlas actions match “${query.trim()}”.` : "Nothing needs your attention."}
        </p>
      ) : (
        groupByDay(shown, (entry) => entry.createdAt).map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h3>{group.label}</h3>
            <ol className="athyper-atlas-audit-list">
              {group.items.map((entry) => {
                const outcome = OUTCOME[entry.status] ?? { label: friendly(entry.status), tone: "neutral" as const };
                const explanation = EXPLANATION[entry.status];
                return (
                  <li key={entry.proposalId}>
                    <article>
                      <strong>{operationName(entry)}</strong>
                      <p>
                        <span className="athyper-atlas-audit-status" data-tone={outcome.tone}>
                          {outcome.label}
                        </span>
                        <time dateTime={entry.createdAt}>
                          {new Date(entry.createdAt).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                        {entry.affectedEntityType ? (
                          <span>{friendly(entry.affectedEntityType)}</span>
                        ) : null}
                      </p>
                      {explanation ? <p className="athyper-atlas-audit-explanation">{explanation}</p> : null}
                      <small className="athyper-atlas-audit-reference">
                        Reference {entry.proposalId.slice(0, 8).toUpperCase()}
                      </small>
                      {administrator ? (
                        <details>
                          <summary>Details for administrators</summary>
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
                                  {entry.businessTransactionType ?? "command"} · {entry.businessTransactionId}
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
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
