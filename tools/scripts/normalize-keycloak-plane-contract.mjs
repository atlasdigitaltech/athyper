#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const realmPath = resolve(process.cwd(), "stack/config/iam/realm-athyper.json");
const write = process.argv.includes("--write");
const planes = Object.freeze({
  neon: Object.freeze({ scope: "athyper-neon-plane", role: "NEON_USER" }),
  mesh: Object.freeze({ scope: "athyper-mesh-plane", role: "MESH_BUYER_USER" }),
  studio: Object.freeze({ scope: "athyper-studio-plane", role: "STUDIO_USER" }),
});

const realm = JSON.parse(readFileSync(realmPath, "utf8"));
const errors = [];

for (const [plane, definition] of Object.entries(planes)) {
  const scope = realm.clientScopes?.find((candidate) => candidate.name === definition.scope);
  if (!scope) {
    errors.push(`Missing client scope ${definition.scope}`);
    continue;
  }
  const existingIds = new Map((scope.protocolMappers ?? []).map((mapper) => [mapper.name, mapper.id]));
  const expected = expectedMappers(plane, existingIds);
  if (write) {
    scope.description = `${title(plane)} client identity invariants and tenant discovery metadata.`;
    scope.protocolMappers = expected;
  } else {
    verifyMappers(scope, expected, errors);
  }

  const mapping = realm.scopeMappings?.find((candidate) => candidate.clientScope === definition.scope);
  if (write) {
    if (mapping) mapping.roles = [definition.role];
    else (realm.scopeMappings ??= []).push({ clientScope: definition.scope, roles: [definition.role] });
  } else if (!mapping || JSON.stringify(mapping.roles) !== JSON.stringify([definition.role])) {
    errors.push(`${definition.scope} must scope exactly the ${definition.role} realm role`);
  }

  const realmRole = realm.roles?.realm?.find((candidate) => candidate.name === definition.role);
  const compositeRoles = realmRole?.composites?.client?.[`${plane}-web`] ?? [];
  if (!realmRole || !compositeRoles.includes("AUTHORIZED")) {
    errors.push(`${definition.role} must include ${plane}-web.AUTHORIZED as a composite`);
  }
}

const rolesScope = realm.clientScopes?.find((scope) => scope.name === "roles");
const realmRoleMapper = rolesScope?.protocolMappers?.find((mapper) => mapper.name === "realm roles");
const clientRoleMapper = rolesScope?.protocolMappers?.find((mapper) => mapper.name === "client roles");
if (!realmRoleMapper) errors.push("Missing roles/realm roles mapper");
else if (write) {
  realmRoleMapper.config["id.token.claim"] = "true";
  realmRoleMapper.config["access.token.claim"] = "true";
  realmRoleMapper.config["userinfo.token.claim"] = "false";
} else if (realmRoleMapper.config?.["id.token.claim"] !== "true" || realmRoleMapper.config?.["access.token.claim"] !== "true") {
  errors.push("Realm roles must be emitted in both ID and access tokens");
}
if (!clientRoleMapper || clientRoleMapper.config?.["access.token.claim"] !== "true") {
  errors.push("Client roles must be emitted in access tokens");
}

for (const plane of Object.keys(planes)) {
  const client = realm.clients?.find((candidate) => candidate.clientId === `${plane}-web`);
  if (!client) {
    errors.push(`Missing client ${plane}-web`);
    continue;
  }
  if (write) {
    client.protocolMappers = (client.protocolMappers ?? []).filter((mapper) => mapper.protocolMapper !== "oidc-group-membership-mapper");
    client.defaultClientScopes = (client.defaultClientScopes ?? []).filter((scope) => scope !== "organization");
    client.frontchannelLogout = false;
  } else {
    if (client.fullScopeAllowed !== false) errors.push(`${plane}-web must keep fullScopeAllowed=false`);
    if (!(client.defaultClientScopes ?? []).includes(planes[plane].scope)) errors.push(`${plane}-web is missing ${planes[plane].scope}`);
    if ((client.defaultClientScopes ?? []).includes("organization")) errors.push(`${plane}-web must not default the organization scope`);
    if ((client.protocolMappers ?? []).some((mapper) => mapper.protocolMapper === "oidc-group-membership-mapper")) errors.push(`${plane}-web must not emit full group membership`);
    if (client.frontchannelLogout !== false) errors.push(`${plane}-web must disable front-channel logout and use the registered back-channel endpoint`);
    const logoutUrl = client.attributes?.["backchannel.logout.url"] ?? "";
    if (!logoutUrl.endsWith("/api/auth/backchannel-logout")) errors.push(`${plane}-web must register its exact back-channel logout route`);
    const postLogout = client.attributes?.["post.logout.redirect.uris"] ?? "";
    const redirects = postLogout.split("##").filter(Boolean);
    if (!redirects.length || redirects.some((value) => !value.endsWith("/api/auth/logout/callback") || value.includes("*"))) errors.push(`${plane}-web must register only exact logout callback paths`);
    const audience = (client.protocolMappers ?? []).find((mapper) => mapper.protocolMapper === "oidc-audience-mapper");
    if (audience?.config?.["included.client.audience"] !== "athyper-api-runtime" || audience.config?.["access.token.claim"] !== "true") errors.push(`${plane}-web must emit the athyper-api-runtime access-token audience`);
    const roleMapping = realm.clientScopeMappings?.[`${plane}-web`]?.find((mapping) => mapping.client === `${plane}-web`);
    if (!roleMapping || JSON.stringify(roleMapping.roles) !== JSON.stringify(["AUTHORIZED"])) errors.push(`${plane}-web must scope exactly its AUTHORIZED client role`);
  }
}

if (write) {
  writeFileSync(realmPath, `${JSON.stringify(realm, null, 2)}\n`);
  console.log(`Normalized Keycloak plane contract in ${realmPath}`);
} else if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Keycloak plane contract is canonical.");
}

function expectedMappers(plane, ids) {
  return [
    hardcoded(ids.get("plane") ?? ids.get("plane_access"), "plane", "plane", plane),
    hardcoded(ids.get("realm_key"), "realm_key", "realm_key", "athyper"),
    userAttribute(ids.get("tenant_code"), "tenant_code", "tenant_code", "athyper.tenant_code", true, false),
  ];
}

function hardcoded(id, name, claim, value) {
  return {
    ...(id ? { id } : {}),
    name,
    protocol: "openid-connect",
    protocolMapper: "oidc-hardcoded-claim-mapper",
    consentRequired: false,
    config: {
      "claim.value": value,
      "userinfo.token.claim": "false",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "introspection.token.claim": "true",
      "claim.name": claim,
      "jsonType.label": "String",
    },
  };
}

function userAttribute(id, name, attribute, claim, idToken, accessToken) {
  return {
    ...(id ? { id } : {}),
    name,
    protocol: "openid-connect",
    protocolMapper: "oidc-usermodel-attribute-mapper",
    consentRequired: false,
    config: {
      "aggregate.attrs": "false",
      "userinfo.token.claim": "true",
      multivalued: "false",
      "user.attribute": attribute,
      "id.token.claim": String(idToken),
      "access.token.claim": String(accessToken),
      "introspection.token.claim": String(accessToken),
      "claim.name": claim,
      "jsonType.label": "String",
    },
  };
}

function verifyMappers(scope, expected, errors) {
  const actual = scope.protocolMappers ?? [];
  if (actual.length !== expected.length) {
    errors.push(`${scope.name} must contain exactly ${expected.length} protocol mappers (found ${actual.length})`);
    return;
  }
  for (const mapper of expected) {
    const candidate = actual.find((entry) => entry.name === mapper.name);
    if (!candidate || candidate.protocolMapper !== mapper.protocolMapper || !sameConfig(candidate.config, mapper.config)) {
      errors.push(`${scope.name}/${mapper.name} does not match the canonical mapper contract`);
    }
  }
}

function sameConfig(actual = {}, expected = {}) {
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function title(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
