import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";

/** Direction wording for a field's value kind; shared with every collection. */
export { collectionSortDirectionKeys as sortDirectionKeys } from "@athyper/platform-collection-controls";

/** Record identifiers (uuid) are never a useful sort order for people. */
export function sortPickerFields(fields: readonly ListFieldDescriptorV1[]): readonly ListFieldDescriptorV1[] {
  return fields.filter((field) => field.sortable && field.valueKind !== "uuid");
}
