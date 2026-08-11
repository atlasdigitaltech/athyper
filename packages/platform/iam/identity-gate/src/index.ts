export type IdentityGateDecision = { readonly kind: "allow" } | { readonly kind: "login"; readonly returnTo: string } | { readonly kind: "select-context" } | { readonly kind: "required-action"; readonly actions: readonly string[] };
export function decideIdentityGate(input: { readonly authenticated: boolean; readonly returnTo: string; readonly tenantId?: string; readonly requiredActions?: readonly string[] }): IdentityGateDecision {
  if (!input.authenticated) return { kind: "login", returnTo: safeReturnTo(input.returnTo) };
  if (input.requiredActions?.length) return { kind: "required-action", actions: Object.freeze([...new Set(input.requiredActions)]) };
  if (!input.tenantId) return { kind: "select-context" };
  return { kind: "allow" };
}
function safeReturnTo(value: string): string { return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/"; }
