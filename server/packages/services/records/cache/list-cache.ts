import type { CacheClient } from "@athyper/svc-iam";

export interface EntityListCacheKeyInput {
  tenantId:       string;
  entityCode:     string;
  scopeHash:      string;
  securityHash:   string;
  descriptorHash: string;
  filterHash:     string;
  sortHash:       string;
  searchHash:     string;
  page:           number;
  pageSize:       number;
  version:        string;
}

export function entityListVersionKey(tenantId: string, entityCode: string): string {
  return `listver:${tenantId}:${entityCode}`;
}

export async function resolveEntityListVersion(
  cache:      CacheClient | undefined,
  tenantId:   string,
  entityCode: string,
): Promise<string> {
  if (!cache) return "0";
  const value = await cache.get(entityListVersionKey(tenantId, entityCode)).catch(() => null);
  return value && /^\d+$/.test(value) ? value : "0";
}

export async function invalidateEntityListCache(
  cache:      CacheClient | undefined,
  tenantId:   string,
  entityCode: string,
): Promise<void> {
  if (!cache?.incr) return;
  await cache.incr(entityListVersionKey(tenantId, entityCode)).catch(() => undefined);
}

export function buildEntityListPageCacheKey(input: EntityListCacheKeyInput): string {
  return [
    "listpage:v1",
    input.tenantId,
    input.entityCode,
    `v${input.version}`,
    `scope:${input.scopeHash}`,
    `sec:${input.securityHash}`,
    `desc:${input.descriptorHash}`,
    `filter:${input.filterHash}`,
    `sort:${input.sortHash}`,
    `search:${input.searchHash}`,
    `p:${input.page}`,
    `s:${input.pageSize}`,
  ].join(":");
}

export function buildEntityListCountCacheKey(input: Omit<EntityListCacheKeyInput, "page" | "pageSize">): string {
  return [
    "listcount:v1",
    input.tenantId,
    input.entityCode,
    `v${input.version}`,
    `scope:${input.scopeHash}`,
    `sec:${input.securityHash}`,
    `desc:${input.descriptorHash}`,
    `filter:${input.filterHash}`,
    `sort:${input.sortHash}`,
    `search:${input.searchHash}`,
  ].join(":");
}

export function stableEntityListCacheHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}
