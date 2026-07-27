"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageFrame, StatePanel } from "@athyper/surface-kit";
import { DataTable, Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@athyper/ui";
import type { ColumnDef } from "@athyper/ui";
import type { EntityOperation } from "../[entityId]/_components/types";

interface EntityCatalogueItem {
  id: string;
  name: string;
  label_singular: string | null;
  entity_class: string;
  module_id: string;
}

export default function EntityOperationsPage() {
  const [ops, setOps] = useState<EntityOperation[]>([]);
  const [entities, setEntities] = useState<EntityCatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState("all");
  const [surfaceFilter, setSurfaceFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityFilter !== "all") params.set("entity", entityFilter);
      const [oRes, eRes] = await Promise.all([
        fetch(`/api/relay/metadata/admin/entity-operations?${params.toString()}`),
        fetch("/api/relay/metadata/admin/entities"),
      ]);
      if (oRes.ok) setOps(((await oRes.json()) as { items: EntityOperation[] }).items);
      if (eRes.ok) setEntities(((await eRes.json()) as { items: EntityCatalogueItem[] }).items);
    } finally {
      setLoading(false);
    }
  }, [entityFilter]);

  useEffect(() => { void load(); }, [load]);

  const filtered = surfaceFilter === "all" ? ops : ops.filter((o) => o.surface === surfaceFilter);

  const columns: ColumnDef<EntityOperation>[] = [
    {
      id: "entity_name",
      header: "Entity",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.entity_name}</span>,
    },
    {
      id: "permission_code",
      header: "Permission",
      cell: ({ row }) => (
        <div>
          <div className="font-mono text-xs">{row.original.permission_code}</div>
          {row.original.permission_label && <div className="text-xs text-muted-foreground">{row.original.permission_label}</div>}
        </div>
      ),
    },
    {
      id: "surface",
      header: "Surface",
      cell: ({ row }) => <Badge variant="outline" className="text-xs">{row.original.surface}</Badge>,
    },
    {
      id: "placement",
      header: "Placement",
      cell: ({ row }) => <Badge variant="outline" className="text-xs">{row.original.placement}</Badge>,
    },
    {
      id: "handler",
      header: "Handler",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.handler_type}{row.original.handler_target ? ` → ${row.original.handler_target}` : ""}
        </span>
      ),
    },
    {
      id: "label_override",
      header: "Label override",
      cell: ({ row }) => <span className="text-xs">{row.original.label_override ?? "—"}</span>,
    },
    {
      id: "sort_order",
      header: "Order",
      cell: ({ row }) => <span className="tabular-nums text-sm">{row.original.sort_order}</span>,
    },
    {
      id: "enabled",
      header: "Enabled",
      cell: ({ row }) => <Badge variant={row.original.is_enabled ? "default" : "outline"}>{row.original.is_enabled ? "Enabled" : "Disabled"}</Badge>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const entity = entities.find((item) => item.name === row.original.entity_name);
        return entity ? <Button asChild variant="ghost" size="sm"><Link href={`/setup/metadata/${entity.id}#operations`}>Open Studio</Link></Button> : null;
      },
    },
  ];

  const entityNames = [...new Set(entities.map((e) => e.name))].sort();

  return (
    <PageFrame
      eyebrow="Meta Studio"
      title="Entity operations"
      description={`${filtered.length} compiled operations · read-only catalog`}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="h-8 w-52 text-sm"><SelectValue placeholder="All entities" /></SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            <SelectItem value="all">All entities</SelectItem>
            {entityNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={surfaceFilter} onValueChange={setSurfaceFilter}>
          <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="All surfaces" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All surfaces</SelectItem>
            <SelectItem value="LIST">List</SelectItem>
            <SelectItem value="DETAIL">Detail</SelectItem>
            <SelectItem value="BOTH">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <StatePanel title="Loading…" message="Fetching entity operations." />
      ) : filtered.length === 0 ? (
        <StatePanel title="No operations" message="No operations match the current filters." />
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}
    </PageFrame>
  );
}
