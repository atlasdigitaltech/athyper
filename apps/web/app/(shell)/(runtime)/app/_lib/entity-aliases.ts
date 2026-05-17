export const ENTITY_ROUTE_ALIASES: Record<string, string> = {
  classification_config: "commodity_classification_config",
  classification_to_intent_rule: "commodity_classification_to_intent_rule",
  commodity_category_spend_policy: "commodity_category_buy_policy",
  commodity_category_sales_policy: "commodity_category_sell_policy",
  cc_supplier_spend_policy: "commodity_category_buy_policy",
  company_code_spend_policy: "commodity_category_buy_policy",
  company_code_intent_policy: "commodity_category_buy_policy",
  company_code_supplier_spend_policy: "commodity_category_buy_policy",
  company_code_supplier_intent_policy: "commodity_category_buy_policy",
  company_code_supplier_posting_override: "supplier_posting_override",
  supplier_spend_category: "supplier_commodity_category",
};

export function canonicalEntityCode(entityCode: string): string {
  return ENTITY_ROUTE_ALIASES[entityCode] ?? entityCode;
}
