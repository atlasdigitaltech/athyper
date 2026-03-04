"use client";

/**
 * Type-Aware Field Renderer
 *
 * Dispatches to the correct field component based on FieldMeta.dataType.
 * Supports view, edit, and create modes.
 */

import { Badge, Input, Label } from "@neon/ui";
import { Lock } from "lucide-react";

import type { ViewMode } from "@/lib/entity-page/types";
import type { ReadOnlyReason } from "@/lib/entity-projection";
import type { FieldMeta } from "@/lib/use-entity-fields";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { READ_ONLY_REASON_LABELS } from "@/lib/entity-projection";

// ============================================================================
// Props
// ============================================================================

interface FieldRendererProps {
  field: FieldMeta;
  value: unknown;
  viewMode: ViewMode;
  /** Resolved display name for FK reference fields */
  resolvedRef?: string;
  /** Reason code when field is forced read-only (shows lock icon + tooltip) */
  readOnlyReason?: ReadOnlyReason;
  onChange?: (fieldName: string, value: unknown) => void;
}

// ============================================================================
// Dispatcher
// ============================================================================

export function FieldRenderer({
  field,
  value,
  viewMode,
  resolvedRef,
  readOnlyReason,
  onChange,
}: FieldRendererProps) {
  const displayLabel = formatFieldLabel(field.name);

  // FK reference fields: show resolved name in both view and edit modes
  if (resolvedRef) {
    return (
      <ReferenceField
        label={displayLabel}
        displayName={resolvedRef}
        uuid={value != null ? String(value) : null}
        viewMode={viewMode}
        readOnlyReason={readOnlyReason}
      />
    );
  }

  // Read-only field with reason (forced view mode in edit/create context)
  if (readOnlyReason && viewMode === "view") {
    return (
      <ReadOnlyField
        label={displayLabel}
        field={field}
        value={value}
        reason={readOnlyReason}
      />
    );
  }

  if (viewMode === "view") {
    return <ViewField label={displayLabel} field={field} value={value} />;
  }

  // Edit / Create mode
  return (
    <EditField
      label={displayLabel}
      field={field}
      value={value}
      onChange={onChange}
    />
  );
}

// ============================================================================
// View Mode Fields
// ============================================================================

function ViewField({
  label,
  field,
  value,
}: {
  label: string;
  field: FieldMeta;
  value: unknown;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <p className="text-sm min-h-[1.5rem]">
        {formatDisplayValue(field, value)}
      </p>
    </div>
  );
}

// ============================================================================
// Reference (FK) Field — shows resolved display name
// ============================================================================

function ReferenceField({
  label,
  displayName,
  uuid,
  viewMode,
  readOnlyReason,
}: {
  label: string;
  displayName: string;
  uuid: string | null;
  viewMode: ViewMode;
  readOnlyReason?: ReadOnlyReason;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel label={label} readOnlyReason={readOnlyReason} />
      <p className="text-sm min-h-[1.5rem]">{displayName}</p>
      {viewMode !== "view" && uuid && (
        <p className="text-[10px] text-muted-foreground truncate">{uuid}</p>
      )}
    </div>
  );
}

// ============================================================================
// Read-Only Field (with reason tooltip)
// ============================================================================

function ReadOnlyField({
  label,
  field,
  value,
  reason,
}: {
  label: string;
  field: FieldMeta;
  value: unknown;
  reason: ReadOnlyReason;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel label={label} readOnlyReason={reason} />
      <p className="text-sm min-h-[1.5rem] text-muted-foreground">
        {formatDisplayValue(field, value)}
      </p>
    </div>
  );
}

// ============================================================================
// Field Label with optional lock icon + tooltip
// ============================================================================

function FieldLabel({
  label,
  readOnlyReason,
}: {
  label: string;
  readOnlyReason?: ReadOnlyReason;
}) {
  if (!readOnlyReason) {
    return <Label className="text-muted-foreground text-xs">{label}</Label>;
  }

  const reasonLabel = READ_ONLY_REASON_LABELS[readOnlyReason] ?? "Read-only";

  return (
    <div className="flex items-center gap-1">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <span title={reasonLabel} className="inline-flex">
        <Lock className="size-3 text-muted-foreground/60" />
      </span>
    </div>
  );
}

// ============================================================================
// Edit Mode Fields
// ============================================================================

function EditField({
  label,
  field,
  value,
  onChange,
}: {
  label: string;
  field: FieldMeta;
  value: unknown;
  onChange?: (fieldName: string, value: unknown) => void;
}) {
  const fieldId = field.columnName;

  switch (field.dataType) {
    case "boolean":
      return (
        <div className="flex items-center justify-between space-y-0 py-1">
          <Label htmlFor={fieldId}>{label}</Label>
          <Switch
            id={fieldId}
            checked={value === true || value === "true"}
            onCheckedChange={(checked) => onChange?.(fieldId, checked)}
          />
        </div>
      );

    case "number":
      return (
        <div className="space-y-1">
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            id={fieldId}
            name={fieldId}
            type="number"
            defaultValue={value != null ? String(value) : ""}
            onChange={(e) => {
              const num = parseFloat(e.target.value);
              onChange?.(fieldId, isNaN(num) ? null : num);
            }}
            step={isDecimalField(field) ? "0.01" : "1"}
          />
        </div>
      );

    case "date":
      return (
        <div className="space-y-1">
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            id={fieldId}
            name={fieldId}
            type="date"
            defaultValue={formatDateForInput(value)}
            onChange={(e) => onChange?.(fieldId, e.target.value || null)}
          />
        </div>
      );

    case "enum": {
      const options = getEnumOptions(field);
      if (options.length > 0) {
        return (
          <div className="space-y-1">
            <Label htmlFor={fieldId}>{label}</Label>
            <Select
              defaultValue={value != null ? String(value) : undefined}
              onValueChange={(v) => onChange?.(fieldId, v)}
            >
              <SelectTrigger id={fieldId}>
                <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      }
      // Fallback: text input for enums without options
      return (
        <div className="space-y-1">
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            id={fieldId}
            name={fieldId}
            defaultValue={value != null ? String(value) : ""}
            onChange={(e) => onChange?.(fieldId, e.target.value || null)}
          />
        </div>
      );
    }

    case "json":
      return (
        <div className="space-y-1">
          <Label htmlFor={fieldId}>{label}</Label>
          <textarea
            id={fieldId}
            name={fieldId}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
            defaultValue={value != null ? JSON.stringify(value, null, 2) : ""}
            onChange={(e) => {
              try {
                onChange?.(fieldId, JSON.parse(e.target.value));
              } catch {
                // Invalid JSON — don't update
              }
            }}
          />
        </div>
      );

    default:
      // String and reference fields use a plain text input
      return (
        <div className="space-y-1">
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            id={fieldId}
            name={fieldId}
            defaultValue={value != null ? String(value) : ""}
            onChange={(e) => onChange?.(fieldId, e.target.value || null)}
          />
        </div>
      );
  }
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatFieldLabel(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDisplayValue(field: FieldMeta, value: unknown): React.ReactNode {
  if (value == null) return "\u2014";

  switch (field.dataType) {
    case "number": {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      if (isDecimalField(field)) {
        return num.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
      return num.toLocaleString();
    }

    case "date": {
      try {
        const date = new Date(String(value));
        if (isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      } catch {
        return String(value);
      }
    }

    case "boolean":
      return (
        <Badge variant={value ? "default" : "secondary"}>
          {value ? "Yes" : "No"}
        </Badge>
      );

    case "enum":
      return <Badge variant="outline">{String(value)}</Badge>;

    case "json":
      return (
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
          {JSON.stringify(value).slice(0, 80)}
          {JSON.stringify(value).length > 80 ? "..." : ""}
        </code>
      );

    default:
      return String(value);
  }
}

function formatDateForInput(value: unknown): string {
  if (value == null) return "";
  try {
    const date = new Date(String(value));
    if (isNaN(date.getTime())) return "";
    return date.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function isDecimalField(field: FieldMeta): boolean {
  const name = field.columnName.toLowerCase();
  return (
    name.includes("amount") ||
    name.includes("price") ||
    name.includes("rate") ||
    name.includes("balance") ||
    name.includes("total") ||
    name.includes("cost")
  );
}

function getEnumOptions(field: FieldMeta): string[] {
  // Check validation config for enum values
  const validation = field.validation as Record<string, unknown> | null;
  if (validation?.enumValues && Array.isArray(validation.enumValues)) {
    return validation.enumValues as string[];
  }
  if (validation?.options && Array.isArray(validation.options)) {
    return validation.options as string[];
  }
  return [];
}
