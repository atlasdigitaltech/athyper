"use client";

import { Input, Label, Separator } from "@neon/ui";

import { FieldRenderer as TypeAwareField } from "./fields/FieldRenderer";

import type { SectionDescriptor, ViewMode } from "@/lib/entity-page/types";
import type { FieldMeta } from "@/lib/use-entity-fields";

import { Card } from "@/components/ui/card";
import { groupFieldsIntoSections } from "@/lib/entity-page/section-grouping";
import { isFieldVisible, resolveFieldMeta } from "@/lib/entity-page/resolve-field-meta";
import { useCollectionField } from "@/lib/use-collection-field";
import { CollectionFieldRenderer } from "./fields/renderers";

interface DetailsTabProps {
  sections: SectionDescriptor[];
  record: Record<string, unknown> | null;
  viewMode: ViewMode;
  fieldMeta?: FieldMeta[];
  resolvedRefs?: Map<string, string>;
  /** Entity feature flags for section override resolution */
  featureFlags?: Record<string, unknown> | null;
  /** Entity name (for collection field context) */
  entityName?: string;
  /** Record ID (for collection field context) */
  entityId?: string;
  onFieldChange?: (fieldName: string, value: unknown) => void;
}

export function DetailsTab({
  sections,
  record,
  viewMode,
  fieldMeta,
  resolvedRefs,
  featureFlags,
  entityName,
  entityId,
  onFieldChange,
}: DetailsTabProps) {
  // Auto-generate sections when none are provided but field metadata exists
  let resolvedSections = sections;
  if (sections.length === 0 && fieldMeta && fieldMeta.length > 0) {
    const uiFlags = (featureFlags as any)?.ui as
      | Record<string, unknown>
      | undefined;
    resolvedSections = groupFieldsIntoSections(fieldMeta, {
      sectionOverrides: uiFlags?.sectionOverrides as
        | Record<string, string>
        | undefined,
      sectionLabels: uiFlags?.sectionLabels as
        | Record<string, string>
        | undefined,
    });
  }

  if (resolvedSections.length === 0) {
    return (
      <div className="py-4 text-muted-foreground text-sm">
        No fields configured for this entity.
      </div>
    );
  }

  // Index field metadata by name for O(1) lookup
  const fieldMetaMap = new Map((fieldMeta ?? []).map((f) => [f.columnName, f]));

  return (
    <div className="space-y-6 py-4">
      {resolvedSections.map((section, idx) => (
        <div key={section.code}>
          {idx > 0 && <Separator className="mb-6" />}
          <SectionRenderer
            section={section}
            record={record}
            viewMode={viewMode}
            fieldMetaMap={fieldMetaMap}
            resolvedRefs={resolvedRefs}
            entityName={entityName}
            entityId={entityId}
            onFieldChange={onFieldChange}
          />
        </div>
      ))}
    </div>
  );
}

interface SectionRendererProps {
  section: SectionDescriptor;
  record: Record<string, unknown> | null;
  viewMode: ViewMode;
  fieldMetaMap: Map<string, FieldMeta>;
  resolvedRefs?: Map<string, string>;
  entityName?: string;
  entityId?: string;
  onFieldChange?: (fieldName: string, value: unknown) => void;
}

function SectionRenderer({
  section,
  record,
  viewMode,
  fieldMetaMap,
  resolvedRefs,
  entityName,
  entityId,
  onFieldChange,
}: SectionRendererProps) {
  const gridCols = section.columns === 2 ? "grid-cols-2" : "grid-cols-1";

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-4">{section.label}</h3>
      <div className={`grid ${gridCols} gap-4`}>
        {section.fields.map((fieldName) => {
          const meta = fieldMetaMap.get(fieldName);

          // Skip fields hidden in this context (FR-4 visibility)
          if (meta && !isFieldVisible(meta, viewMode)) return null;

          // Use type-aware renderer when metadata is available
          if (meta) {
            // Collection fields use a dedicated wrapper for hook management
            if (meta.childEntityName && meta.childFkField && entityName) {
              return (
                <CollectionFieldWrapper
                  key={fieldName}
                  field={meta}
                  viewMode={viewMode}
                  parentEntity={entityName}
                  parentId={entityId}
                />
              );
            }

            return (
              <TypeAwareField
                key={fieldName}
                field={meta}
                value={record?.[fieldName]}
                viewMode={viewMode}
                resolvedRef={resolvedRefs?.get(fieldName)}
                parentEntity={entityName}
                parentId={entityId}
                onChange={onFieldChange}
              />
            );
          }

          // Fallback: basic field renderer
          return (
            <BasicFieldRenderer
              key={fieldName}
              fieldName={fieldName}
              value={record?.[fieldName]}
              viewMode={viewMode}
            />
          );
        })}
      </div>
    </Card>
  );
}

// ── Collection field wrapper (manages hook lifecycle) ──

interface CollectionFieldWrapperProps {
  field: FieldMeta;
  viewMode: ViewMode;
  parentEntity: string;
  parentId?: string;
}

function CollectionFieldWrapper({
  field,
  viewMode,
  parentEntity,
  parentId,
}: CollectionFieldWrapperProps) {
  const collection = useCollectionField(
    parentEntity,
    parentId,
    field.columnName,
    field.childEntityName!,
  );

  const resolved = resolveFieldMeta(field, viewMode);

  return (
    <CollectionFieldRenderer
      resolved={resolved}
      parentEntity={parentEntity}
      parentId={parentId}
      collection={collection}
      viewMode={viewMode}
    />
  );
}

// ── Fallback field renderer (when no FieldMeta available) ──

interface BasicFieldRendererProps {
  fieldName: string;
  value: unknown;
  viewMode: ViewMode;
}

function BasicFieldRenderer({
  fieldName,
  value,
  viewMode,
}: BasicFieldRendererProps) {
  const displayLabel = fieldName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const displayValue = value == null ? "" : String(value);

  if (viewMode === "view") {
    return (
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs">{displayLabel}</Label>
        <p className="text-sm min-h-[1.5rem]">{displayValue || "\u2014"}</p>
      </div>
    );
  }

  // Edit / Create mode
  return (
    <div className="space-y-1">
      <Label htmlFor={fieldName}>{displayLabel}</Label>
      <Input id={fieldName} name={fieldName} defaultValue={displayValue} />
    </div>
  );
}
