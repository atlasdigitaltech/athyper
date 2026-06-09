"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Layers, X } from "lucide-react";
import type { ResolvedColumn, RuntimeField } from "../../core/types";
import { LIST_URL_PARAMS as P } from "../../core/types";
import { PaletteButton } from "./PaletteButton";
import { PaletteDrawerActions } from "./PaletteDrawerActions";
import { PaletteDrawer } from "./PaletteDrawer";
import { serializeOrganizeState } from "./organizeUrl";
import { useOrganizePanel } from "./organizeState";
import { ORGANIZE_ICON_BUTTON_CLASS } from "./paletteStyles";
import { FieldCombobox } from "./FieldCombobox";

interface GroupControlProps {
  groupField?:      string;
  groupableFields:  RuntimeField[];
  visibleColumns:   ResolvedColumn[];
  listBaseHref:     string;
  rawSearchParams:  Record<string, string | string[] | undefined>;
  enabled:          boolean;
  trigger?:         "button" | "hidden";
}

export function GroupControl({
  groupField,
  groupableFields,
  visibleColumns,
  listBaseHref,
  rawSearchParams,
  enabled,
  trigger = "button",
}: GroupControlProps) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panel = useOrganizePanel("group");
  const visibleNames = useMemo(() => new Set(visibleColumns.map((column) => column.name)), [visibleColumns]);
  const visibleGroupableFields = groupableFields.filter((field) => visibleNames.has(field.name));
  const [draft, setDraft] = useState<string | null>(groupField ?? null);
  const hasChanges = (draft ?? null) !== (groupField ?? null);

  useEffect(() => {
    if (panel.open) setDraft(groupField ?? null);
  }, [groupField, panel.open]);

  if (!enabled || groupableFields.length === 0) return null;

  const apply = () => {
    router.push(serializeOrganizeState(listBaseHref, rawSearchParams, {
      [P.GROUP]: draft && visibleGroupableFields.some((field) => field.name === draft) ? draft : null,
    }));
    panel.close();
  };

  const activeField = visibleGroupableFields.find((field) => field.name === groupField);

  return (
    <>
      {trigger === "button" ? (
        <PaletteButton
          ref={buttonRef}
          icon={Layers}
          label="Group"
          active={Boolean(activeField)}
          expanded={panel.open}
          onClick={panel.toggle}
        />
      ) : (
        <button ref={buttonRef} type="button" aria-hidden="true" tabIndex={-1} className="sr-only" />
      )}
      {panel.open && (
        <PaletteDrawer
          anchorRef={buttonRef}
          title="Group"
          icon={Layers}
          onClose={panel.close}
          footer={(
            <PaletteDrawerActions
              onApply={apply}
              onReset={() => setDraft(null)}
              onDiscard={panel.close}
              hasChanges={hasChanges}
            />
          )}
        >
          <div className="flex flex-col gap-4">
            <div className="flex gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="leading-5">
                You can only group visible columns. If a column has not been made visible, it will not be grouped.
              </p>
            </div>

            {visibleGroupableFields.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                No visible groupable columns.
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <FieldCombobox
                  fields={visibleGroupableFields}
                  value={draft}
                  placeholder="Group by visible column"
                  ariaLabel="Select group field"
                  searchPlaceholder="Search visible group fields..."
                  noResultsMessage="No visible group fields found."
                  onChange={setDraft}
                />
                <button
                  type="button"
                  aria-label="Clear grouping"
                  disabled={!draft}
                  onClick={() => setDraft(null)}
                  className={`${ORGANIZE_ICON_BUTTON_CLASS} size-9 shrink-0 disabled:cursor-not-allowed disabled:opacity-35`}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>
            )}
          </div>
        </PaletteDrawer>
      )}
    </>
  );
}
