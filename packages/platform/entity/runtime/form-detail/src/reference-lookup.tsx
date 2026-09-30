"use client";
import React from "react";
import type { EntityLookupField } from "@athyper/contract-platform-entity-runtime";
import {
  EntityLookup,
  type EntityLookupAdapters,
  type EntityLookupRow,
} from "./entity-lookup";
/** Reference bindings store keys; labels and row objects remain presentation state. */
export function EntityReferenceLookup({
  field,
  cardinality,
  rows,
  adapters,
  onChange,
  disabled = false,
}: {
  readonly field: EntityLookupField;
  readonly cardinality: "one" | "many";
  readonly rows: readonly EntityLookupRow[];
  readonly adapters: EntityLookupAdapters;
  readonly onChange: (
    value: string | null | readonly string[],
  ) => void | Promise<void>;
  readonly disabled?: boolean;
}) {
  const expected = cardinality === "one" ? "single" : "multiple";
  if (field.lookup.mode !== "choose" || field.lookup.selectionMode !== expected)
    return (
      <p role="alert">
        Reference cardinality does not match lookup selection mode.
      </p>
    );
  return (
    <EntityLookup
      field={field}
      answers={{}}
      adapters={adapters}
      disabled={disabled}
      value={rows}
      onChange={(next) =>
        onChange(
          cardinality === "one"
            ? (next[0]?.id ?? null)
            : next.map((row) => row.id),
        )
      }
    />
  );
}
