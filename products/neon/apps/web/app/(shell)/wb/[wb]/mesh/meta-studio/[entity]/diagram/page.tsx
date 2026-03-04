"use client";

import { Network, RefreshCw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { SchemaERDViewer } from "@/components/mesh/schemas/erd/SchemaERDViewer";
import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntityFields } from "@/lib/schema-manager/use-entity-fields";
import { useEntityRelations } from "@/lib/schema-manager/use-entity-relations";

export default function DiagramPage() {
  const { entity, wb } = useParams<{ entity: string; wb: string }>();
  const router = useRouter();
  const entityName = decodeURIComponent(entity);

  const {
    fields,
    loading: fieldsLoading,
    error: fieldsError,
    refresh: refreshFields,
  } = useEntityFields(entityName);
  const {
    relations,
    loading: relationsLoading,
    error: relationsError,
    refresh: refreshRelations,
  } = useEntityRelations(entityName);

  const loading = fieldsLoading || relationsLoading;
  const error = fieldsError || relationsError;

  const refresh = () => {
    refreshFields();
    refreshRelations();
  };

  if (loading) {
    return <Skeleton className="h-[500px] rounded-md" />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
          <RefreshCw className="mr-1.5 size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (relations.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="No relations defined"
        description="Add relations to this entity to visualize the entity relationship diagram."
        actionLabel="Go to Relations"
        onAction={() =>
          router.push(
            `/wb/${wb}/mesh/meta-studio/${encodeURIComponent(entityName)}/relations`,
          )
        }
      />
    );
  }

  const erdEntity = {
    name: entityName,
    fieldCount: fields.length,
    fields,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Entity Relationship Diagram</h3>
          <Badge variant="outline" className="text-xs">
            {relations.length} relation{relations.length === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {fields.length} field{fields.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {/* Legend */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded bg-blue-700" />
            Current Entity
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded bg-slate-800 border border-slate-600" />
            Related Entity
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-px w-6 bg-blue-500" />
            belongs_to (N:1)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-px w-6 bg-green-500" />
            has_many (1:N)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-px w-6 bg-purple-500" />
            m2m (M:N)
          </span>
        </CardContent>
      </Card>

      <SchemaERDViewer
        entity={erdEntity}
        relations={relations}
        onNodeClick={(name) => {
          if (name !== entityName) {
            router.push(
              `/wb/${wb}/mesh/meta-studio/${encodeURIComponent(name)}/diagram`,
            );
          }
        }}
      />
    </div>
  );
}
