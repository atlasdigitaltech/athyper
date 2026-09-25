/** Request-local cache: authorization results never cross principal, tenant or scope. */
export function relatedPartnerAuthorizations(authorize?: (id: string) => Promise<boolean>) {
  const decisions = new Map<string, boolean>();
  return async (ids: readonly string[]): Promise<ReadonlyMap<string, boolean>> => {
    const pending = [...new Set(ids)].filter(id => !decisions.has(id));
    // Bound pressure on the policy service and its database pool.
    for (let offset = 0; offset < pending.length; offset += 8) {
      await Promise.all(pending.slice(offset, offset + 8).map(async id => {
        decisions.set(id, authorize ? await authorize(id) : false);
      }));
    }
    return decisions;
  };
}
