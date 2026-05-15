export const ENTITY_ROUTE_ALIASES: Record<string, string> = {
  cc_supplier_spend_policy: "company_code_supplier_spend_policy",
};

export function canonicalEntityCode(entityCode: string): string {
  return ENTITY_ROUTE_ALIASES[entityCode] ?? entityCode;
}
