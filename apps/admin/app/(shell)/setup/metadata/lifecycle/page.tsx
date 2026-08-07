"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, StatePanel } from "@athyper/platform-surface-kit";
import {
  Badge,
  Button,
  DataTable,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ColumnDef,
} from "@athyper/platform-ui";
import type { LifecycleBinding } from "../[entityId]/_components/types";

interface EntityCatalogueItem {
  id: string;
  name: string;
  label_singular: string | null;
}

export default function LifecycleBindingsPage() {
  const [bindings, setBindings] = useState<LifecycleBinding[]>([]);
  const [entities, setEntities] = useState<EntityCatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = entityFilter === "all" ? "" : `?entity=${encodeURIComponent(entityFilter)}`;
      const [bindingResponse, entityResponse] = await Promise.all([
        fetch(`/api/relay/metadata/admin/lifecycle-bindings${query}`),
        fetch("/api/relay/metadata/admin/entities"),
      ]);
      if (bindingResponse.ok) {
        setBindings(((await bindingResponse.json()) as { items: LifecycleBinding[] }).items);
      }
      if (entityResponse.ok) {
        setEntities(((await entityResponse.json()) as { items: EntityCatalogueItem[] }).items);
      }
    } finally {
      setLoading(false);
    }
  }, [entityFilter]);

  useEffect(() => { void load(); }, [load]);

  const columns: ColumnDef<LifecycleBinding>[] = [
    {
      id: "entity",
      header: "Entity",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.entity_name}</span>,
    },
    {
      id: "lifecycle",
      header: "Lifecycle",
      cell: ({ row }) => (
        <div>
          <div className="font-mono text-xs">{row.original.lifecycle_code ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{row.original.lifecycle_name ?? ""}</div>
        </div>
      ),
    },
    {
      id: "priority",
      header: "Priority",
      cell: ({ row }) => <span className="tabular-nums text-sm">{row.original.priority}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.lifecycle_status === "active" ? "default" : "outline"}>
          {row.original.lifecycle_status ?? "—"}
        </Badge>
      ),
    },
    {
      id: "conditions",
      header: "Conditions",
      cell: ({ row }) => <code className="text-xs">{row.original.conditions ? JSON.stringify(row.original.conditions).slice(0, 50) : "none"}</code>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const entity = entities.find((item) => item.name === row.original.entity_name);
        return entity ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/setup/metadata/${entity.id}#lifecycle`}>Open Studio</Link>
          </Button>
        ) : null;
      },
    },
  ];

  const entityNames = [...new Set(entities.map((entity) => entity.name))].sort();

  return (
    <PageFrame
      eyebrow="Meta Studio"
      title="Lifecycle bindings"
      description={`${bindings.length} compiled bindings · read-only catalog`}
    >
      <div className="pb-3">
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="h-8 w-56 text-sm"><SelectValue placeholder="All entities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {entityNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {loading ? (
        <StatePanel title="Loading…" message="Fetching lifecycle bindings." />
      ) : bindings.length === 0 ? (
        <StatePanel title="No bindings" message="No lifecycle bindings found." />
      ) : (
        <DataTable columns={columns} data={bindings} />
      )}
    </PageFrame>
  );
}
