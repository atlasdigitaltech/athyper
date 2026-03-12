"use client";

import { use } from "react";
import { Cog, Layers, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export default function OperationsPage({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = use(params);
  const entityName = decodeURIComponent(entity);

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Operations</h2>
        <p className="text-sm text-muted-foreground">
          Define meta-entity operations for <span className="font-medium">{entityName}</span> based
          on <code className="text-xs bg-muted px-1 py-0.5 rounded">core.operation</code> and{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">core.operation_category</code>.
        </p>
      </div>

      {/* Placeholder cards showing future operation categories */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Play,
            title: "Entity Actions",
            desc: "Create, update, delete, archive, restore and custom business actions.",
            count: 0,
          },
          {
            icon: Layers,
            title: "Bulk Operations",
            desc: "Mass update, bulk import/export, batch processing workflows.",
            count: 0,
          },
          {
            icon: Cog,
            title: "System Operations",
            desc: "Compile, publish, validate, sync, and administrative operations.",
            count: 0,
          },
        ].map((cat) => (
          <div
            key={cat.title}
            className="rounded-lg border bg-card p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              <cat.icon className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{cat.title}</span>
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {cat.count}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{cat.desc}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Operation management is coming soon. Operations will be linked to{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">meta.entity_operation</code>{" "}
          records and support configurable execution pipelines.
        </p>
      </div>
    </div>
  );
}
