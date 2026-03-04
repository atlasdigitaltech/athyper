"use client";

import { GitBranch, Lock, Plus, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";

import { RelationFormDialog } from "./RelationFormDialog";
import { RelationGraph } from "./RelationGraph";
import { RelationList } from "./RelationList";

import type { RelationDefinition } from "@/lib/schema-manager/types";

import { EmptyState } from "@/components/mesh/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntityRelations } from "@/lib/schema-manager/use-entity-relations";

interface RelationManagerProps {
  entityName: string;
  readonly?: boolean;
}

export function RelationManager({
  entityName,
  readonly,
}: RelationManagerProps) {
  const { relations, loading, error, refresh } = useEntityRelations(entityName);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRelation, setEditingRelation] =
    useState<RelationDefinition | null>(null);

  const handleEdit = useCallback((relation: RelationDefinition) => {
    setEditingRelation(relation);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback((_relation: RelationDefinition) => {
    // TODO: Implement delete with confirmation
  }, []);

  const handleAddNew = useCallback(() => {
    setEditingRelation(null);
    setDialogOpen(true);
  }, []);

  const handleFormSubmit = useCallback(
    (_values: unknown) => {
      // TODO: Call API to create/update relation, then refresh
      refresh();
    },
    [refresh],
  );

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Skeleton className="h-[400px] rounded-md" />
        <Skeleton className="h-[400px] rounded-md" />
      </div>
    );
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
        icon={GitBranch}
        title="No relations defined"
        description={
          readonly
            ? "No relations are defined for this entity."
            : "Add relations to define how this entity connects to others."
        }
        actionLabel={readonly ? undefined : "Add Relation"}
        onAction={readonly ? undefined : handleAddNew}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Relations</h3>
          <Badge variant="secondary" className="text-xs">
            {relations.length}
          </Badge>
          {readonly && (
            <Badge
              variant="outline"
              className="text-xs gap-1 text-muted-foreground"
            >
              <Lock className="size-2.5" />
              Read-only
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-3.5" />
          </Button>
          {!readonly && (
            <Button size="sm" onClick={handleAddNew}>
              <Plus className="mr-1.5 size-3.5" />
              Add Relation
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="rounded-md border h-[500px]">
          <RelationList
            relations={relations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEdit={readonly ? undefined : handleEdit}
            onDelete={readonly ? undefined : handleDelete}
          />
        </div>

        <RelationGraph
          entityName={entityName}
          relations={relations}
          selectedId={selectedId}
        />
      </div>

      {!readonly && (
        <RelationFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          relation={editingRelation}
          onSubmit={handleFormSubmit}
        />
      )}
    </div>
  );
}
