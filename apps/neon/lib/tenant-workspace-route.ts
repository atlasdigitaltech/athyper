/** Exact routes only: commercial paths must retain the work-context gate. */
export function isTenantWorkspaceRoute(pathname: string): boolean {
  return pathname === "/mdg/business-partner/register";
}
