"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageFrame, StatePanel } from "@athyper/platform-surface-kit";
import { DataTable, Badge, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@athyper/platform-ui";
import type { ColumnDef } from "@athyper/platform-ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntityRow {
  id: string;
  name: string;
  entity_code: string | null;
  entity_short: string | null;
  label_singular: string | null;
  label_plural: string | null;
  entity_class: string;
  module_id: string;
  kind: string | null;
  ownership_model: string | null;
  icon_key: string | null;
  color_token: string | null;
  status: string;
  field_count: number;
  runtime_enabled: boolean;
  primary_key: string | null;
  tenant_column: string | null;
  read_capability: string;
  write_capability: string;
}

// ─── Entity class badge colours ───────────────────────────────────────────────

const CLASS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  MASTER: "default",
  DOCUMENT: "secondary",
  CONTROL: "outline",
  REFERENCE: "outline",
  LOG: "secondary",
  ANALYTICS: "default",
};

const CLASS_LABEL: Record<string, string> = {
  MASTER: "Master",
  DOCUMENT: "Document",
  CONTROL: "Control",
  REFERENCE: "Reference",
  LOG: "Log",
  ANALYTICS: "Analytics",
};

const ENTITY_CLASSES = ["MASTER", "DOCUMENT", "CONTROL", "REFERENCE", "LOG", "ANALYTICS"];

// ─── Columns ─────────────────────────────────────────────────────────────────

const columns: ColumnDef<EntityRow>[] = [
  {
    id: "entity_code",
    accessorKey: "entity_code",
    header: "Code",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.entity_code ?? row.original.name}
      </span>
    ),
  },
  {
    id: "label",
    accessorKey: "label_singular",
    header: "Label",
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.label_singular ?? row.original.name}
      </span>
    ),
  },
  {
    id: "entity_class",
    accessorKey: "entity_class",
    header: "Class",
    cell: ({ row }) => (
      <Badge variant={CLASS_VARIANT[row.original.entity_class] ?? "outline"}>
        {CLASS_LABEL[row.original.entity_class] ?? row.original.entity_class}
      </Badge>
    ),
  },
  {
    id: "module_id",
    accessorKey: "module_id",
    header: "Module",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.module_id}</span>
    ),
  },
  {
    id: "field_count",
    accessorKey: "field_count",
    header: "Fields",
    cell: ({ row }) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {row.original.field_count}
      </span>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.status === "ACTIVE" ? "default" : "outline"}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    id: "runtime_enabled",
    accessorKey: "runtime_enabled",
    header: "API",
    cell: ({ row }) => (
      <Badge variant={row.original.runtime_enabled ? "default" : "outline"}>
        {row.original.runtime_enabled ? "Execution" : "Catalog"}
      </Badge>
    ),
  },
  {
    id: "write_capability",
    accessorKey: "write_capability",
    header: "Write",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.write_capability}</span>,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MetadataEntitiesPage() {
  const router = useRouter();
  const [items, setItems] = useState<EntityRow[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");

  const fetchEntities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (moduleFilter !== "all") params.set("module", moduleFilter);
      if (classFilter !== "all") params.set("entity_class", classFilter);
      // q is client-filtered after fetch for speed
      const res = await fetch(`/api/relay/metadata/admin/entities?${params.toString()}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { items: EntityRow[] };
      setItems(data.items);
      const allModules = [...new Set(data.items.map((e) => e.module_id))].sort();
      setModules(allModules);
    } catch {
      setError("Failed to load entities.");
    } finally {
      setLoading(false);
    }
  }, [moduleFilter, classFilter]);

  useEffect(() => { void fetchEntities(); }, [fetchEntities]);

  const filtered = q.trim()
    ? items.filter((e) => {
        const qLow = q.toLowerCase();
        return (
          e.name.toLowerCase().includes(qLow) ||
          (e.entity_code ?? "").toLowerCase().includes(qLow) ||
          (e.label_singular ?? "").toLowerCase().includes(qLow)
        );
      })
    : items;

  return (
    <PageFrame eyebrow="Meta Studio" title="Entities" description={`${filtered.length} platform entities`}>
      <div className="flex flex-wrap gap-2 pb-2">
        <Input
          className="h-8 w-56 text-sm"
          placeholder="Search code or label…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="All modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {modules.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue placeholder="All classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {ENTITY_CLASSES.map((c) => (
              <SelectItem key={c} value={c}>{CLASS_LABEL[c] ?? c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <StatePanel title="Failed to load" message={error} />
      ) : loading ? (
        <StatePanel title="Loading…" message="Fetching entity registry." />
      ) : filtered.length === 0 ? (
        <StatePanel title="No entities" message="No entities match the current filters." />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={(row) => router.push(`/setup/metadata/${row.id}`)}
        />
      )}
    </PageFrame>
  );
}
