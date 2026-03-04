"use client";

import {
  ArrowRight,
  ArrowRightLeft,
  GitBranch,
  Pencil,
  Trash2,
} from "lucide-react";

import type { RelationDefinition } from "@/lib/schema-manager/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { RELATION_TYPE_BADGE } from "@/lib/semantic-colors";

const KIND_LABELS: Record<string, string> = {
  belongs_to: "Belongs To",
  has_many: "Has Many",
  m2m: "Many-to-Many",
};

const DELETE_RULE_LABELS: Record<string, string> = {
  restrict: "RESTRICT",
  cascade: "CASCADE",
  set_null: "SET NULL",
};

interface RelationListProps {
  relations: RelationDefinition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit?: (relation: RelationDefinition) => void;
  onDelete?: (relation: RelationDefinition) => void;
}

export function RelationList({
  relations,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: RelationListProps) {
  // Group by relation kind
  const grouped = new Map<string, RelationDefinition[]>();
  for (const rel of relations) {
    const existing = grouped.get(rel.relationKind) ?? [];
    existing.push(rel);
    grouped.set(rel.relationKind, existing);
  }

  const kindOrder = ["belongs_to", "has_many", "m2m"];

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-1">
        {kindOrder.map((kind) => {
          const group = grouped.get(kind);
          if (!group || group.length === 0) return null;
          const label = KIND_LABELS[kind] ?? kind;
          const badgeColor = RELATION_TYPE_BADGE[kind] ?? "";

          return (
            <div key={kind} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${badgeColor}`}>
                  {label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  ({group.length})
                </span>
              </div>

              {group.map((rel) => (
                <div
                  key={rel.id}
                  className={`group rounded-md border p-3 cursor-pointer transition-colors ${
                    selectedId === rel.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => onSelect(rel.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {kind === "m2m" ? (
                        <ArrowRightLeft className="size-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">
                        {rel.name}
                      </span>
                    </div>
                    {(onEdit || onDelete) && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {onEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(rel);
                            }}
                          >
                            <Pencil className="size-3" />
                          </Button>
                        )}
                        {onDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(rel);
                            }}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <GitBranch className="size-3" />
                      <span className="font-mono">{rel.targetEntity}</span>
                    </div>
                    {rel.fkField && (
                      <div>
                        FK: <span className="font-mono">{rel.fkField}</span>
                      </div>
                    )}
                    <div>
                      ON DELETE:{" "}
                      <span className="font-mono">
                        {DELETE_RULE_LABELS[rel.onDelete] ?? rel.onDelete}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              <Separator />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
