import type { EntityListDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { Button, Drawer, Label, Select } from "@athyper/platform-ui";
import { useEffect, useState } from "react";

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
  const [draft, setDraft] = useState(group ?? "");
  const fields = descriptor.fields.filter((field) => field.groupable);
  useEffect(() => {
    if (open) setDraft(group ?? "");
  }, [open, group]);
  const selected = fields.find((field) => field.key === draft);
  const dirty = draft !== (group ?? "");
  return (
    <>
      <Drawer.Toolbar>
        <Drawer.Context aria-label="Grouping context">
          <Drawer.Metric label="Groupable fields" value={fields.length} />
          <Drawer.Metric
            label="Current grouping"
            value={
              group
                ? (fields.find((field) => field.key === group)?.label ?? group)
                : "None"
            }
          />
          <Drawer.Metric label="Selected" value={selected?.label ?? "None"} />
        </Drawer.Context>
      </Drawer.Toolbar>
      <Drawer.Body>
        {fields.length ? (
          <div className="a-entity-list__group-settings">
            <Label>
              <span>Grouping field</span>
              <Select
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
              >
                <option value="">No grouping</option>
                {fields.map((field) => (
                  <option value={field.key} key={field.key}>
                    {field.label}
                  </option>
                ))}
              </Select>
            </Label>
            <p>
              Grouping changes presentation only; it does not change the
              authorized result set.
            </p>
          </div>
        ) : (
          <div className="a-entity-list__dialog-empty">
            This entity does not publish any groupable fields.
          </div>
        )}
      </Drawer.Body>
      <Drawer.Footer>
        <Drawer.FooterSummary>
          <strong>
            {dirty
              ? "Changes ready to apply"
              : selected
                ? `Grouped by ${selected.label}`
                : "No grouping applied"}
          </strong>
          <span>Records will remain in the current authorized list.</span>
        </Drawer.FooterSummary>
        <Drawer.FooterActions>
          <Button
            variant="ghost"
            size="small"
            disabled={!draft}
            onClick={() => setDraft("")}
          >
            Reset grouping
          </Button>
          <Drawer.Close className="a-button a-button--secondary a-button--small">
            Cancel
          </Drawer.Close>
          <Button
            size="small"
            disabled={!dirty}
            onClick={() => {
              onApply(draft || undefined);
              onOpenChange(false);
            }}
          >
            Apply grouping
          </Button>
        </Drawer.FooterActions>
      </Drawer.Footer>
    </>
  );
}
