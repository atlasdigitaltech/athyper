"use client";
import * as React from "react";
import type { ReactNode } from "react";

/** How an authorized tool result reads in an answer: one headline sentence, the
 * data in a form people read, and scope notes for "About this answer". */
export interface AtlasResultView {
  readonly headline: string;
  readonly body?: ReactNode;
  readonly about: readonly string[];
  /** Questions that naturally come next; they fill the composer. */
  readonly followUps?: readonly string[];
}

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const when = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const humanize = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

/** Results that carry nothing for the person (an empty section envelope). */
export function atlasResultIsSilent(value: unknown): boolean {
  const data = object(value);
  return Boolean(data && "items" in data && "section" in data && "status" in data && "hasMore" in data);
}

/** The registered views. A result without one is never dumped as fields. */
export function atlasResultView(value: unknown): AtlasResultView | undefined {
  const data = object(value);
  if (!data) return undefined;
  const items = Array.isArray(data.items) ? data.items.map(object).filter(Boolean) as Record<string, unknown>[] : undefined;
  const partial = data.hasMore === true;
  // Saved comments (top level or one thread).
  if ((data.coverage === "authorized_root_comments" || data.coverage === "authorized_thread_replies") && items) {
    const replies = data.coverage === "authorized_thread_replies";
    return {
      headline: items.length
        ? `${plural(items.length, replies ? "reply" : "saved comment", replies ? "replies" : "saved comments")}${partial ? " so far" : ""}.`
        : replies
          ? "No replies you can see in this thread."
          : "No saved comments you can see.",
      body: items.length ? (
        <ul className="athyper-atlas-result__list">
          {items.map((row, index) => (
            <li key={String(row.id ?? index)}>
              <span className="athyper-atlas-result__meta">
                {typeof row.authorDisplayName === "string" ? row.authorDisplayName : "Someone"}
                {when(row.createdAt) ? ` · ${when(row.createdAt)}` : ""}
                {typeof row.replyCount === "number" && row.replyCount ? ` · ${plural(row.replyCount, "reply", "replies")}` : ""}
              </span>
              <span>{row.tombstone === true ? "Deleted comment" : String(row.text ?? "")}</span>
            </li>
          ))}
        </ul>
      ) : undefined,
      about: [
        "Only saved comments you can see",
        replies ? "Replies in the selected thread" : "Top-level comments; replies are read separately",
        partial ? "Partial: more comments exist" : "All results",
      ],
      followUps: items.length
        ? ["Summarize these comments", "Which comments need a reply?"]
        : ["Show recent changes to this record", "Summarize this record"],
    };
  }
  // Saved snapshots of the record.
  if (data.coverage === "authorized_snapshots_in_default_date_range" && items) {
    return {
      headline: items.length
        ? `${plural(items.length, "saved snapshot", "saved snapshots")}${partial ? " so far" : ""}.`
        : "No saved snapshots in this date range.",
      body: items.length ? (
        <ul className="athyper-atlas-result__list">
          {items.map((row, index) => (
            <li key={String(row.id ?? index)}>
              <span>{when(row.capturedAt) ?? "Unknown time"}</span>
              {typeof row.coverage === "string" ? <span className="athyper-atlas-result__meta">{humanize(row.coverage)}</span> : null}
            </li>
          ))}
        </ul>
      ) : undefined,
      about: [
        "Snapshots you can see in the default date range",
        partial ? "Partial: more snapshots exist in this range" : "All results in this range",
        "A missing snapshot is not evidence of no history",
      ],
      followUps: items.length > 1 ? ["Compare the last two snapshots", "Summarize this record"] : ["Summarize this record"],
    };
  }
  // Published field declarations.
  if (data.coverage === "authorized_summary_fields" && Array.isArray(data.fields)) {
    const fields = data.fields.map(object).filter(Boolean) as Record<string, unknown>[];
    return {
      headline: `${plural(fields.length, "field", "fields")} on this record type.`,
      body: fields.length ? (
        <table className="athyper-atlas-result__table">
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Type</th>
              <th scope="col">Required</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <tr key={String(field.key ?? index)}>
                <th scope="row">{String(field.label ?? field.key ?? "")}</th>
                <td>{humanize(String(field.type ?? ""))}</td>
                <td>{field.required === true ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : undefined,
      about: [
        "Only fields you can see",
        data.readOnlyEntity === true ? "This record type is read-only" : "Describes fields; it does not grant edit access",
        "Declarations, not validation results",
      ],
      followUps: ["Which fields are required?", "Summarize this record"],
    };
  }
  // Two saved snapshots compared.
  if (data.coverage === "currently_authorized_captured_root_fields" && Array.isArray(data.fields)) {
    const fields = data.fields.map(object).filter(Boolean) as Record<string, unknown>[];
    const shown = (raw: unknown) => {
      const v = object(raw);
      if (v?.state === "uncaptured") return "Not captured";
      if (v?.state !== "value") return "—";
      return v.value === null ? "Empty" : String(v.value);
    };
    const uncaptured = (field: Record<string, unknown>) =>
      object(field.before)?.state === "uncaptured" || object(field.after)?.state === "uncaptured";
    const changed = fields.filter((field) => field.changed === true && !uncaptured(field)).length;
    const unknown = fields.filter(uncaptured).length;
    return {
      headline: changed
        ? `${plural(changed, "field", "fields")} changed between the two snapshots.`
        : "Nothing changed between the two snapshots.",
      body: fields.length ? (
        <table className="athyper-atlas-result__table">
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            {[...fields]
              .sort((a, b) => Number(b.changed === true) - Number(a.changed === true))
              .map((field, index) => (
                <tr key={String(field.key ?? index)} data-changed={field.changed === true || undefined}>
                  <th scope="row">{String(field.label ?? field.key ?? "")}</th>
                  <td>{shown(field.before)}</td>
                  <td>{shown(field.after)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      ) : undefined,
      about: [
        `Compares snapshots from ${when(data.from) ?? String(data.from)} and ${when(data.to) ?? String(data.to)}`,
        "Saved snapshots, not the live record or unsaved edits",
        ...(unknown ? [`${plural(unknown, "field was", "fields were")} not captured`] : []),
      ],
      followUps: ["Explain what changed", "Show the saved snapshots"],
    };
  }
  return undefined;
}
