/** Shared entity routes resolve their context requirement from the descriptor. */
export function isTenantWorkspaceRoute(pathname: string): boolean {
  return pathname.startsWith("/app/entity/") || pathname === "/mdg/business-partner/register";
}
