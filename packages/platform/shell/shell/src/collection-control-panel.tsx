"use client";
import React, { type ReactNode } from "react";
import {
  CollectionControlSections,
  type CollectionControlOption,
} from "@athyper/platform-collection-controls";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Drawer, PanelContextRow, PanelHeader } from "@athyper/platform-ui";
import { WorkspaceToolPanel } from "./workspace-tool-panel";

/** The controls panel every collection uses (entity lists, Notifications,
 * Inbox): the shared side panel with header, context row and section tabs.
 * Mounted for one open session; visited sections retain drafts until it
 * closes. `sections` receives `finish`: after an apply, an overlay closes
 * while a pinned panel stays open beside the refreshed collection. */
export function CollectionControlPanel<K extends string>({
  id = "list-controls",
  active,
  onSelect,
  onOpenChange,
  options,
  sections,
  entity,
  context,
}: {
  /** Tool-panel identity; panels sharing an id share pin and width preferences. */
  readonly id?: string;
  readonly active: K;
  readonly onSelect: (key: K) => void;
  readonly onOpenChange: (open: boolean) => void;
  /** Available sections, already localized and filtered by the collection's contract. */
  readonly options: readonly CollectionControlOption<K>[];
  readonly sections: (finish: (open: boolean) => void) => Partial<Record<K, ReactNode>>;
  /** Plural collection label for the panel's accessible name, e.g. "Countries". */
  readonly entity: string;
  /** Shown under the header on every tab: the collection and its result count. */
  readonly context: { readonly label: ReactNode; readonly detail?: ReactNode };
}) {
  const intl = useEntityI18n();
  const current = options.find((item) => item.key === active) ?? options[0];
  if (!current) return null;
  const Icon = current.Icon;
  return (
    // Section footers use the drawer's footer grammar, so keep its context.
    <Drawer.Root open onOpenChange={onOpenChange}>
      <WorkspaceToolPanel
        id={id}
        open
        onOpenChange={onOpenChange}
        className="a-collection-controls"
        labels={{
          region: intl.message("list.controls.region", { entity }),
          close: intl.message("list.controls.close"),
          pin: intl.message("list.controls.pin"),
          unpin: intl.message("list.controls.unpin"),
          resize: intl.message("list.controls.resize"),
        }}
      >
        {({ mode, capabilities }) => (
          <>
            <PanelHeader
              className="a-collection-controls__header"
              icon={<Icon size={20} />}
              title={current.title ?? current.label}
              subtitle={current.description}
              capabilities={capabilities}
            />
            <PanelContextRow
              className="a-collection-controls__context"
              scope={{ kind: "global", ...context }}
            />
            <CollectionControlSections
              active={current.key}
              onSelect={onSelect}
              options={options}
              sections={sections((open) => {
                if (open || mode !== "pinned") onOpenChange(open);
              })}
              tabsLabel={intl.message("list.controls.tabs")}
            />
          </>
        )}
      </WorkspaceToolPanel>
    </Drawer.Root>
  );
}
