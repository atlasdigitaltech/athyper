/**
 * MFA Configuration — Per-Organization TOTP enforcement.
 *
 * Add or remove org aliases to control which organizations require
 * users to set up a TOTP authenticator (Google Authenticator, etc.)
 * on first login with Keycloak username/password.
 *
 * GitHub and Microsoft IDP users are NEVER prompted for TOTP regardless
 * of this list (they have no Keycloak password credential).
 *
 * Available orgs: demo_ca, demo_ch, demo_de, demo_fr, demo_in,
 *                 demo_my, demo_qa, demo_sa, demo_us
 */
export const MFA_REQUIRED_ORGS = [
  "demo_ca",
  "demo_fr",
  "demo_in",
  "demo_sa",
];

/**
 * Extract the org alias from a Keycloak group path.
 * e.g. "/org/demo_ca/persona/viewer" → "demo_ca"
 *      "/org/demo_us" → "demo_us"
 *      undefined/other → null
 */
export function getOrgFromGroups(groups = []) {
  for (const g of groups) {
    const match = g.match(/^\/org\/([^/]+)/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Returns true if the user's org requires MFA.
 */
export function requiresMfa(groups = []) {
  const org = getOrgFromGroups(groups);
  return org !== null && MFA_REQUIRED_ORGS.includes(org);
}
