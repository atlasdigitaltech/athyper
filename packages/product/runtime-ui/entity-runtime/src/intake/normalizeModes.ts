import type { EntityIntakeMode } from "@athyper/api-contracts/metadata";

export function normalizeModes(
  modes: EntityIntakeMode[] | undefined,
  fallbackModes?: EntityIntakeMode[],
): EntityIntakeMode[] {
  const source = modes?.length ? modes : fallbackModes;
  return [...(source ?? [])]
    .filter((mode) => mode.code && mode.label)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
}
