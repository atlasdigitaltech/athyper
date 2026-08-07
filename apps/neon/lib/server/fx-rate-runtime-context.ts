import type { V4Session } from "@athyper/platform-iam-auth-bff";

export function resolveFxRateTenantCode(session:V4Session):string|null {
  const membership=session.activeOrg?session.organizations[session.activeOrg]:undefined;
  const tenantCode=membership?.tenantCode?.trim();
  return tenantCode||null;
}
