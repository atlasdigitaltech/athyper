import React, { type ReactNode } from "react";
import type {
  JsonValue,
  ListFieldDescriptorV1,
} from "@athyper/contract-platform-entity-list";
import type { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { resolveEntityStatusTone } from "@athyper/contract-platform-entity-runtime";
import { formatFieldValue } from "./field-format";

export function renderFieldValue(
  value: JsonValue | undefined,
  field: ListFieldDescriptorV1,
  query?: string,
  intl?: ReturnType<typeof useEntityI18n>,
  displayLabel?: string,
): ReactNode {
  const display = displayLabel ?? formatFieldValue(value, field, intl),
    highlighted = highlightText(display, query);
  if (field.semanticRole === "status") {
    return (
      <span
        className={`a-entity-list__status a-entity-list__status--${resolveEntityStatusTone(value, field.statusTones)}`}
      >
        <span aria-hidden="true" />
        {highlighted}
      </span>
    );
  }
  return highlighted;
}
export function highlightText(value: string, query?: string): ReactNode {
  const needle = query?.trim();
  if (!needle || needle.length < 2) return value;
  const index = value.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return value;
  return (
    <>
      {value.slice(0, index)}
      <mark>{value.slice(index, index + needle.length)}</mark>
      {value.slice(index + needle.length)}
    </>
  );
}
