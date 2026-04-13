/**
 * Resolves realm, clientId, and session namespace from a platform/tenant flag.
 * Centralises the env-var pattern duplicated across login, callback, logout, refresh.
 */
export function resolveRealmConfig(isPlatform: boolean): {
  realm: string;
  clientId: string;
  sessionNamespace: string;
} {
  const realm = isPlatform
    ? (process.env.PLATFORM_KEYCLOAK_REALM ?? "platform-control")
    : (process.env.KEYCLOAK_REALM ?? "athyper");
  const clientId = isPlatform
    ? (process.env.PLATFORM_KEYCLOAK_CLIENT_ID ?? "athyper-admin")
    : (process.env.KEYCLOAK_CLIENT_ID ?? "neon-web");
  const sessionNamespace = isPlatform ? "platform" : realm;
  return { realm, clientId, sessionNamespace };
}
