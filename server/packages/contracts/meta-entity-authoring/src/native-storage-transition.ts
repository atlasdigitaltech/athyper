/** Columns retired by the single canonical format-conversion writer. Historical
 * snapshots keep their original values; native rows do not dual-write them. */
export const nativeRetiredColumns = {
  entity_field: [
    "field_key",
    "type_config",
    "default_spec",
    "computation_spec",
    "validation_spec",
  ],
  entity_runtime_profile: [
    "id_field_key",
    "tenant_field_key",
    "record_version_field_key",
    "soft_delete_field_key",
  ],
  entity_surface: ["title", "description", "layout_config"],
  entity_surface_section: ["title", "layout_config"],
  entity_surface_field_binding: [
    "label_override",
    "help_text",
    "placeholder",
    "display_config",
  ],
  entity_operation: ["label", "field_keys"],
} as const;
