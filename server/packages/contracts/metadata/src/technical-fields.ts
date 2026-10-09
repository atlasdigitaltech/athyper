// The one rule for which fields are technical identities, never compared or
// displayed (Entity list Compare blueprint sections 6 and 9.6): the storage
// identity, the version field, and UUID-typed fields. Shared by publication
// validation, the per-viewer comparison projection and the activity provider,
// so the rule exists once.

export function technicalFieldKeys(descriptor: {
  readonly storage: { readonly idField?: unknown; readonly versionField?: unknown };
  readonly fields: readonly { readonly key: string; readonly storagePath?: string; readonly type?: string }[];
}): ReadonlySet<string> {
  const storage = new Set([descriptor.storage.idField, descriptor.storage.versionField].filter((value): value is string => typeof value === "string" && value.length > 0));
  return new Set(
    descriptor.fields
      .filter((field) => field.type === "uuid" || storage.has(field.key) || (field.storagePath !== undefined && storage.has(field.storagePath)))
      .map((field) => field.key),
  );
}
