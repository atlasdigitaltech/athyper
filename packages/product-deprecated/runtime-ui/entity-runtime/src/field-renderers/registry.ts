/**
 * @athyper/entity-runtime — Field Renderer Registry
 *
 * Maps data_type (and ui_type) to React components.
 * This is the core extension point for the metadata-driven UI.
 *
 * Resolution order:
 *   1. field.ui_type → registry lookup
 *   2. field.data_type → registry lookup
 *   3. fallback → TextRenderer
 *
 * Adding a new field type = registering a component here.
 * No page code changes needed.
 */
import { type ComponentType } from "react";
import { type EntityField } from "@athyper/api-contracts/metadata";

/** Props passed to every field renderer */
export interface FieldRendererProps {
  value: unknown;
  field: EntityField;
  mode: "view" | "edit" | "filter";
  density?: "compact" | "comfortable" | "spacious" | "table" | "sheet";
  /** Source entity context, used by metadata-driven option/reference display resolvers. */
  sourceEntityCode?: string;
  /** Current row/form values, used by dependent metadata option sources. */
  rowData?: Record<string, unknown>;
  /** Full form values, used by dependent lookup fields. */
  formData?: Record<string, unknown>;
  disabled?: boolean;
  onChange?: (value: unknown) => void;
  error?: string;
}

/** The registry: data_type or ui_type → component */
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

/**
 * Register a field renderer for a data type or ui type.
 */
export function registerFieldRenderer(
  typeKey: string,
  component: ComponentType<FieldRendererProps>,
): void {
  registry.set(typeKey, component);
}

/**
 * Resolve the renderer for a field.
 * Checks ui_type first, then data_type, then falls back to "string".
 */
export function resolveFieldRenderer(field: EntityField): ComponentType<FieldRendererProps> {
  // 1. Try ui_type
  if (field.ui_type) {
    const byUiType = registry.get(field.ui_type);
    if (byUiType) return byUiType;
  }

  // 1b. Legacy metadata may keep data_type="uuid" while carrying reference
  // config. Treat those as references so view/edit modes resolve labels.
  if (hasReferenceTarget(field)) {
    const byReference = registry.get("reference");
    if (byReference) return byReference;
  }

  // 2. Try data_type
  const byDataType = registry.get(field.data_type);
  if (byDataType) return byDataType;

  // 3. Fallback
  const fallback = registry.get("string");
  if (fallback) return fallback;

  // Should never happen if registerDefaults() was called
  throw new Error(`No renderer registered for field "${field.name}" (data_type=${field.data_type}, ui_type=${field.ui_type})`);
}

/**
 * Get the number of registered renderers (for testing).
 */
export function getRegistrySize(): number {
  return registry.size;
}
