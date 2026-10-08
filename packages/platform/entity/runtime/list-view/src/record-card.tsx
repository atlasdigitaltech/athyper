"use client";
import React, { type ReactNode } from "react";
import type {
  EntityListDescriptorV1,
  EntityListRowV1,
  ListFieldDescriptorV1,
} from "@athyper/contract-platform-entity-list";
import type { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { Card } from "@athyper/platform-ui";
import { EntityLink } from "./entity-navigation";
import { formatFieldValue } from "./field-format";
import { highlightText, renderFieldValue } from "./field-value";
import type { CardValueContext } from "./card-renderers";
import type { RecordCardLayout } from "./record-card-layout";

/** Shared record card for every card-based list layout. Row controls are
 * supplied by the owning list so this component stays presentation-only. */
export function EntityRecordCard({
  descriptor,
  layout,
  row,
  query,
  href,
  selection,
  actions,
  context,
  onOpenRecord,
  headingLevel = 2,
  intl,
}: {
  readonly descriptor: EntityListDescriptorV1;
  readonly layout: RecordCardLayout;
  readonly row: EntityListRowV1;
  readonly query?: string;
  readonly href?: string;
  readonly selection?: {
    readonly name?: string;
    readonly type: "radio" | "checkbox";
    readonly checked: boolean;
    readonly onChange: (checked: boolean) => void;
  };
  /** Row-level controls (bookmark, row menu) rendered by the owning list. */
  readonly actions?: ReactNode;
  /** Lane context for value renderers (for example, terminal lanes). */
  readonly context?: CardValueContext;
  readonly onOpenRecord?: (row: EntityListRowV1) => void;
  readonly headingLevel?: 2 | 3;
  readonly intl: ReturnType<typeof useEntityI18n>;
}) {
  const identity = formatFieldValue(
      row.values[descriptor.entity.identityField],
      layout.identity,
      intl,
    ),
    Heading = headingLevel === 3 ? "h3" : "h2",
    open = (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        onOpenRecord &&
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        onOpenRecord(row);
      }
    },
    value = (field: ListFieldDescriptorV1) =>
      renderFieldValue(row.values[field.key], field, query, intl, row.displayValues?.[field.key], context),
    details = (items: readonly ListFieldDescriptorV1[]) => (
      <dl>
        {items.map((field) => (
          <div key={field.key}>
            <dt>{field.label}</dt>
            <dd>{value(field)}</dd>
          </div>
        ))}
      </dl>
    );
  return (
    <Card
      className="a-entity-list__card"
      data-selected={selection?.checked || undefined}
    >
      <div className="a-entity-list__card-header">
        {selection ? (
          <input
            className="a-entity-list__card-select"
            name={selection.name}
            type={selection.type}
            aria-label={intl.message("list.row.selectRecord", { record: identity })}
            checked={selection.checked}
            onChange={(event) => selection.onChange(event.currentTarget.checked)}
          />
        ) : null}
        <div className="a-entity-list__card-heading">
          <Heading>
            {href ? (
              <EntityLink
                className="a-entity-list__record-link"
                href={href}
                onClick={open}
              >
                {highlightText(identity, query)}
              </EntityLink>
            ) : (
              highlightText(identity, query)
            )}
          </Heading>
          {layout.title ? (
            <div className="a-entity-list__card-title">{value(layout.title)}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="a-entity-list__card-actions">{actions}</div>
        ) : null}
      </div>
      {layout.status ? (
        <div className="a-entity-list__card-status">{value(layout.status)}</div>
      ) : null}
      {layout.body.length ? details(layout.body) : null}
      {layout.more.length ? (
        <details className="a-entity-list__card-more">
          <summary>
            {intl.message("list.card.moreFields", { count: layout.more.length })}
          </summary>
          {details(layout.more)}
        </details>
      ) : null}
    </Card>
  );
}
