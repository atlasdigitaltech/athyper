"use client";
import React, {
  useEffect,
  useId,
  useState,
  type ReactNode,
  type ComponentType,
} from "react";
import { Drawer, Button, PanelTabs } from "@athyper/platform-ui";
export * from "./filter-editor";
export * from "./filter-state";
export * from "./operator-menu";
export * from "./collection-filter-editor";
export * from "./collection-sections";

export interface CollectionControlOption<K extends string> {
  readonly key: K;
  /** Short tab label. */
  readonly label: string;
  /** Header title; defaults to the tab label. */
  readonly title?: string;
  readonly description: string;
  readonly Icon: ComponentType<{ size?: number }>;
  /** Shown on the tab when positive, e.g. active filters. */
  readonly count?: number;
}

/** Section tabs and bodies shared by the docked tool panel and the modal
 * drawer. Visited sections stay mounted so their drafts survive tab changes;
 * closing the owner discards them. */
export function CollectionControlSections<K extends string>({
  active,
  onSelect,
  options,
  sections,
  tabsLabel,
}: {
  readonly active: K;
  readonly onSelect: (key: K) => void;
  readonly options: readonly CollectionControlOption<K>[];
  readonly sections: Partial<Record<K, ReactNode>>;
  readonly tabsLabel: string;
}) {
  const id = useId();
  const [visited, setVisited] = useState<readonly K[]>([active]);
  useEffect(
    () => setVisited((current) => (current.includes(active) ? current : [...current, active])),
    [active],
  );
  const tab = (key: K) => `${id}-tab-${key}`,
    panel = (key: K) => `${id}-panel-${key}`;
  return (
    <>
      <PanelTabs
        className="a-collection-controls__tabs"
        label={tabsLabel}
        value={active}
        onValueChange={(key) => onSelect(key as K)}
        hidden={options.length < 2}
        items={options.map((item) => ({ key: item.key, label: item.label, count: item.count, id: tab(item.key), panelId: panel(item.key) }))}
      />
      {options
        .filter((item) => visited.includes(item.key) || item.key === active)
        .map((item) => (
          <div
            key={item.key}
            id={panel(item.key)}
            role={options.length < 2 ? "region" : "tabpanel"}
            aria-labelledby={options.length < 2 ? undefined : tab(item.key)}
            aria-label={options.length < 2 ? item.title ?? item.label : undefined}
            hidden={item.key !== active}
            inert={item.key !== active}
            className={`a-entity-list__drawer-section a-entity-list__${item.key === "views" ? "manage-views" : item.key === "display" ? "display-settings" : item.key === "filters" ? "filter" : item.key}-drawer`}
            data-list-drawer={item.key}
          >
            {sections[item.key]}
          </div>
        ))}
    </>
  );
}

/** Draft footer grammar shared by every collection control section: Reset on
 * the leading edge and one primary action. The summary describes only what
 * Apply will do, so it appears only for a changed draft (or an error); the
 * current state belongs to the panel's context row. Closing and discarding a
 * draft belong to the panel (close button, Escape, backdrop), so there is no
 * Cancel. `onCancel` is accepted for existing callers and ignored. */
export function CollectionDraftFooter({count,dirty,error,onReset,onApply,summary,resetLabel="Reset",applyLabel="Apply",resetDisabled=false,applyDisabled=false,className}:{count?:number;dirty:boolean;error?:string;onReset:()=>void;onCancel?:()=>void;onApply:()=>void;summary?:ReactNode;resetLabel?:ReactNode;applyLabel?:ReactNode;resetDisabled?:boolean;applyDisabled?:boolean;className?:string}) {
 return <Drawer.Footer className={className ? `a-collection-footer ${className}` : "a-collection-footer"}>{dirty||error?<Drawer.FooterSummary>{dirty?(summary??<strong>{count===undefined?"Apply to refresh results":`${count} matching items`}</strong>):null}{error?<span role="alert">{error}</span>:null}</Drawer.FooterSummary>:null}<Drawer.FooterActions><Button variant="ghost" size="small" disabled={resetDisabled} onClick={onReset}>{resetLabel}</Button><Button size="small" disabled={!dirty||!!error||applyDisabled} onClick={onApply}>{applyLabel}</Button></Drawer.FooterActions></Drawer.Footer>;
}
