/** Published common catalog for owner-scoped identity entities on every plane. */
export const IDENTITY_PERMISSION_CATALOG = {
  "common.identity.principal.read": "low",
  "common.identity.principal_profile.read": "low",
  "common.identity.principal_profile.edit": "medium",
  "common.identity.principal_notification_preference.read": "low",
  "common.identity.principal_notification_preference.edit": "medium",
  "common.identity.principal.administer": "high",
} as const;
export function isIdentityPermissionCode(
  value: string,
): value is keyof typeof IDENTITY_PERMISSION_CATALOG {
  return Object.hasOwn(IDENTITY_PERMISSION_CATALOG, value);
}
