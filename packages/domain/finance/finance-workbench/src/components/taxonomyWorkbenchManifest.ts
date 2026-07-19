import {
  Building2,
  Compass,
  FlaskConical,
  Landmark,
  LayoutDashboard,
  Layers3,
  Pencil,
  TableProperties,
  Tags,
  type LucideIcon,
} from "lucide-react";
import type { WorkbenchModeItem } from "@athyper/ui/composites";

export type TaxonomyWorkbenchId = "spend" | "intent" | "accountingProfile";
export type TaxonomyWorkbenchMode = "overview" | "profile" | "explorer" | "classification" | "simulator" | "editor" | "matrix";

export interface TaxonomyRelatedApp {
  entityCode: string;
  label: string;
  description?: string;
  href: string;
  context?: {
    param: "q" | `filter.${string}`;
    source: "id" | "code" | "name" | "defaultIntentCode";
  };
}

export interface TaxonomyWorkbenchDefinition {
  id: TaxonomyWorkbenchId;
  label: string;
  title: string;
  workspace: "finance" | "supply-chain";
  homeHref: string;
  href: string;
  entityCode: string;
  activeMode: TaxonomyWorkbenchMode;
  modes: Array<WorkbenchModeItem & { key: TaxonomyWorkbenchMode; href?: string }>;
  relatedApps: TaxonomyRelatedApp[];
}

type TaxonomyWorkbenchModeOptions = Omit<Partial<WorkbenchModeItem>, "key" | "label" | "icon"> & {
  href?: string;
};

function mode(
  key: TaxonomyWorkbenchMode,
  label: string,
  icon: LucideIcon,
  options: TaxonomyWorkbenchModeOptions = {},
): TaxonomyWorkbenchDefinition["modes"][number] {
  return {
    key,
    label,
    icon,
    visible: true,
    ...options,
  };
}

export const TAXONOMY_WORKBENCHES: Record<TaxonomyWorkbenchId, TaxonomyWorkbenchDefinition> = {
  spend: {
    id: "spend",
    label: "Commodity Category",
    title: "Commodity Category Workbench",
    workspace: "supply-chain",
    homeHref: "/supply-chain",
    href: "/workbench/supply-chain/commodity-categories",
    entityCode: "commodity_category",
    activeMode: "overview",
    modes: [
      mode("overview", "Overview", LayoutDashboard),
      mode("profile", "Profile", Building2),
      mode("explorer", "Intent", Compass),
      mode("classification", "Classification", Tags),
      mode("editor", "Overlays", Layers3),
      mode("simulator", "Simulator", FlaskConical),
      mode("matrix", "Matrix", TableProperties),
    ],
    relatedApps: [
      {
        entityCode: "commodity_category",
        label: "Commodity Category",
        description: "Tenant category hierarchy with buy, sell, inventory, classification, and governance behavior.",
        href: "/app/commodity-category",
        context: { param: "q", source: "code" },
      },
      {
        entityCode: "commodity_classification_to_intent_rule",
        label: "Classification to Intent Rule",
        description: "Conditional rules that choose the business intent when category defaults need an override.",
        href: "/app/commodity-classification-to-intent-rule?filter.classification_source=COMMODITY_CATEGORY",
        context: { param: "filter.classification_id", source: "id" },
      },
      {
        entityCode: "commodity_classification",
        label: "Commodity Classification",
        description: "Commodity, UNSPSC, HS, and compliance concepts used to enrich spend decisions.",
        href: "/app/commodity-classification?filter.owner_type=commodity_category",
        context: { param: "filter.owner_id", source: "id" },
      },
      {
        entityCode: "commodity_code_to_category_rule",
        label: "Commodity Code to Category Rule",
        description: "Mappings that assign commodity code concepts to tenant commodity categories before intent resolution.",
        href: "/app/commodity-code-to-category-rule",
        context: { param: "filter.commodity_category_id", source: "id" },
      },
      {
        entityCode: "commodity_category_buy_policy",
        label: "Commodity Category Buy Policy",
        description: "Allowed/default business intents and accounting defaults for buy-side category behavior.",
        href: "/app/commodity-category-buy-policy",
        context: { param: "filter.commodity_category_id", source: "id" },
      },
      {
        entityCode: "commodity_category_sell_policy",
        label: "Commodity Category Sell Policy",
        description: "Sell-side intent, revenue recognition, tax, and accounting defaults for the category.",
        href: "/app/commodity-category-sell-policy",
        context: { param: "filter.commodity_category_id", source: "id" },
      },
      {
        entityCode: "commodity_category_inventory_policy",
        label: "Commodity Category Inventory Policy",
        description: "Stockability, valuation, tracking, and inventory posting policy for the category.",
        href: "/app/commodity-category-inventory-policy",
        context: { param: "filter.commodity_category_id", source: "id" },
      },
      {
        entityCode: "supplier_commodity_category",
        label: "Supplier Category Links",
        description: "Supplier eligibility and category links used during buying and invoice intake.",
        href: "/app/supplier-commodity-category",
        context: { param: "filter.commodity_category_id", source: "id" },
      },
      {
        entityCode: "commodity_category_buy_policy",
        label: "Supplier-scoped Spend Policy",
        description: "Supplier-scoped allowed/default business intents and buy-side defaults.",
        href: "/app/commodity-category-buy-policy?filter.scope_type=SUPPLIER_PROFILE",
        context: { param: "filter.commodity_category_id", source: "id" },
      },
    ],
  },
  intent: {
    id: "intent",
    label: "Business Intent",
    title: "Business Intent Workbench",
    workspace: "finance",
    homeHref: "/finance",
    href: "/finance/business-intents",
    entityCode: "business_intent",
    activeMode: "explorer",
    modes: [
      mode("explorer", "Explorer", Compass),
      mode("simulator", "Simulator", FlaskConical, { visible: false }),
      mode("editor", "Editor", Pencil, { visible: false }),
    ],
    relatedApps: [
      { entityCode: "business_intent", label: "Business intents", href: "/app/business-intent" },
      { entityCode: "commodity_category_buy_policy", label: "Buy intent policies", href: "/app/commodity-category-buy-policy" },
      { entityCode: "commodity_category_sell_policy", label: "Sell intent policies", href: "/app/commodity-category-sell-policy" },
      { entityCode: "intent_to_accounting_profile_rule", label: "Accounting profile rules", href: "/app/intent-to-accounting-profile-rule" },
    ],
  },
  accountingProfile: {
    id: "accountingProfile",
    label: "Accounting Profile",
    title: "Accounting Profile Workbench",
    workspace: "finance",
    homeHref: "/finance",
    href: "/workbench/finance/accounting-profiles",
    entityCode: "accounting_profile",
    activeMode: "overview",
    modes: [
      mode("overview", "Overview", LayoutDashboard),
      mode("profile", "Profile", Landmark),
      mode("simulator", "Simulator", FlaskConical),
    ],
    relatedApps: [
      {
        entityCode: "business_intent",
        label: "Business Intents",
        description: "Purpose and domain ontology used as the first accounting routing input.",
        href: "/app/business-intent",
      },
      {
        entityCode: "intent_to_accounting_profile_rule",
        label: "Intent to Profile Rules",
        description: "Priority and wildcard predicates that resolve an intent context to a profile config.",
        href: "/app/intent-to-accounting-profile-rule",
      },
      {
        entityCode: "accounting_profile",
        label: "Accounting Profiles",
        description: "Business-facing profile identity for AP, AR, asset, inventory, and other posting families.",
        href: "/app/accounting-profile",
        context: { param: "q", source: "code" },
      },
      {
        entityCode: "acct_profile_config",
        label: "Profile Configs",
        description: "Versioned runtime configuration behind each accounting profile.",
        href: "/app/acct-profile-config",
        context: { param: "filter.accounting_profile_id", source: "id" },
      },
      {
        entityCode: "acct_profile_event",
        label: "Profile Events",
        description: "Lifecycle events that decide when a profile creates journal entries.",
        href: "/app/acct-profile-event",
      },
      {
        entityCode: "acct_profile_entry_template",
        label: "Entry Templates",
        description: "Debit and credit line templates resolved for a profile event.",
        href: "/app/acct-profile-entry-template",
      },
      {
        entityCode: "acct_profile_book_rule",
        label: "Book Rules",
        description: "Per-book posting behavior: mirror, exclude, or remap.",
        href: "/app/acct-profile-book-rule",
      },
      {
        entityCode: "acct_profile_dimension_rule",
        label: "Dimension Rules",
        description: "Dimension derivation and fallback rules per profile config.",
        href: "/app/acct-profile-dimension-rule",
      },
      {
        entityCode: "acct_profile_commitment_config",
        label: "Commitment Config",
        description: "Optional commitment, encumbrance, advance, and retention behavior.",
        href: "/app/acct-profile-commitment-config",
      },
      {
        entityCode: "acct_profile_revenue_config",
        label: "Revenue Config",
        description: "Optional revenue recognition and paired COGS profile behavior.",
        href: "/app/acct-profile-revenue-config",
      },
      {
        entityCode: "acct_profile_settlement_config",
        label: "Settlement Config",
        description: "Optional settlement, discounting, and supply-chain-finance behavior.",
        href: "/app/acct-profile-settlement-config",
      },
    ],
  },
};

export function getTaxonomyWorkbenchDefinition(id: TaxonomyWorkbenchId): TaxonomyWorkbenchDefinition {
  return TAXONOMY_WORKBENCHES[id];
}
