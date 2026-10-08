import type { EntityListDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { ENTITY_LIST_MAX_GROUP_LEVELS } from "@athyper/contract-platform-entity-list";
import { Button, Drawer } from "@athyper/platform-ui";
import { SearchableFieldSelect } from "../field-catalogue";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import React, { useEffect, useState } from "react";

/** Metadata-driven grouping control for up to three levels (Tree blueprint
 * section 5.1). Only fields the server publishes as groupable for this viewer
 * are offered; it never alters the authorized query. */
export function GroupDialog({
  open,
  onOpenChange,
  descriptor,
  groups,
  onApply,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly descriptor: EntityListDescriptorV1;
  readonly groups?: readonly string[];
  readonly onApply: (groups?: readonly string[]) => void;
}) {
  const intl = useEntityI18n();
  const [draft, setDraft] = useState<readonly string[]>(groups ?? []);
  const fields = descriptor.fields.filter((field) => field.groupable);
  useEffect(() => {
    if (open) setDraft(groups ?? []);
  }, [open, groups]);
  const dirty = draft.join(",") !== (groups ?? []).join(",");
  const labels = draft.map((key) => fields.find((field) => field.key === key)?.label ?? key);
  // Level n is offered once level n-1 is chosen; a cleared level drops the
  // levels after it, so the list stays ordered and dense.
  const levels = Math.min(ENTITY_LIST_MAX_GROUP_LEVELS, draft.length + 1, fields.length);
  const choose = (level: number, key?: string) =>
    setDraft((current) => (key ? [...current.slice(0, level), key] : current.slice(0, level)));
  return (
    <>
      <Drawer.Body>
        {fields.length ? (
          <div className="a-entity-list__group-settings">
            {Array.from({ length: levels }, (_, level) => {
              const label = intl.message(level ? "list.group.thenBy" : "collection.group.field");
              return (
                <div className="a-label" key={level}>
                  <span aria-hidden="true">{label}</span>
                  <SearchableFieldSelect
                    label={label}
                    fields={fields.filter((field) => field.key === draft[level] || !draft.includes(field.key))}
                    value={draft[level] ?? ""}
                    required={false}
                    placeholder={intl.message("collection.group.none")}
                    onChange={(field) => choose(level, field.key)}
                    onClear={() => choose(level)}
                  />
                </div>
              );
            })}
            <p>{intl.message("collection.group.note")}</p>
          </div>
        ) : (
          <div className="a-entity-list__dialog-empty">{intl.message("collection.group.empty")}</div>
        )}
      </Drawer.Body>
      <Drawer.Footer>
        {dirty ? (
          <Drawer.FooterSummary>
            <strong>
              {labels.length
                ? intl.message("list.footer.groupReady", { field: labels.join(" › ") })
                : intl.message("list.footer.groupCleared")}
            </strong>
          </Drawer.FooterSummary>
        ) : null}
        <Drawer.FooterActions>
          <Button variant="ghost" size="small" disabled={!draft.length} onClick={() => setDraft([])}>
            {intl.message("collection.group.reset")}
          </Button>
          <Button
            size="small"
            disabled={!dirty}
            onClick={() => {
              onApply(draft.length ? draft : undefined);
              onOpenChange(false);
            }}
          >
            {intl.message("collection.group.apply")}
          </Button>
        </Drawer.FooterActions>
      </Drawer.Footer>
    </>
  );
}
