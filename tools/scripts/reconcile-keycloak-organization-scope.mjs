#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const CLIENTS = Object.freeze(["studio-web", "neon-web", "mesh-web"]);
const PLANE_SCOPES = Object.freeze({
  "studio-web": "athyper-studio-plane",
  "neon-web": "athyper-neon-plane",
  "mesh-web": "athyper-mesh-plane",
});

export function planOrganizationScopeReconciliation(clients, organizationScope) {
  if (!organizationScope?.id || organizationScope.name !== "organization") {
    throw new Error("Keycloak organization client scope is missing");
  }
  const byClientId = new Map(clients.map((client) => [client.clientId, client]));
  return CLIENTS.map((clientId) => {
    const client = byClientId.get(clientId);
    if (!client?.id) throw new Error(`Keycloak client is missing: ${clientId}`);
    const assigned = (client.optionalClientScopes ?? []).some((scope) => scope.id === organizationScope.id || scope.name === "organization");
    return { clientId, clientUuid: client.id, scopeId: organizationScope.id, action: assigned ? "none" : "add_optional_scope" };
  });
}

export function planPlaneDefaultScopeReconciliation(clients, scopes) {
  const scopesByName = new Map(scopes.map((scope) => [scope.name, scope]));
  const operations = [];
  for (const client of clients) {
    if (!client?.id || !PLANE_SCOPES[client.clientId]) throw new Error(`unsupported Keycloak plane client: ${client?.clientId ?? "missing"}`);
    for (const scopeName of ["roles", PLANE_SCOPES[client.clientId]]) {
      const scope = scopesByName.get(scopeName);
      if (!scope?.id) throw new Error(`Keycloak client scope is missing: ${scopeName}`);
      const assigned = (client.defaultClientScopes ?? []).some((candidate) => candidate.id === scope.id || candidate.name === scopeName);
      operations.push({
        clientId: client.clientId,
        clientUuid: client.id,
        scopeId: scope.id,
        scopeName,
        action: assigned ? "none" : "add_default_scope",
      });
    }
  }
  return operations;
}

export function planClientRoleIdTokenReconciliation(mappers) {
  const mapper = mappers.find((candidate) => candidate.name === "client roles"
    && candidate.protocolMapper === "oidc-usermodel-client-role-mapper");
  if (!mapper?.id) throw new Error("Keycloak roles/client roles mapper is missing");
  const body = {
    ...mapper,
    config: {
      ...(mapper.config ?? {}),
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "false",
    },
  };
  const action = mapper.config?.["id.token.claim"] === "true"
    && mapper.config?.["access.token.claim"] === "true"
    ? "none"
    : "patch";
  return { mapperId: mapper.id, action, body };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const baseUrl = keycloakBaseUrl();
  const realm = process.env.KEYCLOAK_REALM?.trim() || "athyper";
  const token = await adminToken(baseUrl, process.env.KEYCLOAK_ADMIN_REALM?.trim() || "master", required("KEYCLOAK_ADMIN_USERNAME"), required("KEYCLOAK_ADMIN_PASSWORD"));
  const realmPath = `/admin/realms/${encodeURIComponent(realm)}`;
  const scopes = await request(baseUrl, `${realmPath}/client-scopes`, token);
  const organizationScope = scopes.find((scope) => scope.name === "organization");
  const rolesScope = scopes.find((scope) => scope.name === "roles");
  if (!rolesScope?.id) throw new Error("Keycloak roles client scope is missing");
  const roleMappers = await request(baseUrl, `${realmPath}/client-scopes/${encodeURIComponent(rolesScope.id)}/protocol-mappers/models`, token);
  const clientRoleMapperOperation = planClientRoleIdTokenReconciliation(roleMappers);
  const clients = [];
  for (const clientId of CLIENTS) {
    const matches = await request(baseUrl, `${realmPath}/clients?clientId=${encodeURIComponent(clientId)}`, token);
    if (matches.length !== 1) throw new Error(`expected exactly one Keycloak client: ${clientId}`);
    const optionalClientScopes = await request(baseUrl, `${realmPath}/clients/${encodeURIComponent(matches[0].id)}/optional-client-scopes`, token);
    const defaultClientScopes = await request(baseUrl, `${realmPath}/clients/${encodeURIComponent(matches[0].id)}/default-client-scopes`, token);
    clients.push({ ...matches[0], optionalClientScopes, defaultClientScopes });
  }
  const operations = planOrganizationScopeReconciliation(clients, organizationScope);
  const defaultScopeOperations = planPlaneDefaultScopeReconciliation(clients, scopes);
  if (apply) for (const operation of operations) {
    if (operation.action !== "add_optional_scope") continue;
    await request(baseUrl, `${realmPath}/clients/${encodeURIComponent(operation.clientUuid)}/optional-client-scopes/${encodeURIComponent(operation.scopeId)}`, token, "PUT");
  }
  if (apply) for (const operation of defaultScopeOperations) {
    if (operation.action !== "add_default_scope") continue;
    await request(baseUrl, `${realmPath}/clients/${encodeURIComponent(operation.clientUuid)}/default-client-scopes/${encodeURIComponent(operation.scopeId)}`, token, "PUT");
  }
  if (apply && clientRoleMapperOperation.action === "patch") {
    await request(
      baseUrl,
      `${realmPath}/client-scopes/${encodeURIComponent(rolesScope.id)}/protocol-mappers/models/${encodeURIComponent(clientRoleMapperOperation.mapperId)}`,
      token,
      "PUT",
      clientRoleMapperOperation.body,
    );
  }
  const remaining = apply ? [] : [
    ...operations.filter((operation) => operation.action !== "none"),
    ...defaultScopeOperations.filter((operation) => operation.action !== "none"),
    ...(clientRoleMapperOperation.action === "none" ? [] : [clientRoleMapperOperation]),
  ];
  process.stdout.write(`${JSON.stringify({ realm, mode: apply ? "applied" : "dry_run", operations, defaultScopeOperations, clientRoleMapperOperation, ready: apply || remaining.length === 0 }, null, 2)}\n`);
}

async function adminToken(baseUrl, realm, username, password) {
  const response = await fetch(`${baseUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: "admin-cli", grant_type: "password", username, password }) });
  if (!response.ok) throw new Error(`Keycloak token request failed: ${response.status}`);
  const body = await response.json(); if (!body.access_token) throw new Error("Keycloak token response has no access_token"); return body.access_token;
}
async function request(baseUrl, path, token, method="GET", body) { const response=await fetch(`${baseUrl}${path}`,{method,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{"content-type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});if(!response.ok)throw new Error(`Keycloak ${method} ${path} failed: ${response.status}`);if(response.status===204)return null;const raw=await response.text();return raw?JSON.parse(raw):null; }
function required(name) { const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value; }
function keycloakBaseUrl() { const explicit=process.env.KEYCLOAK_BASE_URL?.trim();if(explicit)return explicit.replace(/\/$/,"");const issuer=process.env.IAM_ISSUER_URL?.trim();if(!issuer)throw new Error("KEYCLOAK_BASE_URL or IAM_ISSUER_URL is required");return issuer.replace(/\/realms\/[^/]+\/?$/,"").replace(/\/$/,""); }

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
