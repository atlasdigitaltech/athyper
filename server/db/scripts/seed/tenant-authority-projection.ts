import { createHash } from "node:crypto";

type Plane = "studio" | "neon" | "mesh";

interface Tenant {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

interface RoleTemplate {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly plane: string;
  readonly permissionIds: readonly string[];
  readonly checksum: string;
}

interface GroupTemplate {
  readonly id: string;
  readonly code: string;
  readonly plane: string;
  readonly roleIds: readonly string[];
  readonly scopeKind: string;
  readonly zeroGrant: boolean;
}

interface SubjectAssignment {
  readonly keycloakSubject: string;
  readonly username: string;
  readonly tenantCodes: readonly string[];
  readonly planes: readonly {
    readonly plane: string;
    readonly membershipStatus: "active";
    readonly group: GroupTemplate;
    readonly scopedRoleAssignments: readonly {
      readonly scopeKind: string;
      readonly scopeKey: string;
      readonly groupCode: string;
    }[];
  }[];
}

interface CatalogOperation {
  readonly permissionId?: string;
  readonly canonicalPermissionCode?: string;
}

export interface TenantAuthorityProjection {
  readonly contractVersion: "athyper.authorization.tenant-authority-projection.v1";
  readonly plane: Plane;
  readonly definitions: {
    readonly roles: readonly {
      readonly id: string;
      readonly tenantId: string;
      readonly templateRoleId: string;
      readonly code: string;
      readonly name: string;
      readonly sourceChecksum: string;
    }[];
    readonly rolePermissions: readonly {
      readonly id: string;
      readonly tenantId: string;
      readonly roleId: string;
      readonly permissionId: string;
      readonly permissionCode: string;
    }[];
    readonly principalGroups: readonly {
      readonly id: string;
      readonly tenantId: string;
      readonly templateGroupId: string;
      readonly code: string;
      readonly name: string;
      readonly zeroGrant: boolean;
    }[];
  };
  readonly assignments: {
    readonly planeMemberships: readonly {
      readonly id: string;
      readonly tenantId: string;
      readonly principalId: string;
      readonly keycloakSubject: string;
      readonly status: "active";
    }[];
    readonly scopeTargets: readonly {
      readonly id: string;
      readonly tenantId: string;
      readonly scopeKind: string;
      readonly scopeKey: string;
      readonly targetId: string;
      readonly parentScopeTargetId: string | null;
    }[];
    readonly groupMembers: readonly {
      readonly id: string;
      readonly tenantId: string;
      readonly groupId: string;
      readonly principalId: string;
      readonly keycloakSubject: string;
    }[];
    readonly groupRoles: readonly {
      readonly id: string;
      readonly tenantId: string;
      readonly groupId: string;
      readonly roleId: string;
      readonly scopeTargetId: string;
      readonly propagationMode: "exact";
    }[];
  };
  readonly sha256: string;
}

export function compileTenantAuthorityProjection(input: {
  readonly plane: Plane;
  readonly tenants: readonly Tenant[];
  readonly roles: readonly RoleTemplate[];
  readonly groups: readonly GroupTemplate[];
  readonly operations: readonly CatalogOperation[];
  readonly subjects: readonly SubjectAssignment[];
}): TenantAuthorityProjection {
  const roles = input.roles.filter((role) => role.plane === input.plane);
  const groups = input.groups.filter((group) => group.plane === input.plane);
  const permissionById = new Map(input.operations.flatMap((operation) =>
    operation.permissionId && operation.canonicalPermissionCode
      ? [[operation.permissionId, operation.canonicalPermissionCode] as const]
      : []));
  const roleByTemplateId = new Map(roles.map((role) => [role.id, role]));
  const tenantByCode = new Map(input.tenants.map((tenant) => [tenant.code, tenant]));

  const definitionRoles = input.tenants.flatMap((tenant) => roles.map((role) => ({
    id: uuid(input.plane, tenant.id, "role", role.code),
    tenantId: tenant.id,
    templateRoleId: role.id,
    code: role.code,
    name: role.name,
    sourceChecksum: role.checksum,
  })));
  const definitionRoleByCoordinate = new Map(definitionRoles.map((role) =>
    [`${role.tenantId}:${role.templateRoleId}`, role]));

  const rolePermissions = input.tenants.flatMap((tenant) => roles.flatMap((role) => {
    const materializedRole = required(definitionRoleByCoordinate, `${tenant.id}:${role.id}`, "role definition");
    return role.permissionIds.map((permissionId) => {
      const permissionCode = permissionById.get(permissionId);
      if (!permissionCode) throw new Error(`${input.plane}/${role.code} references uncatalogued permission ${permissionId}`);
      return {
        id: uuid(input.plane, tenant.id, "role-permission", role.code, permissionId),
        tenantId: tenant.id,
        roleId: materializedRole.id,
        permissionId,
        permissionCode,
      };
    });
  }));
  const principalGroups = input.tenants.flatMap((tenant) => groups.map((group) => ({
    id: uuid(input.plane, tenant.code, "group", group.code),
    tenantId: tenant.id,
    templateGroupId: group.id,
    code: group.code,
    name: humanize(group.code),
    zeroGrant: group.zeroGrant,
  })));
  const groupByCoordinate = new Map(principalGroups.map((group) =>
    [`${group.tenantId}:${group.templateGroupId}`, group]));

  const scopeTargets = new Map<string, TenantAuthorityProjection["assignments"]["scopeTargets"][number]>();
  for (const tenant of input.tenants) {
    const id = uuid(input.plane, tenant.code, "scope", "tenant");
    scopeTargets.set(`${tenant.id}:tenant:${tenant.code}`, {
      id,
      tenantId: tenant.id,
      scopeKind: "tenant",
      scopeKey: tenant.code,
      targetId: tenant.id,
      parentScopeTargetId: null,
    });
  }

  const planeMemberships = [] as Array<TenantAuthorityProjection["assignments"]["planeMemberships"][number]>;
  const groupMembers = [] as Array<TenantAuthorityProjection["assignments"]["groupMembers"][number]>;
  const groupRoles = [] as Array<TenantAuthorityProjection["assignments"]["groupRoles"][number]>;
  for (const subject of input.subjects) {
    for (const tenantCode of subject.tenantCodes) {
      const tenant = tenantByCode.get(tenantCode);
      if (!tenant) throw new Error(`${input.plane} assignment references unknown tenant ${tenantCode}`);
      for (const assignment of subject.planes.filter((item) => item.plane === input.plane)) {
        const principalId = uuid(input.plane, tenant.id, "principal", subject.keycloakSubject);
        planeMemberships.push({
          id: uuid(input.plane, tenant.id, "membership", principalId),
          tenantId: tenant.id,
          principalId,
          keycloakSubject: subject.keycloakSubject,
          status: assignment.membershipStatus,
        });
        const group = required(groupByCoordinate, `${tenant.id}:${assignment.group.id}`, "principal group definition");
        groupMembers.push({
          id: uuid(input.plane, tenant.code, "group-member", assignment.group.code, subject.keycloakSubject),
          tenantId: tenant.id,
          groupId: group.id,
          principalId,
          keycloakSubject: subject.keycloakSubject,
        });
        for (const scoped of assignment.scopedRoleAssignments) {
          if (scoped.groupCode !== assignment.group.code) {
            throw new Error(`${input.plane} scoped assignment group mismatch: ${scoped.groupCode}`);
          }
          const kind = scoped.scopeKind === "account" ? "network_account" : scoped.scopeKind;
          const targetId = kind === "tenant"
            ? tenant.id
            : kind === "legal_entity"
              ? uuid(input.plane, tenant.code, "legal-entity", scoped.scopeKey)
              : kind === "network_account"
                ? uuid(input.plane, tenant.code, "network-account", scoped.scopeKey)
                : uuid(input.plane, tenant.code, "scope-resource", kind, scoped.scopeKey);
          const scopeId = kind === "tenant"
            ? uuid(input.plane, tenant.code, "scope", "tenant")
            : kind === "legal_entity" || kind === "network_account"
              ? databaseManagedScopeUuid(tenant.id, kind, targetId)
              : uuid(input.plane, tenant.id, "scope", kind, scoped.scopeKey);
          scopeTargets.set(`${tenant.id}:${kind}:${scoped.scopeKey}`, {
            id: scopeId,
            tenantId: tenant.id,
            scopeKind: kind,
            scopeKey: scoped.scopeKey,
            targetId,
            parentScopeTargetId: kind === "tenant" ? null : uuid(input.plane, tenant.code, "scope", "tenant"),
          });
          if (assignment.group.zeroGrant) continue;
          for (const templateRoleId of assignment.group.roleIds) {
            const templateRole = roleByTemplateId.get(templateRoleId);
            if (!templateRole) throw new Error(`${input.plane}/${assignment.group.code} references unknown role ${templateRoleId}`);
            const role = required(definitionRoleByCoordinate, `${tenant.id}:${templateRoleId}`, "role definition");
            groupRoles.push({
              id: uuid(input.plane, tenant.code, "group-role", assignment.group.code, templateRole.code, scoped.scopeKey),
              tenantId: tenant.id,
              groupId: group.id,
              roleId: role.id,
              scopeTargetId: scopeId,
              propagationMode: "exact",
            });
          }
        }
      }
    }
  }

  const body = {
    contractVersion: "athyper.authorization.tenant-authority-projection.v1" as const,
    plane: input.plane,
    definitions: {
      roles: sorted(definitionRoles, (item) => `${item.tenantId}:${item.code}`),
      rolePermissions: sorted(rolePermissions, (item) => `${item.tenantId}:${item.permissionCode}:${item.roleId}`),
      principalGroups: sorted(principalGroups, (item) => `${item.tenantId}:${item.code}`),
    },
    assignments: {
      planeMemberships: unique(planeMemberships, (item) => item.id, "plane membership"),
      scopeTargets: unique([...scopeTargets.values()], (item) => item.id, "scope target"),
      groupMembers: unique(groupMembers, (item) => item.id, "group member"),
      groupRoles: unique(groupRoles, (item) => item.id, "group role"),
    },
  };
  validateReferences(body);
  return { ...body, sha256: createHash("sha256").update(canonical(body)).digest("hex") };
}

function validateReferences(projection: Omit<TenantAuthorityProjection, "sha256">): void {
  const tenantIds = new Set([
    ...projection.definitions.roles.map((row) => row.tenantId),
    ...projection.definitions.principalGroups.map((row) => row.tenantId),
    ...projection.assignments.scopeTargets.map((row) => row.tenantId),
  ]);
  const roleIds = new Set(projection.definitions.roles.map((row) => row.id));
  const groupIds = new Set(projection.definitions.principalGroups.map((row) => row.id));
  const scopeIds = new Set(projection.assignments.scopeTargets.map((row) => row.id));
  for (const row of projection.definitions.rolePermissions) {
    if (!roleIds.has(row.roleId)) throw new Error(`role_permission ${row.id} has no role definition`);
  }
  for (const row of projection.assignments.planeMemberships) {
    if (!tenantIds.has(row.tenantId)) throw new Error(`plane_membership ${row.id} has no tenant authority definition`);
  }
  for (const row of projection.assignments.groupMembers) {
    if (!groupIds.has(row.groupId)) throw new Error(`group_member ${row.id} has no principal_group definition`);
  }
  for (const row of projection.assignments.groupRoles) {
    if (!groupIds.has(row.groupId) || !roleIds.has(row.roleId) || !scopeIds.has(row.scopeTargetId)) {
      throw new Error(`group_role ${row.id} has an unresolved definition or scope reference`);
    }
  }
}

function uuid(...coordinates: readonly string[]): string {
  const bytes = createHash("sha1").update(`athyper:three-plane:v1:${coordinates.join(":")}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function databaseManagedScopeUuid(tenantId: string, kind: "legal_entity" | "network_account", targetId: string): string {
  const value = `${tenantId}:scope:${kind.replaceAll("_", "-")}:${targetId}`;
  const hex = createHash("md5").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function required<K, V>(values: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = values.get(key);
  if (!value) throw new Error(`missing ${label}: ${String(key)}`);
  return value;
}

function unique<T>(values: readonly T[], key: (value: T) => string, label: string): T[] {
  const result = new Map<string, T>();
  for (const value of values) {
    const coordinate = key(value);
    const previous = result.get(coordinate);
    if (previous && canonical(previous) !== canonical(value)) throw new Error(`conflicting ${label}: ${coordinate}`);
    result.set(coordinate, value);
  }
  return sorted([...result.values()], key);
}

function sorted<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

function humanize(value: string): string {
  return value.split(".").at(-1)!.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
