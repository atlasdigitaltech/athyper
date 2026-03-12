"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, GripVertical, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { FieldTypeIcon } from "./FieldTypeIcon";

import type { FieldDefinition } from "@/lib/schema-manager/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FIELD_ATTR_BADGE, FIELD_ORIGIN_BADGE } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

interface FieldRowProps {
  field: FieldDefinition;
  onEdit?: (field: FieldDefinition) => void;
  onDelete?: (field: FieldDefinition) => void;
  onDeprecate?: (field: FieldDefinition) => void;
}

export function FieldRow({ field, onEdit, onDelete, onDeprecate }: FieldRowProps) {
  const isSystem = field.origin === "system";

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-3 border-b last:border-b-0 px-3 py-2.5 transition-colors",
        isDragging && "z-10 shadow-lg bg-card rounded-md border",
        isSystem && "bg-muted/30",
        field.isDeprecated && "opacity-60",
        !isDragging && "hover:bg-muted/20",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground"
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>

      <FieldTypeIcon dataType={field.dataType} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {field.label ?? field.name}
          </span>
          {field.label && (
            <span className="text-xs text-muted-foreground truncate">
              {field.name}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Badge variant="outline" className="text-xs font-mono">
          {field.dataType}
        </Badge>
        {field.isRequired && (
          <Badge
            variant="outline"
            className={cn("text-xs", FIELD_ATTR_BADGE.required)}
          >
            required
          </Badge>
        )}
        {field.isUnique && (
          <Badge
            variant="outline"
            className={cn("text-xs", FIELD_ATTR_BADGE.unique)}
          >
            unique
          </Badge>
        )}
        {field.isSearchable && (
          <Badge
            variant="outline"
            className={cn("text-xs", FIELD_ATTR_BADGE.searchable)}
          >
            searchable
          </Badge>
        )}
        {field.isFilterable && (
          <Badge
            variant="outline"
            className={cn("text-xs", FIELD_ATTR_BADGE.filterable)}
          >
            filterable
          </Badge>
        )}
        {field.isDeprecated && (
          <Badge
            variant="outline"
            className={cn("text-xs", FIELD_ATTR_BADGE.deprecated)}
          >
            deprecated
          </Badge>
        )}
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            FIELD_ORIGIN_BADGE[field.origin] ?? FIELD_ORIGIN_BADGE.business,
          )}
        >
          {field.origin === "system"
            ? "system"
            : field.origin === "standard"
              ? "standard"
              : "custom"}
        </Badge>
      </div>

      {(onEdit || onDelete) && (
        <div className="flex items-center justify-end gap-1 w-[5.5rem] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onEdit(field)}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
          {!isSystem && onDeprecate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onDeprecate(field)}
              title={field.isDeprecated ? "Restore field" : "Deprecate field"}
            >
              {field.isDeprecated ? (
                <RotateCcw className="size-3.5" />
              ) : (
                <Archive className="size-3.5" />
              )}
            </Button>
          )}
          {!isSystem && onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={() => onDelete(field)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
