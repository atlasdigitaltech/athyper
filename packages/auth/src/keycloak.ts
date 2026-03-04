import type { Session, WorkbenchType } from "./types.js";

/**
 * DEV-ONLY: Uses Keycloak Direct Grant (password grant).
 * For production, migrate to Authorization Code + PKCE.
 */
export async function keycloakPasswordGrant(params: {
  baseUrl: string; // e.g. http://keycloak.local
  realm: string;   // e.g. neon-dev
  clientId: string; // neon-web
  username: string;
  password: string;
  workbench: WorkbenchType;
}): Promise<Session> {
  const tokenUrl = `${params.baseUrl}/realms/${params.realm}/protocol/openid-connect/token`;

  const body = new URLSearchParams();
  body.set("grant_type", "password");
  body.set("client_id", params.clientId);
  body.set("username", params.username);
  body.set("password", params.password);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Keycloak login failed (${res.status}): ${txt}`);
  }

  const json = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  };
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Number(json.expires_in ?? 300);

  // Fetch userinfo for roles (realm_access.roles)
  const userInfoUrl = `${params.baseUrl}/realms/${params.realm}/protocol/openid-connect/userinfo`;
  const uiRes = await fetch(userInfoUrl, {
    headers: { Authorization: `Bearer ${json.access_token}` }
  });

  let roles: string[] = [];
  if (uiRes.ok) {
    const ui = await uiRes.json() as { realm_access?: { roles?: string[] } };
    roles = ui?.realm_access?.roles ?? [];
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: now + expiresIn,
    username: params.username,
    workbench: params.workbench,
    roles
  };
}
