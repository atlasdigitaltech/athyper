"use client";

import { useState, useEffect, useCallback } from "react";
import { PageFrame, StatePanel } from "@athyper/surface-kit";
import { DataTable, Badge, Button, Switch, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@athyper/ui";
import { csrfFetch } from "@/lib/bff-fetch";
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
  const [deleting, setDeleting] = useState<string | null>(null);

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

  async function toggleEnabled(op: EntityOperation) {
    const res = await csrfFetch(`/api/relay/metadata/admin/entity-operations/${op.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: !op.is_enabled }),
    });
    if (res.ok) setOps((prev) => prev.map((o) => o.id === op.id ? { ...o, is_enabled: !op.is_enabled } : o));
  }

  async function deleteOp(id: string) {
    await csrfFetch(`/api/relay/metadata/admin/entity-operations/${id}`, { method: "DELETE" });
    setOps((prev) => prev.filter((o) => o.id !== id));
    setDeleting(null);
  }

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
      cell: ({ row }) => (
        <Switch checked={row.original.is_enabled} onCheckedChange={() => void toggleEnabled(row.original)} />
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => setDeleting(row.original.id)}>
          Delete
        </Button>
      ),
    },
  ];

  const entityNames = [...new Set(entities.map((e) => e.name))].sort();

  return (
    <PageFrame
      eyebrow="Meta Studio"
      title="Entity operations"
      description={`${filtered.length} operations`}
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

      {deleting && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete operation?</AlertDialogTitle>
              <AlertDialogDescription>This entity operation will be permanently deleted.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void deleteOp(deleting)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </PageFrame>
  );
}
