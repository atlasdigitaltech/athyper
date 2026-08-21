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
  const existingNames = new Map((current ?? []).map((organization) => [organization.name, organization]));
  const operations = [];
  for (const tenant of tenantManifest.tenants) {
    if (tenant.keycloakOrganizationAlias !== tenant.id || !isUuid(tenant.id)) {
      throw new Error(`tenant organization alias must equal tenant UUID: ${tenant.code}`);
    }
    const nameOwner = existingNames.get(tenant.displayName);
    const organizationName = nameOwner && nameOwner.alias !== tenant.id
      ? `Tenant: ${tenant.displayName}`
      : tenant.displayName;
    const desired = {
      name: organizationName,
      alias: tenant.id,
      enabled: true,
      attributes: {
        "athyper.context.kind": ["tenant"],
        "athyper.context.tenant_code": [tenant.code],
        "athyper.context.display_name": [tenant.displayName],
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
  let tenantOrganizationMembershipOperations = [];
  if (tenantManifest && userManifest) {
    const refreshedOrganizations = await requestJson(
      baseUrl,
      `${realmPath}/organizations?first=0&max=500&briefRepresentation=false`,
      token,
    );
    const organizationsByAlias = new Map(
      refreshedOrganizations.map((organization) => [organization.alias, organization]),
    );
    const desiredOrganizationMemberships = compileDesiredTenantOrganizationMemberships(
      userManifest,
      tenantManifest,
      desired.realm,
    );
    const currentOrganizationMemberships = [];
    for (const tenant of tenantManifest.tenants) {
      const organization = organizationsByAlias.get(tenant.keycloakOrganizationAlias);
      if (!organization) continue;
      const members = await requestJson(
        baseUrl,
        `${realmPath}/organizations/${encodeURIComponent(organization.id)}/members?first=0&max=1000`,
        token,
      );
      for (const member of members) {
        currentOrganizationMemberships.push({
          organizationAlias: tenant.keycloakOrganizationAlias,
          keycloakSubject: member.id,
        });
      }
    }
    tenantOrganizationMembershipOperations = planTenantOrganizationMembershipReconciliation(
      currentOrganizationMemberships,
      desiredOrganizationMemberships,
    );
    for (const operation of tenantOrganizationMembershipOperations) {
      const organization = organizationsByAlias.get(operation.organizationAlias);
      if (!organization && !apply) {
        operation.kind = "add_after_organization_create";
        continue;
      }
      if (!organization) {
        throw new Error(`managed tenant organization missing after reconcile: ${operation.organizationAlias}`);
      }
      if (!apply) continue;
      await requestJson(
        baseUrl,
        `${realmPath}/organizations/${encodeURIComponent(organization.id)}/members`,
        token,
        "POST",
        operation.keycloakSubject,
      );
    }
  }
  let membershipOperations = [];
  let groupClientRoleOperations = [];
  if (desired.groups.length > 0) {
    const refreshedGroups = await requestJson(
      baseUrl,
      `${realmPath}/groups?first=0&max=500&briefRepresentation=false`,
      token,
    );
    const groupsByName = new Map(refreshedGroups.map((group) => [group.name, group]));
    const clientsByClientId = new Map(clients.map((client) => [client.clientId, client]));
    const desiredGroupClientRoles = [];
    const currentGroupClientRoles = [];
    const rolesByPlane = new Map();
    for (const expectedGroup of desired.groups) {
      const plane = expectedGroup.attributes?.["athyper.authorization-v2.plane"]?.[0];
      if (!plane) continue;
      const group = groupsByName.get(expectedGroup.name);
      const client = clientsByClientId.get(`${plane}-web`);
      if (!group?.id || !client?.id) {
        if (!apply) continue;
        throw new Error(`managed group/client missing for plane admission: ${expectedGroup.name}/${plane}`);
      }
      let role = rolesByPlane.get(plane);
      if (!role) {
        role = await requestJson(baseUrl, `${realmPath}/clients/${encodeURIComponent(client.id)}/roles/AUTHORIZED`, token);
        rolesByPlane.set(plane, role);
      }
      desiredGroupClientRoles.push({ groupName: expectedGroup.name, plane, clientUuid: client.id, role });
      const mapped = await requestJson(
        baseUrl,
        `${realmPath}/groups/${encodeURIComponent(group.id)}/role-mappings/clients/${encodeURIComponent(client.id)}`,
        token,
      );
      if (mapped.some((candidate) => candidate.name === "AUTHORIZED")) {
        currentGroupClientRoles.push({ groupName: expectedGroup.name, plane });
      }
    }
    groupClientRoleOperations = planManagedGroupClientRoleReconciliation(
      currentGroupClientRoles,
      desiredGroupClientRoles,
    );
    for (const operation of groupClientRoleOperations) {
      if (!apply) continue;
      const group = groupsByName.get(operation.groupName);
      if (!group?.id) throw new Error(`managed Keycloak group missing after reconcile: ${operation.groupName}`);
      await requestJson(
        baseUrl,
        `${realmPath}/groups/${encodeURIComponent(group.id)}/role-mappings/clients/${encodeURIComponent(operation.clientUuid)}`,
        token,
        "POST",
        [operation.role],
      );
    }
    const managedGroupNames = new Set(desired.groups
      .filter((group) => group.attributes?.["athyper.authorization-v2.managed"]?.includes("true"))
      .map((group) => group.name));
    const currentMemberships = [];
    for (const groupName of managedGroupNames) {
      const group = groupsByName.get(groupName);
      if (!group) continue;
      const members = await requestJson(
        baseUrl,
        `${realmPath}/groups/${encodeURIComponent(group.id)}/members?first=0&max=1000`,
        token,
      );
      for (const member of members) currentMemberships.push({ keycloakSubject: member.id, groupName });
    }
    membershipOperations = planManagedMembershipReconciliation(currentMemberships, desiredMemberships, managedGroupNames);
    for (const operation of membershipOperations) {
      const group = groupsByName.get(operation.groupName);
      if (!group && !apply && operation.kind === "add") {
        operation.kind = "add_after_group_create";
        continue;
      }
      if (!group) throw new Error(`managed Keycloak group missing after reconcile: ${operation.groupName}`);
      if (!apply) continue;
      await requestJson(
        baseUrl,
        `${realmPath}/users/${encodeURIComponent(operation.keycloakSubject)}/groups/${encodeURIComponent(group.id)}`,
        token,
        operation.kind === "remove" ? "DELETE" : "PUT",
      );
    }
  }
  process.stdout.write(`${JSON.stringify({
    ...plan,
    tenantOrganizationOperations: organizationPlan.operations,
    tenantOrganizationCount: organizationPlan.tenantOrganizationCount,
    legalEntityOrganizationsMutated: organizationPlan.legalEntityOrganizationsMutated,
    membershipOperations,
    groupClientRoleOperations,
    tenantOrganizationMembershipOperations,
    managedMembershipCount: desiredMemberships.length,
    unmanagedUsersTouched: 0,
    mode: apply ? "applied" : "dry_run",
  }, null, 2)}\n`);
}

export function planManagedGroupClientRoleReconciliation(current, desired) {
  const currentCoordinates = new Set(current.map((mapping) => `${mapping.groupName}\0${mapping.plane}`));
  return desired
    .filter((mapping) => !currentCoordinates.has(`${mapping.groupName}\0${mapping.plane}`))
    .map((mapping) => ({
      kind: "add",
      resource: "group_client_role",
      groupName: mapping.groupName,
      plane: mapping.plane,
      clientUuid: mapping.clientUuid,
      role: mapping.role,
    }))
    .sort((left, right) => left.groupName.localeCompare(right.groupName) || left.plane.localeCompare(right.plane));
}

export function planTenantOrganizationMembershipReconciliation(current, desired) {
  const key = (membership) => `${membership.organizationAlias}\0${membership.keycloakSubject}`;
  const currentKeys = new Set(current.map(key));
  return desired
    .filter((membership) => !currentKeys.has(key(membership)))
    .map((membership) => ({
      kind: "add",
      resource: "user_organization_membership",
      ...membership,
    }))
    .sort((left, right) => left.organizationAlias.localeCompare(right.organizationAlias)
      || left.keycloakSubject.localeCompare(right.keycloakSubject));
}

export function compileDesiredTenantOrganizationMemberships(manifest, tenantManifest, realm) {
  if (
    manifest.contractVersion !== "athyper.authorization.keycloak-admission.v1"
    || manifest.realm !== realm
    || manifest.unresolvedSubjectBehavior !== "deny"
    || manifest.mappedSubjectCount !== manifest.enabledSubjectCount
    || !manifest.subjectMappings
  ) {
    throw new Error("invalid clean-slate Keycloak admission manifest");
  }
  const tenantsByCode = new Map(tenantManifest.tenants.map((tenant) => [tenant.code, tenant]));
  const memberships = [];
  for (const [keycloakSubject, mapping] of Object.entries(manifest.subjectMappings)) {
    for (const tenantCode of mapping.tenantCodes ?? []) {
      const tenant = tenantsByCode.get(tenantCode);
      if (!tenant) throw new Error(`unknown tenant code for subject ${keycloakSubject}: ${tenantCode}`);
      memberships.push({
        keycloakSubject,
        organizationAlias: tenant.keycloakOrganizationAlias,
        tenantCode,
      });
    }
  }
  return memberships.sort((left, right) => left.organizationAlias.localeCompare(right.organizationAlias)
    || left.keycloakSubject.localeCompare(right.keycloakSubject));
}

export function planManagedMembershipReconciliation(current, desired, managedGroupNames) {
  const key = (membership) => `${membership.keycloakSubject}\0${membership.groupName}`;
  const desiredByKey = new Map(desired.map((membership) => [key(membership), membership]));
  const currentByKey = new Map(current
    .filter((membership) => managedGroupNames.has(membership.groupName))
    .map((membership) => [key(membership), membership]));
  return [
    ...[...desiredByKey].filter(([coordinate]) => !currentByKey.has(coordinate)).map(([, membership]) => ({
      kind: "add",
      resource: "user_group_membership",
      ...membership,
    })),
    ...[...currentByKey].filter(([coordinate]) => !desiredByKey.has(coordinate)).map(([, membership]) => ({
      kind: "remove",
      resource: "user_group_membership",
      ...membership,
    })),
  ].sort((left, right) => left.groupName.localeCompare(right.groupName)
    || left.keycloakSubject.localeCompare(right.keycloakSubject)
    || left.kind.localeCompare(right.kind));
}

function compileDesiredMemberships(manifest, realm) {
  if (
    manifest.contractVersion !== "athyper.authorization.keycloak-admission.v1"
    || manifest.realm !== realm
    || manifest.unresolvedSubjectBehavior !== "deny"
    || manifest.mappedSubjectCount !== manifest.enabledSubjectCount
    || !manifest.subjectMappings
  ) {
    throw new Error("invalid clean-slate Keycloak admission manifest");
  }
  const memberships = [];
  for (const [keycloakSubject, mapping] of Object.entries(manifest.subjectMappings)) {
    for (const plane of mapping.planes ?? []) {
      const groupName = plane.quarantineGroupCode;
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
