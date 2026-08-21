import { createHash } from "node:crypto";

export type CatalogPlane = "studio" | "neon" | "mesh";

export interface CatalogPermissionInput {
  canonicalCode: string;
  permissionKind: string;
  riskTier: string;
  requiresMfa: boolean;
  requiresSod?: boolean;
}

export interface CanonicalPermissionV2 {
  permissionId: string;
  canonicalCode: string;
  product: CatalogPlane;
  domain: string;
  entity: string;
  operation: string;
  permissionKind: string;
  riskTier: string;
  requiresMfa: boolean;
  requiresSod?: boolean;
  lifecycle: "proposed";
  definitionSha256: string;
}

export interface CanonicalCatalogV2 {
  contractVersion: "athyper.authorization.catalog.v2";
  catalogVersion: "2.0.0";
  plane: CatalogPlane;
  canonicalCodePattern: "{product}.{domain}.{entity}.{operation}";
  idStrategy: "uuidv5:namespace=uuidv5(dns,athyper.authorization.catalog.v2);name={canonicalCode}";
  permissions: readonly CanonicalPermissionV2[];
  sha256: string;
}

export function buildCanonicalCatalogV2(input: {
  plane: CatalogPlane;
  permissions: readonly CatalogPermissionInput[];
}): { catalog: CanonicalCatalogV2 } {
  const permissions = input.permissions
    .map((permission) => {
      const coordinate = canonicalCoordinate(input.plane, permission.canonicalCode);
      const canonicalCode = `${coordinate.product}.${coordinate.domain}.${coordinate.entity}.${coordinate.operation}`;
      const definition = {
        canonicalCode, ...coordinate, permissionKind: permission.permissionKind,
        riskTier: permission.riskTier, requiresMfa: permission.requiresMfa,
        ...(permission.requiresSod === undefined ? {} : { requiresSod: permission.requiresSod }),
        lifecycle: "proposed" as const,
      };
      return { permissionId: deterministicPermissionId(canonicalCode), ...definition,
        definitionSha256: sha256(canonical(definition)) };
    }).sort((left, right) => left.canonicalCode.localeCompare(right.canonicalCode));
  assertUnique(permissions.map((permission) => permission.canonicalCode), `${input.plane} canonical permission`);
  assertUnique(permissions.map((permission) => permission.permissionId), `${input.plane} permission ID`);
  const body = {
    contractVersion: "athyper.authorization.catalog.v2" as const,
    catalogVersion: "2.0.0" as const,
    plane: input.plane,
    canonicalCodePattern: "{product}.{domain}.{entity}.{operation}" as const,
    idStrategy: "uuidv5:namespace=uuidv5(dns,athyper.authorization.catalog.v2);name={canonicalCode}" as const,
    permissions,
  };
  return { catalog: { ...body, sha256: sha256(canonical(body)) } };
}

export function deterministicPermissionId(canonicalCode: string): string {
  return uuidV5(canonicalCode, catalogV2Namespace());
}

function catalogV2Namespace(): string {
  return uuidV5("athyper.authorization.catalog.v2", "6ba7b810-9dad-11d1-80b4-00c04fd430c8");
}

function uuidV5(name: string, namespace: string): string {
  const namespaceBytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  if (namespaceBytes.length !== 16) throw new Error(`invalid UUID namespace: ${namespace}`);
  const bytes = createHash("sha1").update(namespaceBytes).update(name, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function canonicalCoordinate(plane: CatalogPlane, sourceCode: string): { product: CatalogPlane; domain: string; entity: string; operation: string } {
  const raw = sourceCode.toLowerCase().split(".").filter(Boolean);
  if (raw.length !== 4 || raw[0] !== plane) throw new Error(`permission must be exact plane.domain.entity.operation: ${sourceCode}`);
  const domain = token(raw[1]!);
  const entity = token(raw[2]!);
  const operation = operationToken(raw[3]!);
  return { product: plane, domain, entity, operation };
}

function token(value: string): string { const normalized = value.replaceAll("-", "_"); if (!/^[a-z][a-z0-9_]*$/.test(normalized)) throw new Error(`invalid catalog token: ${value}`); return normalized; }
function operationToken(value: string): string { return token(value.toLowerCase()); }
function assertUnique(values: readonly string[], label: string): void { const seen=new Set<string>(); for(const value of values){if(seen.has(value))throw new Error(`duplicate ${label}: ${value}`);seen.add(value);} }
function canonical(value: unknown): string { if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;return JSON.stringify(value); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
