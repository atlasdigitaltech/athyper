"use client";

import type { ComponentType } from "react";
import type { EntityField } from "@athyper/api-contracts/metadata";

export interface FieldRendererProps {
  value: unknown;
  field: EntityField;
  mode: "view" | "edit" | "filter";
  density?: "compact" | "comfortable" | "spacious" | "table" | "sheet";
  sourceEntityCode?: string;
  rowData?: Record<string, unknown>;
  formData?: Record<string, unknown>;
  disabled?: boolean;
  onChange?: (value: unknown) => void;
  error?: string;
}

const registry = new Map<string, ComponentType<FieldRendererProps>>();

function hasReferenceTarget(field: EntityField): boolean {
  const referenceConfig = field.reference_config as Record<string, unknown> | null | undefined;
  const rawTarget = referenceConfig?.["target_entity"]
    ?? referenceConfig?.["targetEntity"]
    ?? referenceConfig?.["ref_entity"]
    ?? referenceConfig?.["entity_code"]
    ?? referenceConfig?.["entity"];
  return typeof rawTarget === "string" && rawTarget.trim().length > 0;
}

function isBlank(value: unknown): boolean {
  return value == null || value === "";
}

function textValue(value: unknown): string {
  if (isBlank(value)) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toLocaleDateString();
  if (Array.isArray(value)) return value.map(textValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function TextRenderer({ value }: FieldRendererProps) {
  return <span>{textValue(value)}</span>;
}

function BooleanRenderer({ value }: FieldRendererProps) {
  return <span>{value ? "Yes" : "No"}</span>;
}

function DateRenderer({ value }: FieldRendererProps) {
  if (isBlank(value)) return <span>-</span>;
  const date = new Date(String(value));
  return <span>{Number.isNaN(date.getTime()) ? textValue(value) : date.toLocaleDateString()}</span>;
}

function DateTimeRenderer({ value }: FieldRendererProps) {
  if (isBlank(value)) return <span>-</span>;
  const date = new Date(String(value));
  return <span>{Number.isNaN(date.getTime()) ? textValue(value) : date.toLocaleString()}</span>;
}

function NumberRenderer({ value }: FieldRendererProps) {
  if (isBlank(value)) return <span>-</span>;
  const num = typeof value === "number" ? value : Number(value);
  return <span className="tabular-nums">{Number.isFinite(num) ? num.toLocaleString() : textValue(value)}</span>;
}

export function registerFieldRenderer(
  typeKey: string,
  component: ComponentType<FieldRendererProps>,
): void {
  registry.set(typeKey, component);
}

export function resolveFieldRenderer(field: EntityField): ComponentType<FieldRendererProps> {
  if (field.ui_type) {
    const byUiType = registry.get(field.ui_type);
    if (byUiType) return byUiType;
  }

  if (hasReferenceTarget(field)) {
    const byReference = registry.get("reference");
    if (byReference) return byReference;
  }

  const byDataType = registry.get(field.data_type);
  if (byDataType) return byDataType;

  return registry.get("string") ?? TextRenderer;
}

export function getRegistrySize(): number {
  return registry.size;
}

export function registerDefaultFieldRenderers(): void {
  const textTypes = [
    "string",
    "text",
    "uuid",
    "enum",
    "json",
    "reference",
    "lookup",
    "currency",
    "status",
  ];
  for (const type of textTypes) registerFieldRenderer(type, TextRenderer);

  for (const type of ["number", "numeric", "integer", "int", "decimal", "float", "money", "amount"]) {
    registerFieldRenderer(type, NumberRenderer);
  }

  for (const type of ["boolean", "bool", "checkbox", "switch"]) {
    registerFieldRenderer(type, BooleanRenderer);
  }

  for (const type of ["date"]) registerFieldRenderer(type, DateRenderer);
  for (const type of ["datetime", "timestamp", "time"]) registerFieldRenderer(type, DateTimeRenderer);
}

registerDefaultFieldRenderers();
