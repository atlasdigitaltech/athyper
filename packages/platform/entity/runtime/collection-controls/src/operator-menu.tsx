"use client";
import React from "react";
import type { ListFilterOperator } from "@athyper/contract-platform-entity-list";
import { CheckIcon, ChevronDownIcon } from "@athyper/platform-icons";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@athyper/platform-ui";

/** Compact operator choice beside a filter's field name. The operator list and
 * its default come from field metadata; with one operator it is plain text. */
export function FilterOperatorMenu({
  label,
  value,
  operators,
  labelFor,
  onChange,
}: {
  /** Accessible name, e.g. "Operator for quick Status filter". */
  readonly label: string;
  readonly value: ListFilterOperator;
  readonly operators: readonly ListFilterOperator[];
  readonly labelFor: (operator: ListFilterOperator) => string;
  readonly onChange: (operator: ListFilterOperator) => void;
}) {
  if (operators.length < 2)
    return <span className="a-filter-operator a-filter-operator--static">{labelFor(value)}</span>;
  return (
    <Menu>
      <MenuTrigger className="a-filter-operator" aria-label={`${label}: ${labelFor(value)}`}>
        <span>{labelFor(value)}</span>
        <ChevronDownIcon size={14} />
      </MenuTrigger>
      <MenuContent portal className="a-filter-operator__menu">
        {operators.map((operator) => (
          <MenuItem
            key={operator}
            aria-current={operator === value ? "true" : undefined}
            onClick={() => onChange(operator)}
          >
            <span>{labelFor(operator)}</span>
            {operator === value ? <CheckIcon size={14} /> : null}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
