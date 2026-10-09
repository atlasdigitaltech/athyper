import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing";
/** Bounded local rollback: identical executable descriptor, allowing list-density
 * changes and regenerated authoring provenance IDs. All field, operation,
 * permission, storage, AI and other declarations remain comparison inputs. */
export function assertLocalRollbackCompatible(
  current: unknown,
  target: unknown,
): void {
  const digest = (value: unknown) => sha256(canonicalBytes(value));
  const normalize = (payload: unknown) => {
    const value = structuredClone(payload) as {
      artifacts?: { content?: { descriptor?: Record<string, any> } }[];
    };
    if (!Array.isArray(value?.artifacts))
      throw Error("LOCAL_ROLLBACK_DESCRIPTOR_REQUIRED");
    const descriptors = value.artifacts.flatMap((a) =>
      a.content?.descriptor ? [a.content.descriptor] : [],
    );
    if (descriptors.length !== 1)
      throw Error("LOCAL_ROLLBACK_DESCRIPTOR_REQUIRED");
    const d = descriptors[0]!;
    if (
      !d.source ||
      !d.operations ||
      !d.authorization ||
      !Array.isArray(d.operation_scope_bindings)
    )
      throw Error("LOCAL_ROLLBACK_DESCRIPTOR_REQUIRED");
    delete d.source.release_hash;
    if (d.listPresentation?.defaultState)
      delete d.listPresentation.defaultState.density;
    d.operation_scope_bindings = d.operation_scope_bindings
      .map((binding: Record<string, unknown>) => {
        delete binding.bindingId;
        delete binding.scopeBindingId;
        delete binding.sourceEntityOperationId;
        return binding;
      })
      .sort((a: unknown, b: unknown) => digest(a).localeCompare(digest(b)));
    if (Array.isArray(d.authorization.operations))
      d.authorization.operations.sort((a: unknown, b: unknown) =>
        digest(a).localeCompare(digest(b)),
      );
    return d;
  };
  if (digest(normalize(current)) !== digest(normalize(target)))
    throw Error("LOCAL_ROLLBACK_INCOMPATIBLE_DESCRIPTOR");
}
