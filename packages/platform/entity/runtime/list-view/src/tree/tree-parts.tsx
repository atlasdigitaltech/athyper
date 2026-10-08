"use client";
import React, { type ReactNode } from "react";
import { ChevronRightIcon } from "@athyper/platform-icons";
import { Button } from "@athyper/platform-ui";

// Presentation parts shared by the grouped tree (Table) and the Tree layout.
// Rows carry data-tree-key, aria-level and aria-expanded; the keyboard model
// in tree-keyboard.ts drives them through data-tree-toggle and data-tree-open.

/** The expand control of an expandable row, or a spacer that keeps leaves
 * aligned with their expandable siblings. */
export function TreeToggle({ expandable, expanded, label, onToggle, limit }: {
  readonly expandable: boolean;
  readonly expanded: boolean;
  /** Accessible name, for example "Expand Assets". */
  readonly label: string;
  readonly onToggle: () => void;
  /** The row sits at the maximum depth: shown, never expandable. */
  readonly limit?: boolean;
}) {
  if (!expandable) return <span className="a-entity-tree__toggle a-entity-tree__toggle--spacer" aria-hidden="true" />;
  return (
    <button type="button" className="a-entity-tree__toggle" data-tree-toggle="" tabIndex={-1} aria-label={label} aria-expanded={expanded}
      data-expanded={expanded || undefined} data-limit={limit || undefined} onClick={onToggle}>
      <ChevronRightIcon size={16} aria-hidden="true" />
    </button>
  );
}

/** Indentation guides for a row at `level` (1 = top). */
export function TreeIndent({ level }: { readonly level: number }) {
  return <>{Array.from({ length: Math.max(0, level - 1) }, (_, index) => <span key={index} className="a-entity-tree__guide" aria-hidden="true" />)}</>;
}

/** Tree controls over loaded nodes only: Expand all loaded, Collapse all and
 * Show to level n. None of them sends a request, so expanding never fans out
 * into one request per node (Tree blueprint section 8). */
export function TreeStrip({ levels, expandAllLabel, collapseAllLabel, levelLabel, onExpandAll, onCollapseAll, onLevel, children }: {
  readonly levels: number;
  readonly expandAllLabel: string;
  readonly collapseAllLabel: string;
  readonly levelLabel: string;
  readonly onExpandAll: () => void;
  readonly onCollapseAll: () => void;
  readonly onLevel: (level: number) => void;
  readonly children?: ReactNode;
}) {
  return (
    <div className="a-entity-tree__strip">
      <Button variant="secondary" size="small" onClick={onExpandAll}>{expandAllLabel}</Button>
      <Button variant="secondary" size="small" onClick={onCollapseAll}>{collapseAllLabel}</Button>
      {levels > 1 ? (
        // Actions, not a setting: a group of buttons rather than a radio group.
        <span className="a-entity-tree__levels" role="group" aria-label={levelLabel}>
          <span aria-hidden="true">{levelLabel}</span>
          {Array.from({ length: levels }, (_, index) => (
            <Button key={index} variant="ghost" size="small" onClick={() => onLevel(index + 1)}>{index + 1}</Button>
          ))}
        </span>
      ) : null}
      {children}
    </div>
  );
}

/** Where the selected row sits, from what is already loaded: no request. */
export function TreePath({ label, hint, path, onSelect }: {
  readonly label: string;
  readonly hint: string;
  readonly path: readonly { readonly key: string; readonly label: string }[];
  readonly onSelect: (key: string) => void;
}) {
  return (
    <nav className="a-entity-tree__path" aria-label={label}>
      <span>{label}</span>
      {path.length ? path.map((step, index) => (
        <React.Fragment key={step.key}>
          <span className="a-entity-tree__path-sep" aria-hidden="true">›</span>
          {index === path.length - 1 ? <strong aria-current="location">{step.label}</strong> : <button type="button" onClick={() => onSelect(step.key)}>{step.label}</button>}
        </React.Fragment>
      )) : <span className="a-entity-tree__path-hint">{hint}</span>}
    </nav>
  );
}
