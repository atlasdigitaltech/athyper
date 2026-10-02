"use client";
import React, { useRef, useState, type ReactNode } from "react";
import type {
  ListFieldDescriptorV1,
  ListFilterOperator,
} from "@athyper/contract-platform-entity-list";
import { FilterIcon, PlusIcon, TrashIcon } from "@athyper/platform-icons";
import {
  Button,
  ChoiceSelect,
  Drawer,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@athyper/platform-ui";
import { FilterValueEditor } from "./filter-editor";
import { FilterOperatorMenu } from "./operator-menu";

/** One filter being edited. Values stay as typed text until the host applies. */
export interface CollectionFilterDraft {
  readonly id: string;
  readonly field: string;
  readonly operator: ListFilterOperator;
  readonly value: string;
}

const valueless = (operator: ListFilterOperator) =>
  operator === "is_null" || operator === "is_not_null";

/** People read operators as words; dates read as "On or after", not "At least". */
export function filterOperatorLabel(
  operator: ListFilterOperator,
  field?: Pick<ListFieldDescriptorV1, "valueKind">,
): string {
  if (field && (field.valueKind === "date" || field.valueKind === "datetime")) {
    const label = {
      eq: field.valueKind === "date" ? "On" : "At",
      ne: field.valueKind === "date" ? "Not on" : "Not at",
      gt: "After",
      gte: "On or after",
      lt: "Before",
      lte: "On or before",
    }[operator as "eq"];
    if (label) return label;
  }
  return (
    {
      eq: "Equals",
      ne: "Does not equal",
      in: "Any of",
      contains: "Contains",
      starts_with: "Starts with",
      gt: "Greater than",
      gte: "At least",
      lt: "Less than",
      lte: "At most",
      between: "Between",
      is_null: "Is empty",
      is_not_null: "Is not empty",
      relative: "Relative period",
    } as Record<string, string>
  )[operator] ?? operator;
}

/** The Filters section every collection uses: Quick filters for the fields its
 * metadata promotes, All filters for the rest. Field, operator and value
 * choices come only from the supplied field metadata; the host owns applying. */
export function CollectionFilterEditor({
  fields,
  quickKeys,
  draft,
  onDraftChange,
  historyKey,
  footer,
}: {
  /** Filterable fields with their published operators and choices. */
  readonly fields: readonly ListFieldDescriptorV1[];
  /** Fields shown under Quick filters, in order. */
  readonly quickKeys: readonly string[];
  readonly draft: readonly CollectionFilterDraft[];
  readonly onDraftChange: (draft: readonly CollectionFilterDraft[]) => void;
  /** Enables recent values for this collection. */
  readonly historyKey?: string;
  /** The section's CollectionDraftFooter. */
  readonly footer: ReactNode;
}) {
  const quick = quickKeys
    .map((key) => fields.find((field) => field.key === key))
    .filter((field): field is ListFieldDescriptorV1 => Boolean(field?.filterOperators.length));
  const [tab, setTab] = useState<"common" | "all">(quick.length ? "common" : "all");
  const [quickOperators, setQuickOperators] = useState<Record<string, ListFilterOperator>>({});
  const sequence = useRef(0);
  const nextId = () => `filter-${++sequence.current}`;
  const quickSet = new Set(quick.map((field) => field.key));
  const additional = draft.filter((item) => !quickSet.has(item.field)).length;
  const remaining = fields.filter((field) => !draft.some((item) => item.field === field.key));
  const replace = (item: CollectionFilterDraft, next: CollectionFilterDraft) =>
    onDraftChange(draft.map((candidate) => (candidate.id === item.id ? next : candidate)));
  const setQuick = (field: ListFieldDescriptorV1, operator: ListFilterOperator, value: string) => {
    const existing = draft.find((item) => item.field === field.key);
    if (existing) {
      if (!value && !valueless(operator))
        onDraftChange(draft.filter((item) => item.id !== existing.id));
      else replace(existing, { ...existing, operator, value });
    } else if (value || valueless(operator))
      onDraftChange([...draft, { id: nextId(), field: field.key, operator, value }]);
  };
  return (
    <Drawer.Tabs value={tab} onValueChange={(value) => setTab(value === "all" ? "all" : "common")}>
      <Drawer.Navigation aria-label="Filter views">
        <Drawer.TabList>
          <Drawer.Tab value="common">Quick filters</Drawer.Tab>
          <Drawer.Tab value="all">All filters{draft.length ? ` · ${draft.length}` : ""}</Drawer.Tab>
        </Drawer.TabList>
      </Drawer.Navigation>
      <Drawer.Body className="a-entity-list__filter-content">
        <Drawer.TabPanel value="common" mount="lazy">
          <div className="a-entity-list__quick-filters">
            {quick.length ? (
              <div className="a-entity-list__filter-list a-entity-list__filter-list--quick">
                <div className="a-entity-list__filter-header" aria-hidden="true">
                  <span>Field</span>
                  <span>Operator</span>
                  <span>Value</span>
                </div>
                {quick.map((field, index) => {
                  const existing = draft.find((item) => item.field === field.key),
                    operator = existing?.operator ?? quickOperators[field.key] ?? field.filterOperators[0]!;
                  return (
                    <div className="a-entity-list__filter-row" key={field.key}>
                      <div className="a-entity-list__filter-heading">
                        <strong>{field.label}</strong>
                        <FilterOperatorMenu
                          label={`Operator for quick ${field.label} filter`}
                          value={operator}
                          operators={field.filterOperators}
                          labelFor={(candidate) => filterOperatorLabel(candidate, field)}
                          onChange={(next) => {
                            setQuickOperators({ ...quickOperators, [field.key]: next });
                            setQuick(field, next, "");
                          }}
                        />
                      </div>
                      <FilterValueEditor
                        historyKey={historyKey}
                        field={field}
                        operator={operator}
                        value={existing?.value ?? ""}
                        filterNumber={index + 1}
                        onChange={(next) => setQuick(field, operator, next)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="a-entity-list__filter-guidance">
                No quick filters are published for this collection. Use All filters to choose from every filterable field.
              </p>
            )}
            {additional ? (
              <p className="a-entity-list__additional-filters">
                {additional} additional {additional === 1 ? "filter is" : "filters are"} configured under{" "}
                <button type="button" onClick={() => setTab("all")}>All filters</button>.
              </p>
            ) : null}
          </div>
        </Drawer.TabPanel>
        <Drawer.TabPanel value="all" mount="lazy">
          <div className="a-entity-list__advanced-filters">
            <div className="a-entity-list__dialog-body">
              {draft.length ? (
                <div className="a-entity-list__filter-list">
                  <div className="a-entity-list__filter-header" aria-hidden="true">
                    <span>Field</span>
                    <span>Operator</span>
                    <span>Value</span>
                    <span>Action</span>
                  </div>
                  {draft.map((item, index) => {
                    const field = fields.find((candidate) => candidate.key === item.field) ?? fields[0];
                    const available = fields.filter(
                      (candidate) => candidate.key === item.field || !draft.some((active) => active.field === candidate.key),
                    );
                    return (
                      <div className="a-entity-list__filter-row" key={item.id}>
                        <div className="a-entity-list__filter-control">
                          <span className="a-entity-list__filter-label">Field</span>
                          <ChoiceSelect
                            label={`Field for filter ${index + 1}`}
                            value={item.field}
                            options={available.map((candidate) => ({ value: candidate.key, label: candidate.label }))}
                            onChange={(key) => {
                              const selected = fields.find((candidate) => candidate.key === key);
                              if (selected)
                                replace(item, { ...item, field: selected.key, operator: selected.filterOperators[0]!, value: "" });
                            }}
                          />
                        </div>
                        <div className="a-entity-list__filter-control a-entity-list__filter-operator-control">
                          <span className="a-entity-list__filter-label">Operator</span>
                          <FilterOperatorMenu
                            label={`Operator for ${field?.label ?? `filter ${index + 1}`}`}
                            value={item.operator}
                            operators={field?.filterOperators ?? []}
                            labelFor={(operator) => filterOperatorLabel(operator, field)}
                            onChange={(operator) => replace(item, { ...item, operator, value: "" })}
                          />
                        </div>
                        {field ? (
                          <FilterValueEditor
                            historyKey={historyKey}
                            field={field}
                            operator={item.operator}
                            value={item.value}
                            filterNumber={index + 1}
                            onChange={(value) => replace(item, { ...item, value })}
                          />
                        ) : (
                          <span />
                        )}
                        <Button
                          className="a-entity-list__filter-remove"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${field?.label ?? "filter"}`}
                          title={`Remove ${field?.label ?? "filter"}`}
                          onClick={() => onDraftChange(draft.filter((candidate) => candidate.id !== item.id))}
                        >
                          <TrashIcon size={17} />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="a-entity-list__filter-builder-empty">
                  <span aria-hidden="true">
                    <FilterIcon />
                  </span>
                  <strong>No filters configured</strong>
                  <p>Add a filter to narrow the authorized result set.</p>
                </div>
              )}
              <Menu>
                <MenuTrigger variant="secondary" className="a-button--small" disabled={!remaining.length}>
                  <PlusIcon size={16} />
                  Add filter
                </MenuTrigger>
                <MenuContent portal>
                  {remaining.map((field) => (
                    <MenuItem
                      key={field.key}
                      onClick={() =>
                        onDraftChange([
                          ...draft,
                          { id: nextId(), field: field.key, operator: field.filterOperators[0]!, value: "" },
                        ])
                      }
                    >
                      {field.label}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            </div>
          </div>
        </Drawer.TabPanel>
      </Drawer.Body>
      {footer}
    </Drawer.Tabs>
  );
}
