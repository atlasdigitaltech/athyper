"use client";

import { useState } from "react";
import { Badge, DataTable, Input, Label, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@athyper/ui";
import type { ColumnDef } from "@athyper/ui";
import type { EntityField } from "./types";

function TypeBadge({ type }: { type: string }) {
  return <span className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">{type}</span>;
}

function JsonValue({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <pre className="max-h-48 overflow-auto rounded border bg-muted/30 p-2 text-xs">{JSON.stringify(value ?? {}, null, 2)}</pre>
    </div>
  );
}

export function FieldBrowser({ fields: initialFields }: { fields: EntityField[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<EntityField | null>(null);
  const fields = query.trim()
    ? initialFields.filter((field) => `${field.name} ${field.label ?? ""} ${field.data_type}`.toLowerCase().includes(query.toLowerCase()))
    : initialFields;

  const columns: ColumnDef<EntityField>[] = [
    { id: "name", accessorKey: "name", header: "Name", cell: ({ row }) => <span className="font-mono text-xs">{row.original.name}</span> },
    { id: "label", accessorKey: "label", header: "Label", cell: ({ row }) => <span className="text-sm">{row.original.label ?? "-"}</span> },
    { id: "type", accessorKey: "data_type", header: "Type", cell: ({ row }) => <TypeBadge type={row.original.data_type} /> },
    {
      id: "semantics",
      header: "Semantics",
      cell: ({ row }) => <div className="flex flex-wrap gap-1">{(row.original.semantic_roles ?? []).map((role) => <Badge key={role} variant="secondary" className="font-mono text-xs">{role}</Badge>)}</div>,
    },
    {
      id: "query",
      header: "Query",
      cell: ({ row }) => <div className="flex gap-1">{row.original.is_filterable && <Badge variant="outline" className="text-xs">filter</Badge>}{row.original.is_sortable && <Badge variant="outline" className="text-xs">sort</Badge>}{row.original.is_required && <Badge variant="outline" className="text-xs">required</Badge>}</div>,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-medium">Canonical field definitions</p><p className="text-xs text-muted-foreground">Read-only here. Edit fields in the complete Contract v2 DRAFT graph.</p></div>
        <Input className="max-w-xs" placeholder="Search fields" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <DataTable columns={columns} data={fields} onRowClick={(row) => setSelected(row)} />
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">{selected?.name}</SheetTitle>
            <SheetDescription>Field semantics are owned by the Contract v2 fields section.</SheetDescription>
          </SheetHeader>
          {selected && <div className="mt-5 space-y-4">
            <div className="grid gap-3 rounded border p-3 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Type</p><TypeBadge type={selected.data_type} /></div><div><p className="text-xs text-muted-foreground">Cardinality</p><p className="text-sm">{selected.cardinality ?? "one"}</p></div><div><p className="text-xs text-muted-foreground">Origin</p><p className="text-sm">{selected.origin}</p></div></div>
            <JsonValue label="Semantic roles" value={selected.semantic_roles ?? []} />
            <JsonValue label="Type configuration" value={selected.type_config ?? { kind: "scalar" }} />
            <JsonValue label="Defaults" value={selected.defaults ?? selected.default_value} />
          </div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
