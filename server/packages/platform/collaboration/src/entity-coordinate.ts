/** Explicit compatibility alias. Never strip arbitrary schema prefixes. */
export function collaborationEntityCode(value: string): string {
  return value === "master.business_partner" ? "business_partner" : value;
}

/** Existing thread coordinates are immutable; read both generations. */
export function collaborationEntityTypes(value: string): readonly string[] {
  return collaborationEntityCode(value) === "business_partner"
    ? ["business_partner", "master.business_partner"]
    : [value];
}
