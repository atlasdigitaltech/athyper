import type { ListCompareCollectionV1, ListCompareFieldV1, ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { technicalFieldKeys, type EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";

/** A target Entity's per-viewer list view, as the list descriptor compiles it. */
export interface CompareTargetList {
  readonly fields: readonly ListFieldDescriptorV1[];
  readonly identityField: string;
  readonly exactCounts: boolean;
  readonly searchable: boolean;
}

/** Resolves the C4 collections of a comparison for one viewer (Entity list
 * Compare blueprint 5.8 point 10a): the relationship, the line Entity's
 * readable fields and, in master-list mode, the master list. Unreadable line
 * fields are dropped without their names (reported as `restricted`); a
 * collection that cannot be compared carries a reason instead of fields. */
export async function resolveCompareCollections(input: {
  readonly descriptor: EntityRuntimeDescriptor;
  /** The compared Entity's listed (readable) field keys. */
  readonly listedParentKeys: ReadonlySet<string>;
  readonly load: (entityCode: string) => Promise<EntityRuntimeDescriptor | undefined>;
  readonly listFor: (descriptor: EntityRuntimeDescriptor) => Promise<CompareTargetList | undefined>;
  readonly masked: (descriptor: EntityRuntimeDescriptor, key: string) => boolean;
}): Promise<{ readonly collections: readonly ListCompareCollectionV1[]; readonly restricted: boolean }> {
  const { descriptor } = input;
  let restricted = false;
  const declared = descriptor.listPresentation?.compare?.collections ?? [];
  const hash = /^[a-f0-9]{64}$/.test(descriptor.compiledHash) ? descriptor.compiledHash : undefined;
  const collections: ListCompareCollectionV1[] = [];
  for (const collection of declared) {
    const base = {
      key: collection.key,
      label: collection.label,
      ...(collection.localizedLabel ? { localizedLabel: collection.localizedLabel } : {}),
      relationshipKey: collection.relationship,
      parentDescriptorHash: hash ?? "0".repeat(64),
      ...(collection.absentLabel ? { absentLabel: collection.absentLabel } : {}),
    };
    const unavailable = (reason: NonNullable<ListCompareCollectionV1["unavailable"]>, targetEntity = ""): ListCompareCollectionV1 =>
      Object.freeze({ ...base, targetEntity: targetEntity || "unavailable", matchKey: Object.freeze([]), fields: Object.freeze([]), unavailable: reason });
    const relation = descriptor.recordPresentation?.entityRelationships?.find((item) => item.key === collection.relationship);
    if (!relation || relation.cardinality !== "many" || !hash) {
      collections.push(unavailable("RELATIONSHIP_UNAVAILABLE"));
      continue;
    }
    const target = await input.load(relation.targetEntity).catch(() => undefined);
    const targetList = target ? await input.listFor(target).catch(() => undefined) : undefined;
    if (!target || !targetList) {
      collections.push(unavailable("RELATIONSHIP_UNAVAILABLE", relation.targetEntity));
      continue;
    }
    const listed = new Map(targetList.fields.map((field) => [field.key, field]));
    const declaredFields = new Map(target.fields.map((field) => [field.key, field]));
    const technical = technicalFieldKeys(target);
    const matchKey = collection.matchKey.map((key) => listed.get(key));
    if (matchKey.some((field) => !field || input.masked(target, field.key) || technical.has(field.key))) {
      collections.push(unavailable("MATCH_KEY_UNAVAILABLE", relation.targetEntity));
      continue;
    }
    // Line access must follow the parent's for absence to mean "not quoted".
    const accessIndependent =
      descriptor.authorization?.relationships.find((item) => item.key === relation.key)?.ownership === "independent" ||
      Boolean(target.recordPredicates?.length) ||
      Boolean(target.ownerAccess) ||
      Boolean(target.directoryScope?.mode && target.directoryScope.mode !== "tenant");
    let master: ListCompareCollectionV1["master"];
    if (collection.master) {
      const first = declaredFields.get(collection.matchKey[0]!);
      if (first?.referenceTargetEntity !== collection.master.entity) {
        collections.push(unavailable("MATCH_KEY_NOT_SHARED", relation.targetEntity));
        continue;
      }
      const masterDescriptor = await input.load(collection.master.entity).catch(() => undefined);
      const masterList = masterDescriptor ? await input.listFor(masterDescriptor).catch(() => undefined) : undefined;
      const parentField = masterList?.fields.find((field) => field.key === collection.master!.parentField);
      if (!masterDescriptor || !masterList || !parentField || !parentField.filterOperators.includes("eq") || !input.listedParentKeys.has(collection.master.recordParentField)) {
        collections.push(unavailable("MASTER_UNAVAILABLE", relation.targetEntity));
        continue;
      }
      const title = masterList.fields.find((field) => field.semanticRole === "title" && field.key !== masterList.identityField);
      master = Object.freeze({
        entity: collection.master.entity,
        parentField: collection.master.parentField,
        recordParentField: collection.master.recordParentField,
        identityField: masterList.identityField,
        ...(title ? { titleField: title.key } : {}),
        searchable: masterList.searchable,
        filters: Object.freeze(
          masterList.fields
            .filter((field) => field.key !== collection.master!.parentField && field.key !== masterList.identityField && field.filterOptions?.length && field.filterOperators.includes("eq"))
            .slice(0, 3)
            .map((field) => Object.freeze({ key: field.key, label: field.label, options: Object.freeze(field.filterOptions!.map((option) => ({ value: option.value, label: option.label }))) })),
        ),
        ...(masterList.exactCounts ? { exactCounts: true as const } : {}),
      });
    }
    const fields = collection.fields.flatMap((key): ListCompareFieldV1[] => {
      const field = listed.get(key);
      if (!field || field.valueKind === "uuid" || technical.has(key)) {
        restricted = true;
        return [];
      }
      const masked = input.masked(target, key);
      const compare = declaredFields.get(key)?.compare;
      const currencyKey = field.valueKind === "money" ? declaredFields.get(key)?.list?.currencyField : undefined;
      const currency = currencyKey && listed.has(currencyKey) ? currencyKey : undefined;
      if (currencyKey && !currency) restricted = true;
      return [
        Object.freeze({
          key,
          label: field.label,
          valueKind: field.valueKind as ListCompareFieldV1["valueKind"],
          ...(!masked && field.filterOptions?.length ? { options: field.filterOptions } : {}),
          ...(masked ? { masked: true as const } : {}),
          ...(currency ? { currencyField: currency } : {}),
          ...(currency && input.masked(target, currency) ? { currencyMasked: true as const } : {}),
          ...(compare ? { better: compare.better } : {}),
          ...(compare?.summaryLabel ? { summaryLabel: compare.summaryLabel } : {}),
          ...(compare?.unitField && listed.has(compare.unitField) ? { unitField: compare.unitField } : {}),
          ...(compare?.evaluation ? { evaluation: true as const } : {}),
        }),
      ];
    });
    if (!fields.length) {
      collections.push(unavailable("NO_READABLE_FIELDS", relation.targetEntity));
      continue;
    }
    collections.push(
      Object.freeze({
        ...base,
        targetEntity: relation.targetEntity,
        matchKey: Object.freeze(matchKey.map((field) => Object.freeze({ key: field!.key, label: field!.label, valueKind: field!.valueKind }))),
        fields: Object.freeze(fields),
        ...(master ? { master } : {}),
        ...(targetList.exactCounts ? { exactCounts: true as const } : {}),
        ...(accessIndependent ? { accessIndependent: true as const } : {}),
      }),
    );
  }
  return { collections: Object.freeze(collections), restricted };
}
