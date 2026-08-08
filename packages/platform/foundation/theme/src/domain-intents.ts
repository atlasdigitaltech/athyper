import type { SemanticIntent } from "./semantic-colors";

const normalize = (value: string) => value.toLowerCase();

const ACCOUNT_CLASS: Record<string, SemanticIntent> = {
  asset: "primary", contra_asset: "muted", liability: "accent",
  contra_liability: "muted", equity: "info", contra_equity: "muted",
  income: "success", expense: "warning",
};
const CHART_TIER: Record<string, SemanticIntent> = {
  group: "accent", operating: "primary", local: "warning",
};
const CONSOL_METHOD: Record<string, SemanticIntent> = {
  full: "success", proportional: "primary", equity: "warning",
};
const OWNER_TYPE: Record<string, SemanticIntent> = {
  customer: "primary", supplier: "accent", employee: "warning", internal: "neutral",
};
const PAYMENT_DIRECTION: Record<string, SemanticIntent> = {
  inbound: "success", outbound: "primary",
};
const RECON_TYPE: Record<string, SemanticIntent> = {
  auto: "primary", manual: "warning",
};

export function accountClassIntent(value: string): SemanticIntent {
  return ACCOUNT_CLASS[normalize(value)] ?? "neutral";
}
export function chartTierIntent(value: string): SemanticIntent {
  return CHART_TIER[normalize(value)] ?? "neutral";
}
export function consolMethodIntent(value: string): SemanticIntent {
  return CONSOL_METHOD[normalize(value)] ?? "neutral";
}
export function ownerTypeIntent(value: string): SemanticIntent {
  return OWNER_TYPE[normalize(value)] ?? "neutral";
}
export function paymentDirectionIntent(value: string): SemanticIntent {
  return PAYMENT_DIRECTION[normalize(value)] ?? "neutral";
}
export function reconTypeIntent(value: string): SemanticIntent {
  return RECON_TYPE[normalize(value)] ?? "neutral";
}
