import {
  Compass,
  FlaskConical,
  LayoutDashboard,
  Pencil,
  TableProperties,
  type LucideIcon,
} from "lucide-react";
import type { WorkbenchModeItem } from "@athyper/ui/composites";

export type TaxonomyWorkbenchId = "spend" | "intent";
export type TaxonomyWorkbenchMode = "overview" | "explorer" | "simulator" | "editor" | "matrix";

export interface TaxonomyRelatedApp {
  entityCode: string;
  label: string;
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
    label: "Spend Category",
    title: "Spend Category Workbench",
    workspace: "supply-chain",
    homeHref: "/supply-chain",
    href: "/workbench/supply-chain/spend-categories",
    entityCode: "spend_category",
    activeMode: "overview",
    modes: [
      mode("overview", "Overview", LayoutDashboard),
      mode("explorer", "Explorer", Compass),
      mode("simulator", "Simulator", FlaskConical),
      mode("editor", "Editor", Pencil),
      mode("matrix", "Matrix", TableProperties),
    ],
    relatedApps: [
      { entityCode: "spend_category", label: "Spend categories", href: "/app/spend_category", context: { param: "q", source: "code" } },
      { entityCode: "company_code_spend_policy", label: "Company policies", href: "/app/company_code_spend_policy", context: { param: "filter.spend_category_id", source: "id" } },
      { entityCode: "supplier_spend_category", label: "Supplier category links", href: "/app/supplier_spend_category", context: { param: "filter.spend_category_id", source: "id" } },
      { entityCode: "company_code_supplier_spend_policy", label: "Supplier policy overrides", href: "/app/company_code_supplier_spend_policy", context: { param: "filter.spend_category_id", source: "id" } },
      { entityCode: "classification_to_intent_rule", label: "Classification rules", href: "/app/classification_to_intent_rule?filter.classification_source=SPEND_CATEGORY", context: { param: "filter.classification_id", source: "id" } },
      { entityCode: "commodity_classification", label: "Commodity classifications", href: "/app/commodity_classification?filter.owner_type=spend_category", context: { param: "filter.owner_id", source: "id" } },
      { entityCode: "commodity_to_spend_category_rule", label: "Commodity routing rules", href: "/app/commodity_to_spend_category_rule", context: { param: "filter.spend_category_id", source: "id" } },
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
      { entityCode: "company_code_intent_policy", label: "Company intent policies", href: "/app/company_code_intent_policy" },
      { entityCode: "company_code_supplier_intent_policy", label: "Supplier intent policies", href: "/app/company_code_supplier_intent_policy" },
      { entityCode: "intent_accounting_profile_rule", label: "Accounting profile rules", href: "/app/intent_accounting_profile_rule" },
    ],
  },
};

export function getTaxonomyWorkbenchDefinition(id: TaxonomyWorkbenchId): TaxonomyWorkbenchDefinition {
  return TAXONOMY_WORKBENCHES[id];
}
