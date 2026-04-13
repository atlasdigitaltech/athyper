import type { OrgMembership } from "@/lib/auth/types";

/**
 * Normalize the KC 26.x `organization` JWT claim to an alias-keyed map.
 *
 * KC 26.5.1 (oidc-organization-membership-mapper, multivalued string):
 *   ["athyper--ATHQ", "athyper--AMRE"]   ← array of alias strings
 *
 * KC 26.x rich JSON format (if mapper configured differently):
 *   { "<uuid>": { "id": "<uuid>", "name": "...", "alias": "athyper--ATHQ", "roles": [] } }
 *
 * Both formats are normalised to an alias-keyed OrgMembership map.
 * Roles are filled in by the enrichment step in auth/callback.
 */
export function normalizeOrganizationClaim(
  raw: unknown,
): Record<string, OrgMembership> {
  if (!raw) return {};

  // KC 26.5.1 multivalued string format: array of alias strings
  if (Array.isArray(raw)) {
    const result: Record<string, OrgMembership> = {};
    for (const entry of raw) {
      if (typeof entry === "string" && entry) {
        result[entry] = { id: "", name: entry, alias: entry, roles: [] };
      }
    }
    return result;
  }

  // Rich object format: { uuid: { id, name, alias, roles } }
  if (typeof raw !== "object") return {};
  const result: Record<string, OrgMembership> = {};
  for (const entry of Object.values(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const alias = typeof e.alias === "string" ? e.alias : "";
    if (!alias) continue;
    result[alias] = {
      id: typeof e.id === "string" ? e.id : "",
      name: typeof e.name === "string" ? e.name : alias,
      alias,
      roles: Array.isArray(e.roles)
        ? e.roles.filter((r): r is string => typeof r === "string")
        : [],
    };
  }
  return result;
}
