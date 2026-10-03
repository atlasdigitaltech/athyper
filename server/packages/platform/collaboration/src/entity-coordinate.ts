export interface CollaborationEntityCoordinates {
  entityCode(value: string): string;
  entityTypes(value: string): readonly string[];
}

/** Unknown coordinates remain exact. Domain compatibility is registered by the
 * host; the shared framework never strips arbitrary schema prefixes. */
export function collaborationEntityCode(value: string): string { return value; }
export function collaborationEntityTypes(value: string): readonly string[] { return [value]; }
export const exactCollaborationEntityCoordinates: CollaborationEntityCoordinates = Object.freeze({
  entityCode: collaborationEntityCode,
  entityTypes: collaborationEntityTypes,
});

export function createCollaborationEntityCoordinates(
  bindings: readonly { readonly canonical: string; readonly aliases: readonly string[] }[],
): CollaborationEntityCoordinates {
  const coordinates = new Map<string, Readonly<{ canonical: string; values: readonly string[] }>>();
  for (const binding of bindings) {
    const values = Object.freeze([binding.canonical, ...binding.aliases]);
    if (values.some(value => !/^[a-z][a-z0-9_.]{1,126}$/.test(value))) throw new TypeError("Invalid collaboration coordinate binding");
    for (const value of values) {
      if (coordinates.has(value)) throw new TypeError("Ambiguous collaboration coordinate binding");
      coordinates.set(value, Object.freeze({ canonical: binding.canonical, values }));
    }
  }
  return Object.freeze({
    entityCode: (value: string) => coordinates.get(value)?.canonical ?? value,
    entityTypes: (value: string) => coordinates.get(value)?.values ?? Object.freeze([value]),
  });
}
