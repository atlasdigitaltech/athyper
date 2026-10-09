import { COMPARE_MAX_RECORDS, type ListCompareFieldV1, type ListCompareV1, type ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import type { EntityFieldDescriptor, EntityListCompareDescriptor } from "@athyper/server-contract-metadata";

/** Resolves the published comparison for one viewer (Entity list Compare
 * blueprint section 5.3). The projection is load-bearing: the list operation
 * refuses a request naming any field the viewer cannot read, so only listed
 * fields are carried. A declared field hidden from this viewer is left out
 * without its name or a count, and acknowledged only by `fieldsRestricted`.
 * Masking comes from the authorization field policy, through the same
 * `masked` predicate as the list chrome. */
export function resolveListCompare(input: {
  readonly compare: EntityListCompareDescriptor;
  /** The viewer's listed fields (readable, technical identities removed). */
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly entityFields: readonly EntityFieldDescriptor[];
  readonly masked: (key: string) => boolean;
  /** The descriptor's declared `storage.statusField`. */
  readonly statusField?: string;
}): ListCompareV1 | undefined {
  const listed = new Map(input.fields.map((field) => [field.key, field]));
  const declared = new Map(input.entityFields.map((field) => [field.key, field]));
  let restricted = false;
  const compared = new Set<string>();
  const sections = input.compare.sections.flatMap((section) => {
    const fields = section.fields.flatMap((key): ListCompareFieldV1[] => {
      const field = listed.get(key);
      if (!field || field.valueKind === "uuid") {
        restricted = true;
        return [];
      }
      compared.add(key);
      const masked = input.masked(key);
      const currencyKey = field.valueKind === "money" ? declared.get(key)?.list?.currencyField : undefined;
      const currency = currencyKey && listed.has(currencyKey) ? currencyKey : undefined;
      // A declared currency the viewer cannot read is a restricted field too:
      // the amount is then never compared, and the panel says why (audit 4).
      if (currencyKey && !currency) restricted = true;
      return [
        Object.freeze({
          key,
          label: field.label,
          valueKind: field.valueKind,
          ...(!masked && field.filterOptions?.length ? { options: field.filterOptions } : {}),
          ...(masked ? { masked: true as const } : {}),
          ...(currency ? { currencyField: currency } : {}),
          ...(currency && input.masked(currency) ? { currencyMasked: true as const } : {}),
        }),
      ];
    });
    return fields.length
      ? [
          Object.freeze({
            key: section.key,
            label: section.label,
            ...(section.localizedLabel ? { localizedLabel: section.localizedLabel } : {}),
            ...(section.collapsed ? { collapsed: true as const } : {}),
            fields: Object.freeze(fields),
          }),
        ]
      : [];
  });
  if (!sections.length) return undefined;
  // The status chip uses only the declared status field, and only when it is
  // readable, unmasked and compared (section 9.2); never a field found by name.
  const status = input.statusField && compared.has(input.statusField) && !input.masked(input.statusField) ? input.statusField : undefined;
  return Object.freeze({
    sections: Object.freeze(sections),
    ...(restricted ? { fieldsRestricted: true as const } : {}),
    ...(status ? { statusField: status } : {}),
    maxRecords: COMPARE_MAX_RECORDS,
  });
}
