/**
 * @athyper/metadata-client — Compiled Reader
 *
 * Reads snapshot.entity_compiled and resolves:
 *   - Which fields to display in list/detail/form views
 *   - Field groups → form sections / tabs
 *   - Display config (title field, default sort, list columns)
 *   - Feature flags (attachments, comments, workflow, etc.)
 *
 * This is the PRIMARY source for all three rendering runtimes.
 * Unknown entity codes fail here — before any partial rendering.
 */
import {
  type CompiledEntity,
  type EntityField,
  type FieldGroup,
} from "@athyper/api-contracts/metadata";

export interface ResolvedListConfig {
  columns: EntityField[];
  searchFields: EntityField[];
  defaultSortField: string | undefined;
  defaultSortOrder: "asc" | "desc";
  titleField: string | undefined;
}

export interface ResolvedDetailConfig {
  headerFields: EntityField[];
  sections: Array<{ group: FieldGroup; fields: EntityField[] }>;
  titleField: EntityField | undefined;
  subtitleField: EntityField | undefined;
}

export interface ResolvedFormConfig {
  sections: Array<{ group: FieldGroup; fields: EntityField[] }>;
  requiredFields: EntityField[];
  validationRules: Map<string, Record<string, unknown>>;
}

/**
 * Resolve list view configuration from a compiled entity.
 */
export function resolveListConfig(entity: CompiledEntity): ResolvedListConfig {
  const { fields, display_config } = entity;

  // Determine which columns to show
  const listColumnNames = display_config.list_columns;
  const columns = listColumnNames
    ? fields.filter((f) => listColumnNames.includes(f.name))
    : fields.filter((f) => f.is_filterable || f.is_sortable).slice(0, 8);

  const searchFields = display_config.search_fields
    ? fields.filter((f) => display_config.search_fields!.includes(f.name))
    : fields.filter((f) => f.is_searchable);

  return {
    columns: columns.sort((a, b) => a.sort_order - b.sort_order),
    searchFields,
    defaultSortField: display_config.default_sort_field,
    defaultSortOrder: display_config.default_sort_order ?? "asc",
    titleField: display_config.title_field,
  };
}

/**
 * Resolve detail view configuration — header fields + tabbed sections.
 */
export function resolveDetailConfig(entity: CompiledEntity): ResolvedDetailConfig {
  const { fields, field_groups, display_config } = entity;

  const titleField = display_config.title_field
    ? fields.find((f) => f.name === display_config.title_field)
    : undefined;

  const subtitleField = display_config.subtitle_field
    ? fields.find((f) => f.name === display_config.subtitle_field)
    : undefined;

  // Top header: title + subtitle + key identifying fields
  const headerFields = fields
    .filter((f) => f.group_key === null || f.group_key === "identity")
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 6);

  // Sections from field groups
  const sections = field_groups
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((group) => ({
      group,
      fields: fields
        .filter((f) => group.fields.includes(f.name))
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((s) => s.fields.length > 0);

  return { headerFields, sections, titleField, subtitleField };
}

/**
 * Resolve form configuration — editable sections + validation.
 */
export function resolveFormConfig(entity: CompiledEntity): ResolvedFormConfig {
  const { fields, field_groups } = entity;

  const editableFields = fields.filter((f) => !f.is_readonly && f.origin !== "system");

  let sections = field_groups
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((group) => ({
      group,
      fields: editableFields
        .filter((f) => group.fields.includes(f.name))
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((s) => s.fields.length > 0);

  // Fallback: if no field groups are defined, show all editable fields in a single section
  if (sections.length === 0 && editableFields.length > 0) {
    sections = [
      {
        group: {
          group_key: "general",
          label: "General",
          description: null,
          sort_order: 0,
          fields: editableFields.map((f) => f.name),
        },
        fields: editableFields.sort((a, b) => a.sort_order - b.sort_order),
      },
    ];
  }

  const requiredFields = editableFields.filter((f) => f.is_required);

  const validationRules = new Map<string, Record<string, unknown>>();
  for (const field of editableFields) {
    if (field.validation_rules) {
      validationRules.set(field.name, field.validation_rules);
    }
  }

  return { sections, requiredFields, validationRules };
}
