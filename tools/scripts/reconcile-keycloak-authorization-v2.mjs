#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function planKeycloakReconciliation(current, desired) {
  validateManifest(desired);
  const clients = new Map(
    (current.clients ?? []).map((client) => [client.clientId, client]),
  );
  const groups = new Map(
    (current.groups ?? []).map((group) => [group.name, group]),
  );
  const operations = [];

  for (const expected of desired.clients) {
    const actual = clients.get(expected.clientId);
    if (!actual) {
      if (!expected.createIfMissing) {
        operations.push({
          kind: "conflict",
          resource: "client",
          key: expected.clientId,
          reason: "required pre-provisioned client is missing",
        });
        continue;
      }
      operations.push({
        kind: "create",
        resource: "client",
        key: expected.clientId,
        body: expected.create,
      });
      continue;
    }
    for (const [field, expectedValue] of Object.entries(expected.expected)) {
      if (actual[field] !== expectedValue) {
        operations.push({
          kind: "conflict",
          resource: "client",
          key: expected.clientId,
          field,
          expected: expectedValue,
          actual: actual[field],
          reason: "client field authority is conflict-fail",
        });
      }
    }
  }

  for (const expected of desired.groups) {
    const actual = groups.get(expected.name);
    if (!actual) {
      operations.push({
        kind: "create",
        resource: "group",
        key: expected.name,
        body: { name: expected.name, attributes: expected.attributes },
      });
      continue;
    }
    const managedPatch = {};
    for (const [key, value] of Object.entries(expected.attributes)) {
      if (!key.startsWith("athyper.authorization-v2.")) {
        throw new Error(`unmanaged Keycloak attribute in manifest: ${key}`);
      }
      if (JSON.stringify(actual.attributes?.[key] ?? null) !== JSON.stringify(value)) {
        managedPatch[key] = value;
      }
    }
    if (Object.keys(managedPatch).length > 0) {
      operations.push({
        kind: "patch",
        resource: "group",
        key: expected.name,
        id: actual.id,
        body: {
          ...actual,
          attributes: { ...(actual.attributes ?? {}), ...managedPatch },
        },
      });
    }
  }

  return {
    contractVersion: desired.contractVersion,
    realm: desired.realm,
    operations,
    conflicts: operations.filter((operation) => operation.kind === "conflict"),
    deletes: 0,
    userMutations: 0,
    unmanagedResourcesPreserved: true,
  };
}

export function planTenantOrganizationReconciliation(current, tenantManifest, realm) {
  if (
    tenantManifest.contractVersion !== "athyper.three-plane-provision.v1"
    || tenantManifest.realmKey !== realm
    || tenantManifest.keycloak?.organizationModel !== "tenant"
    || tenantManifest.keycloak?.businessScopesRemainPlaneLocal !== true
    || !Array.isArray(tenantManifest.tenants)
    || tenantManifest.tenants.length !== 3
  ) {
    throw new Error("invalid three-plane tenant organization manifest");
  }
  const existing = new Map((current ?? []).map((organization) => [organization.alias, organization]));
  const operations = [];
  for (const tenant of tenantManifest.tenants) {
    if (tenant.keycloakOrganizationAlias !== tenant.id || !isUuid(tenant.id)) {
      throw new Error(`tenant organization alias must equal tenant UUID: ${tenant.code}`);
    }
    const desired = {
      name: tenant.displayName,
      alias: tenant.id,
      enabled: true,
      attributes: {
        "athyper.context.kind": ["tenant"],
        "athyper.context.tenant_code": [tenant.code],
        "athyper.context.managed": ["true"],
      },
    };
    const actual = existing.get(tenant.id);
    if (!actual) {
      operations.push({ kind: "create", resource: "organization", key: tenant.code, body: desired });
      continue;
    }
    const managedAttributes = { ...(actual.attributes ?? {}), ...desired.attributes };
    if (
      actual.name !== desired.name
      || actual.enabled !== true
      || JSON.stringify(actual.attributes ?? {}) !== JSON.stringify(managedAttributes)
    ) {
      operations.push({
        kind: "patch",
        resource: "organization",
        key: tenant.code,
        id: actual.id,
        body: { ...actual, ...desired, attributes: managedAttributes },
      });
    }
  }
  return {
    operations,
    deletes: 0,
    legalEntityOrganizationsMutated: 0,
    tenantOrganizationCount: tenantManifest.tenants.length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const manifestPath = option(args, "--manifest")
    ?? "config/iam/keycloak-authorization-v2.manifest.json";
  const userManifestPath = option(args, "--user-manifest");
  const tenantManifestPath = option(args, "--tenant-manifest");
  const desired = JSON.parse(await readFile(manifestPath, "utf8"));
  const userManifest = userManifestPath
    ? JSON.parse(await readFile(userManifestPath, "utf8"))
    : null;
  const tenantManifest = tenantManifestPath
    ? JSON.parse(await readFile(tenantManifestPath, "utf8"))
    : null;
  const desiredMemberships = userManifest
    ? compileDesiredMemberships(userManifest, desired.realm)
    : [];
  for (const membership of desiredMemberships) {
    if (!desired.groups.some((group) => group.name === membership.groupName)) {
      desired.groups.push({
        name: membership.groupName,
        attributes: {
          "athyper.authorization-v2.managed": ["true"],
          "athyper.authorization-v2.plane": [membership.plane],
        },
      });
    }
  }
  const baseUrl = requiredEnv("KEYCLOAK_BASE_URL").replace(/\/$/, "");
  const adminRealm = process.env.KEYCLOAK_ADMIN_REALM?.trim() || "master";
  const username = requiredEnv("KEYCLOAK_ADMIN_USERNAME");
  const password = requiredEnv("KEYCLOAK_ADMIN_PASSWORD");
  const token = await adminToken(baseUrl, adminRealm, username, password);
  const realmPath = `/admin/realms/${encodeURIComponent(desired.realm)}`;
  const [clients, groups, organizations] = await Promise.all([
    requestJson(baseUrl, `${realmPath}/clients?first=0&max=500`, token),
    requestJson(baseUrl, `${realmPath}/groups?first=0&max=500&briefRepresentation=false`, token),
    tenantManifest
      ? requestJson(baseUrl, `${realmPath}/organizations?first=0&max=500&briefRepresentation=false`, token)
      : Promise.resolve([]),
  ]);
  const plan = planKeycloakReconciliation({ clients, groups }, desired);
  const organizationPlan = tenantManifest
    ? planTenantOrganizationReconciliation(organizations, tenantManifest, desired.realm)
    : { operations: [], deletes: 0, legalEntityOrganizationsMutated: 0, tenantOrganizationCount: 0 };
  if (plan.conflicts.length > 0) {
    throw new Error(
      `Keycloak conflict-fail reconciliation blocked: ${JSON.stringify(plan.conflicts)}`,
    );
  }
  if (apply) {
    for (const operation of plan.operations) {
      if (operation.kind === "create" && operation.resource === "group") {
        await requestJson(baseUrl, `${realmPath}/groups`, token, "POST", operation.body);
      } else if (operation.kind === "create" && operation.resource === "client") {
        await requestJson(baseUrl, `${realmPath}/clients`, token, "POST", operation.body);
      } else if (operation.kind === "patch" && operation.resource === "group") {
        await requestJson(
          baseUrl,
          `${realmPath}/groups/${encodeURIComponent(operation.id)}`,
          token,
          "PUT",
          operation.body,
        );
      }
    }
    for (const operation of organizationPlan.operations) {
      if (operation.kind === "create") {
        await requestJson(baseUrl, `${realmPath}/organizations`, token, "POST", operation.body);
      } else if (operation.kind === "patch") {
        await requestJson(
          baseUrl,
          `${realmPath}/organizations/${encodeURIComponent(operation.id)}`,
          token,
          "PUT",
          operation.body,
        );
      }
    }
  }
  const membershipOperations = [];
  if (desiredMemberships.length > 0) {
    const refreshedGroups = await requestJson(
      baseUrl,
      `${realmPath}/groups?first=0&max=500&briefRepresentation=false`,
      token,
    );
    const groupsByName = new Map(refreshedGroups.map((group) => [group.name, group]));
    for (const membership of desiredMemberships) {
      const group = groupsByName.get(membership.groupName);
      if (!group && !apply) {
        membershipOperations.push({
          kind: "add_after_group_create",
          resource: "user_group_membership",
          keycloakSubject: membership.keycloakSubject,
          groupName: membership.groupName,
        });
        continue;
      }
      if (!group) throw new Error(`managed Keycloak group missing after reconcile: ${membership.groupName}`);
      const currentGroups = await requestJson(
        baseUrl,
        `${realmPath}/users/${encodeURIComponent(membership.keycloakSubject)}/groups`,
        token,
      );
      if (currentGroups.some((item) => item.id === group.id)) continue;
      membershipOperations.push({
        kind: "add",
        resource: "user_group_membership",
        keycloakSubject: membership.keycloakSubject,
        groupName: membership.groupName,
      });
      if (apply) {
        await requestJson(
          baseUrl,
          `${realmPath}/users/${encodeURIComponent(membership.keycloakSubject)}/groups/${encodeURIComponent(group.id)}`,
          token,
          "PUT",
        );
      }
    }
  }
  process.stdout.write(`${JSON.stringify({
    ...plan,
    tenantOrganizationOperations: organizationPlan.operations,
    tenantOrganizationCount: organizationPlan.tenantOrganizationCount,
    legalEntityOrganizationsMutated: organizationPlan.legalEntityOrganizationsMutated,
    membershipOperations,
    managedMembershipCount: desiredMemberships.length,
    unmanagedUsersTouched: 0,
    mode: apply ? "applied" : "dry_run",
  }, null, 2)}\n`);
}

function compileDesiredMemberships(manifest, realm) {
  if (
    manifest.contractVersion !== "authorization-v2.approved-existing-user-groups.v1"
    || manifest.realm !== realm
    || manifest.deliberatelyClassifiedCount !== manifest.enabledSubjectCount
    || !manifest.subjectMappings
  ) {
    throw new Error("invalid approved subject-keyed user group manifest");
  }
  const memberships = [];
  for (const [keycloakSubject, mapping] of Object.entries(manifest.subjectMappings)) {
    for (const plane of mapping.planes ?? []) {
      const groupName = plane.group?.code;
      if (!groupName) throw new Error(`missing canonical group for subject ${keycloakSubject}`);
      memberships.push({ keycloakSubject, groupName, plane: plane.plane });
    }
  }
  return memberships.sort((left, right) =>
    left.keycloakSubject.localeCompare(right.keycloakSubject)
      || left.groupName.localeCompare(right.groupName)
  );
}

async function adminToken(baseUrl, realm, username, password) {
  const response = await fetch(
    `${baseUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "admin-cli",
        grant_type: "password",
        username,
        password,
      }),
    },
  );
  if (!response.ok) throw new Error(`Keycloak token request failed: ${response.status}`);
  const body = await response.json();
  if (!body.access_token) throw new Error("Keycloak token response has no access_token");
  return body.access_token;
}

async function requestJson(baseUrl, path, token, method = "GET", body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Keycloak ${method} ${path} failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}

function validateManifest(manifest) {
  if (
    manifest.contractVersion !== "wave6.keycloak-additive.v1"
    || !manifest.realm
    || !Array.isArray(manifest.clients)
    || !Array.isArray(manifest.groups)
    || manifest.destructiveOperations?.length !== 0
    || manifest.userOperations?.length !== 0
  ) {
    throw new Error("invalid additive Keycloak authorization manifest");
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function option(args, name) {
  return args.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim();
}

if (
  process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
