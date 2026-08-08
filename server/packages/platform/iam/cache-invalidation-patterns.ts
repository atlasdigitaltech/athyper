const GLOBAL_SCOPE = "__all__";

export function composeDescInvalidatePattern(
  tenant: string | null,
  entity: string | null,
): string {
  return `desc:v5:*:${tenant ?? "*"}:*:${entity ?? "*"}:*`;
}

export function composeExecutionDescriptorGenerationKey(
  plane: string,
  tenant: string,
  entity: string,
): string {
  return `execdesc:gen:v1:${plane}:${tenant}:${entity}`;
}

export function composeExecutionDescriptorGenerationKeys(
  tenant: string | null,
  entity: string | null,
  plane: string | null,
): readonly string[] {
  const planes = plane ? [plane] : ["neon", "mesh", "admin"];
  const keys: string[] = [];
  for (const planeKey of planes) {
    keys.push(composeExecutionDescriptorGenerationKey(GLOBAL_SCOPE, GLOBAL_SCOPE, GLOBAL_SCOPE));
    keys.push(composeExecutionDescriptorGenerationKey(planeKey, GLOBAL_SCOPE, GLOBAL_SCOPE));
    keys.push(composeExecutionDescriptorGenerationKey(planeKey, GLOBAL_SCOPE, entity ?? GLOBAL_SCOPE));
    keys.push(composeExecutionDescriptorGenerationKey(planeKey, tenant ?? GLOBAL_SCOPE, GLOBAL_SCOPE));
    keys.push(composeExecutionDescriptorGenerationKey(planeKey, tenant ?? GLOBAL_SCOPE, entity ?? GLOBAL_SCOPE));
  }
  const seen = new Set<string>();
  return keys.filter((key) => !seen.has(key) && (seen.add(key), true));
}

export function composeGrantRevokePattern(
  tenant: string | null,
  _fingerprint: string | null,
): string {
  return `desc:v5:mesh:${tenant ?? "*"}:*:*:*`;
}
