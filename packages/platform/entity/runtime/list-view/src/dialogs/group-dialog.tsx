import type { EntityListDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { Button, Drawer } from "@athyper/platform-ui";
import { CollectionGroupEditor } from "@athyper/platform-collection-controls";
import { SearchableFieldSelect } from "../field-catalogue";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import React, { useEffect, useState } from "react";

/** Metadata-driven grouping control; it never alters the authorized query. */
export function GroupDialog({
  open,
  onOpenChange,
  descriptor,
  group,
  onApply,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly descriptor: EntityListDescriptorV1;
  readonly group?: string;
  readonly onApply: (group?: string) => void;
}) {
  const intl = useEntityI18n();
  const [draft, setDraft] = useState(group ?? "");
  const fields = descriptor.fields.filter((field) => field.groupable);
  useEffect(() => {
    if (open) setDraft(group ?? "");
  }, [open, group]);
  const selected = fields.find((field) => field.key === draft);
  const dirty = draft !== (group ?? "");
  return (
    <>
      {/* The shared Group by section (same as Notifications and Inbox), with the
          list's searchable, clearable field picker. */}
      <CollectionGroupEditor
        fields={fields}
        value={draft || undefined}
        onChange={(next) => setDraft(next ?? "")}
        fieldSelect={
          <SearchableFieldSelect
            label={intl.message("collection.group.field")}
            fields={fields}
            value={draft}
            required={false}
            placeholder={intl.message("collection.group.none")}
            onChange={(field) => setDraft(field.key)}
            onClear={() => setDraft("")}
          />
        }
        footer={
      <Drawer.Footer>
        {dirty ? (
          <Drawer.FooterSummary>
            <strong>
              {selected
                ? intl.message("list.footer.groupReady", { field: selected.label })
                : intl.message("list.footer.groupCleared")}
            </strong>
          </Drawer.FooterSummary>
        ) : null}
        <Drawer.FooterActions>
          <Button
            variant="ghost"
            size="small"
            disabled={!draft}
            onClick={() => setDraft("")}
          >
            {intl.message("collection.group.reset")}
          </Button>
          <Button
            size="small"
            disabled={!dirty}
            onClick={() => {
              onApply(draft || undefined);
              onOpenChange(false);
            }}
          >
            {intl.message("collection.group.apply")}
          </Button>
        </Drawer.FooterActions>
      </Drawer.Footer>
        }
      />
    </>
  );
}
