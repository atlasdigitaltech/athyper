import {
  FoundationContractError,
  parseOwnedLabels,
  type OwnedLabelGraph,
  type OwnedLabelContext,
  type LabelCommandBatch,
} from "@athyper/server-contract-meta-entity-authoring";

/** Pure final-graph construction; owner and identity allocator are server-owned.
 * No SQL, authorization inference, cascade removal or replay side effects. */
export function applyLabelCommands(
  current: OwnedLabelGraph | null,
  batch: LabelCommandBatch,
  context: OwnedLabelContext,
  allocate: () => string,
) {
  const labels = [...(current?.labels ?? [])];
  const translations = [...(current?.translations ?? [])];
  let defaultLocale = current?.defaultLocale;
  let requiredLocales = current?.requiredLocales;
  const identities: Record<string, string> = Object.create(null);
  const kinds = new Map<string, string>();
  const fail = (code: string): never => {
    throw new FoundationContractError(code, "/commands");
  };
  for (const command of batch.commands) {
    if (command.kind !== "addMember") continue;
    if (Object.hasOwn(identities, command.tempRef))
      fail("AUTHORING_TEMP_REF_DUPLICATE");
    const id = allocate();
    if (
      [...labels, ...translations].some((row) => row.id === id) ||
      Object.values(identities).includes(id)
    )
      fail("AUTHORING_IDENTITY_COLLISION");
    identities[command.tempRef] = id;
    kinds.set(command.tempRef, command.memberKind);
  }
  const resolve = (
    ref: { readonly id: string } | { readonly $tempRef: string },
    kind: string,
  ): string => {
    if ("id" in ref) return ref.id;
    if (
      !Object.hasOwn(identities, ref.$tempRef) ||
      kinds.get(ref.$tempRef) !== kind
    )
      return fail("AUTHORING_TEMP_REF_INVALID");
    return identities[ref.$tempRef]!;
  };
  for (const command of batch.commands) {
    if (command.memberKind === "labelSettings") {
      defaultLocale = command.set.defaultLocale;
      requiredLocales = command.set.requiredLocales;
      continue;
    }
    if (command.kind === "addMember") {
      const id = identities[command.tempRef]!;
      if (command.memberKind === "label")
        labels.push({
          id,
          ...command.value,
          sourceKind: "owned",
          sharedLabelKey: null,
          sharedResourceKey: null,
          sharedResourceVersion: null,
          sharedResourceHash: null,
        });
      else
        translations.push({
          id,
          labelId: resolve(command.value.label, "label"),
          localeCode: command.value.localeCode,
          text: command.value.text,
        });
      continue;
    }
    const id = resolve(command.member, command.memberKind);
    if (command.memberKind === "label") {
      const index = labels.findIndex((row) => row.id === id);
      if (index < 0) fail("AUTHORING_MEMBER_NOT_FOUND");
      if (command.kind === "removeMember") labels.splice(index, 1);
      else if (command.kind === "renameDraftMember")
        labels[index] = { ...labels[index]!, labelKey: command.labelKey };
      else
        labels[index] = {
          ...labels[index]!,
          defaultText: command.set.defaultText,
        };
    } else {
      const index = translations.findIndex((row) => row.id === id);
      if (index < 0) fail("AUTHORING_MEMBER_NOT_FOUND");
      if (command.kind === "removeMember") translations.splice(index, 1);
      else
        translations[index] = {
          ...translations[index]!,
          text: command.set.text,
        };
    }
  }
  if (!defaultLocale || !requiredLocales)
    fail("AUTHORING_LABEL_SETTINGS_REQUIRED");
  const graph = parseOwnedLabels(
    {
      contract: "entity.authoring-owned-labels/1",
      entityId: context.entityId,
      changeSetId: context.changeSetId,
      tenantId: context.tenantId,
      defaultLocale,
      requiredLocales,
      labels,
      translations,
    },
    context,
  );
  // A returned token must name a persisted member, never an added-then-removed UUID.
  for (const id of Object.values(identities))
    if (![...labels, ...translations].some((row) => row.id === id))
      fail("AUTHORING_TEMP_REF_REMOVED");
  return { graph, identities };
}
