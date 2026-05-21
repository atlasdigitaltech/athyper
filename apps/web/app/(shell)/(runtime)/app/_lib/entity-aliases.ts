import { entityCodeFromRouteSegment, entitySlugFromCode } from "@athyper/runtime-shared/core";

export const ENTITY_ROUTE_ALIASES: Record<string, string> = {
  classification_config: "commodity_classification_config",
  classification_to_intent_rule: "commodity_classification_to_intent_rule",
  commodity_category_sales_policy: "commodity_category_sell_policy",
  intent_accounting_profile_rule: "intent_to_accounting_profile_rule",
  company_code_intent_policy: "commodity_category_buy_policy",
  company_code_supplier_intent_policy: "commodity_category_buy_policy",
  company_code_supplier_posting_override: "supplier_posting_override",
};

export function canonicalEntityCode(entityRouteSegment: string): string {
  const entityCode = entityCodeFromRouteSegment(entityRouteSegment);
  return ENTITY_ROUTE_ALIASES[entityCode] ?? entityCode;
}

export function canonicalEntitySlug(entityRouteSegment: string): string {
  return entitySlugFromCode(canonicalEntityCode(entityRouteSegment));
}
