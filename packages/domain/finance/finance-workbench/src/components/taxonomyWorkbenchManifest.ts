import {
  Compass,
  FlaskConical,
  LayoutDashboard,
  Layers3,
  Pencil,
  TableProperties,
  Tags,
  type LucideIcon,
} from "lucide-react";
import type { WorkbenchModeItem } from "@athyper/ui/composites";

export type TaxonomyWorkbenchId = "spend" | "intent";
export type TaxonomyWorkbenchMode = "overview" | "explorer" | "classification" | "simulator" | "editor" | "matrix";

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
      mode("explorer", "Intent", Compass),
      mode("classification", "Classification", Tags),
      mode("editor", "Overlays", Layers3),
      mode("simulator", "Simulator", FlaskConical),
      mode("matrix", "Matrix", TableProperties, { visible: false }),
    ],
    relatedApps: [
      {
        entityCode: "commodity_category",
        label: "Commodity Category",
        description: "Tenant category hierarchy with buy, sell, inventory, classification, and governance behavior.",
        href: "/app/commodity_category",
        context: { param: "q", source: "code" },
      },
      {
        entityCode: "commodity_classification_to_intent_rule",
        label: "Classification to Intent Rule",
        description: "Conditional rules that choose the business intent when category defaults need an override.",
        href: "/app/commodity_classification_to_intent_rule?filter.classification_source=COMMODITY_CATEGORY",
        context: { param: "filter.classification_id", source: "id" },
      },
      {
        entityCode: "commodity_classification",
        label: "Commodity Classification",
        description: "Commodity, UNSPSC, HS, and compliance concepts used to enrich spend decisions.",
        href: "/app/commodity_classification?filter.owner_type=commodity_category",
        context: { param: "filter.owner_id", source: "id" },
      },
      {
        entityCode: "commodity_code_to_category_rule",
        label: "Commodity Code to Category Rule",
        description: "Mappings that assign commodity code concepts to tenant commodity categories before intent resolution.",
        href: "/app/commodity_code_to_category_rule",
        context: { param: "filter.commodity_category_id", source: "id" },
      },
      {
        entityCode: "commodity_category_buy_policy",
        label: "Commodity Category Spend Policy",
        description: "Allowed/default business intents and accounting defaults for buy-side category behavior.",
        href: "/app/commodity_category_buy_policy",
        context: { param: "filter.commodity_category_id", source: "id" },
      },
      {
        entityCode: "supplier_commodity_category",
        label: "Supplier Category Links",
        description: "Supplier eligibility and category links used during buying and invoice intake.",
        href: "/app/supplier_commodity_category",
        context: { param: "filter.commodity_category_id", source: "id" },
      },
      {
        entityCode: "commodity_category_buy_policy",
        label: "Supplier-scoped Spend Policy",
        description: "Supplier-scoped allowed/default business intents and buy-side defaults.",
        href: "/app/commodity_category_buy_policy?filter.scope_type=SUPPLIER_PROFILE",
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
      { entityCode: "business_intent", label: "Business intents", href: "/app/business_intent" },
      { entityCode: "commodity_category_buy_policy", label: "Buy intent policies", href: "/app/commodity_category_buy_policy" },
      { entityCode: "commodity_category_sell_policy", label: "Sell intent policies", href: "/app/commodity_category_sell_policy" },
      { entityCode: "intent_accounting_profile_rule", label: "Accounting profile rules", href: "/app/intent_accounting_profile_rule" },
    ],
  },
};

export function getTaxonomyWorkbenchDefinition(id: TaxonomyWorkbenchId): TaxonomyWorkbenchDefinition {
  return TAXONOMY_WORKBENCHES[id];
}
