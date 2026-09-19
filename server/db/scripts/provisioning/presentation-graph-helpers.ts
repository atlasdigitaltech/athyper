import { createHash } from "node:crypto";

/** Preserve the existing presentation IDs, including their prefixes and fixed variant nibble.
 * This intentionally differs from three-plane-model's ID algorithm; changing it requires a migration.
 */
export function presentationUuid(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function surfaceBindingLookup<
  T extends {
    entitySurfaceId: string;
    displayConfig?: { valueKey?: unknown } | null;
  },
>(bindings: readonly T[], surfaceId: string) {
  return (valueKey: string): T | undefined =>
    bindings.find(
      (binding) =>
        binding.entitySurfaceId === surfaceId &&
        binding.displayConfig?.valueKey === valueKey,
    );
}
