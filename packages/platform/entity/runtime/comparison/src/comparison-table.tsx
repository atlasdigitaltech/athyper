"use client";
import React, { type ReactNode } from "react";
import type { ComparisonOutcome } from "./comparison-model";

// The shared N-column comparison table (Entity list Compare blueprint
// sections 9.2 and 10). Presentational: consumers prepare columns, rows and
// wording; this view owns table semantics, sections and marks. Differences,
// baseline and best marks are always text, never colour alone.

export interface ComparisonTableColumn {
  /** Internal identity (record or snapshot); never displayed. */
  readonly key: string;
  /** Readable identity, for example a business code. */
  readonly code?: string;
  readonly title?: string;
  readonly status?: ReactNode;
  /** Visible "Baseline" text when this column is the baseline. */
  readonly baselineLabel?: string;
  /** For example "3 differ from baseline" or "Record not available". */
  readonly note?: string;
  readonly unavailable?: boolean;
  /** The column's own menu (trigger and items), supplied by the consumer. */
  readonly menu?: ReactNode;
}

export interface ComparisonTableMark {
  readonly tone: "differs" | "same" | "muted" | "best";
  readonly label: string;
}

export interface ComparisonTableCell {
  readonly content: ReactNode;
  readonly state: "value" | "empty" | "masked" | "unavailable";
  readonly marks?: readonly ComparisonTableMark[];
  readonly baseline?: boolean;
  readonly best?: boolean;
}

export interface ComparisonTableRow {
  readonly key: string;
  /** DOM id of the row header, for previous and next difference. */
  readonly id: string;
  readonly label: string;
  readonly outcome: ComparisonOutcome;
  /** "Differs", "Not compared" or a specific reason such as "Currency not compared". */
  readonly badge?: string;
  readonly cells: readonly ComparisonTableCell[];
}

export interface ComparisonTableSection {
  readonly key: string;
  readonly label: string;
  readonly open: boolean;
  /** Heading counts, for example "3 differ" and "1 not compared". */
  readonly counts: readonly { readonly label: string; readonly emphasis?: boolean }[];
  readonly rows: readonly ComparisonTableRow[];
  readonly notCompared?: { readonly label: string; readonly rows: readonly ComparisonTableRow[] };
  /** Shown when the open section has no row to show. */
  readonly emptyMessage?: string;
}

export function ComparisonTable({
  caption,
  fieldHeading,
  columns,
  sections,
  onToggleSection,
}: {
  readonly caption: string;
  readonly fieldHeading: string;
  readonly columns: readonly ComparisonTableColumn[];
  readonly sections: readonly ComparisonTableSection[];
  readonly onToggleSection: (key: string) => void;
}) {
  const span = columns.length + 1;
  return (
    <table className="a-comparison" style={{ ["--a-comparison-columns" as string]: columns.length }}>
      <caption className="a-comparison__caption">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="a-comparison__field-heading">{fieldHeading}</th>
          {columns.map((column) => (
            <th scope="col" key={column.key} className="a-comparison__column" data-baseline={column.baselineLabel ? "" : undefined} data-unavailable={column.unavailable ? "" : undefined}>
              <div className="a-comparison__column-inner">
                <div className="a-comparison__column-text">
                  {column.code ? <span className="a-comparison__code">{column.code}</span> : null}
                  {column.baselineLabel ? <span className="a-comparison__baseline">{column.baselineLabel}</span> : null}
                  {column.title ? <span className="a-comparison__title">{column.title}</span> : null}
                  {column.status ? <span className="a-comparison__status">{column.status}</span> : null}
                  {column.note ? <span className="a-comparison__note">{column.note}</span> : null}
                </div>
                {column.menu}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      {sections.map((section) => (
        <tbody key={section.key} className="a-comparison__section">
          <tr className="a-comparison__section-heading">
            <th colSpan={span} scope="colgroup">
              <button type="button" aria-expanded={section.open} onClick={() => onToggleSection(section.key)}>
                <span className="a-comparison__chevron" aria-hidden="true" />
                <span>{section.label}</span>
                {section.counts.map((count) => (
                  <span key={count.label} className="a-comparison__count" data-emphasis={count.emphasis ? "" : undefined}>{count.label}</span>
                ))}
              </button>
            </th>
          </tr>
          {section.open ? (
            <>
              {!section.rows.length && !section.notCompared?.rows.length && section.emptyMessage ? (
                <tr className="a-comparison__empty">
                  <td colSpan={span}>{section.emptyMessage}</td>
                </tr>
              ) : null}
              {section.rows.map((row) => <Row key={row.key} row={row} />)}
              {section.notCompared?.rows.length ? (
                <>
                  <tr className="a-comparison__subheading">
                    <th colSpan={span} scope="colgroup">{section.notCompared.label}</th>
                  </tr>
                  {section.notCompared.rows.map((row) => <Row key={row.key} row={row} />)}
                </>
              ) : null}
            </>
          ) : null}
        </tbody>
      ))}
    </table>
  );
}

function Row({ row }: { readonly row: ComparisonTableRow }) {
  return (
    <tr className="a-comparison__row" data-outcome={row.outcome}>
      <th scope="row" id={row.id} tabIndex={-1}>
        <span className="a-comparison__label">{row.label}</span>
        {row.badge ? <span className="a-comparison__badge" data-outcome={row.outcome}>{row.badge}</span> : null}
      </th>
      {row.cells.map((cell, index) => (
        <td key={index} className="a-comparison__cell" data-state={cell.state} data-baseline={cell.baseline ? "" : undefined} data-best={cell.best ? "" : undefined}>
          <span className="a-comparison__value">{cell.content}</span>
          {cell.marks?.length ? (
            <span className="a-comparison__marks">
              {cell.marks.map((mark) => (
                <span key={mark.label} className="a-comparison__mark" data-tone={mark.tone}>{mark.label}</span>
              ))}
            </span>
          ) : null}
        </td>
      ))}
    </tr>
  );
}
