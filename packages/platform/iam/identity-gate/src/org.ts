import type { OrgMembership } from "./types";

export interface OrgEntry {
  alias: string;
  name: string;
  tenant: string;
  tenantName?: string;
  entity: string;
  entityName: string;
  workbenches: string[];
}

export interface TenantGroup {
  tenant: string;
  orgs: OrgEntry[];
}

export function parseOrgAlias(alias: string): { tenant: string; entity: string } {
  const idx = alias.indexOf("--");
  if (idx < 1) return { tenant: alias, entity: alias };
  return { tenant: alias.slice(0, idx), entity: alias.slice(idx + 2) };
}

export function toOrgEntries(
  organizations: Record<string, OrgMembership>,
  workbenchFilter: string | null,
): OrgEntry[] {
  return Object.entries(organizations)
    .map(([alias, membership]) => {
      const { tenant, entity } = parseOrgAlias(alias);
      const workbenches = workbenchFilter
        ? membership.roles.filter((role) => role === workbenchFilter)
        : membership.roles;
      return {
        alias,
        name: membership.name,
        tenant: membership.tenantCode ?? tenant,
        tenantName: membership.tenantName,
        entity: membership.legalEntityCode ?? membership.organizationCode ?? membership.workspaceCode ?? entity,
        entityName: membership.legalEntityName ?? membership.organizationName ?? membership.name,
        workbenches,
      };
    })
    .filter((entry) => entry.workbenches.length > 0);
}

export function groupByTenant(entries: readonly OrgEntry[]): TenantGroup[] {
  const grouped = new Map<string, OrgEntry[]>();
  for (const entry of entries) {
    const tenantEntries = grouped.get(entry.tenant) ?? [];
    tenantEntries.push(entry);
    grouped.set(entry.tenant, tenantEntries);
  }
  return Array.from(grouped.entries()).map(([tenant, orgs]) => ({
    tenant,
    orgs,
  }));
}

export function initialFromName(name: string): string {
  return (name.trim().charAt(0) || "A").toUpperCase();
}
