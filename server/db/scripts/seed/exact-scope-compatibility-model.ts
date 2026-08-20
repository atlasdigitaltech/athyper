import { createHash } from "node:crypto";
import type { CatalogPlane } from "./canonical-catalog-v2-model.js";

export type ScopeKind = "tenant" | "workspace" | "module" | "company_code" | "legal_entity" | "operating_organization" | "network_account" | "network_relationship" | "resource";
export type ScopePropagation = "exact" | "subtree" | "member_companies" | "relationship_participants";
export interface PermissionScopeDeclaration { permissionCode: string; scopes: readonly { kind: ScopeKind; propagation: ScopePropagation }[]; }
export interface ExactScopeCompatibilityContract {
  contractVersion: "athyper.authorization.scope-compatibility.v1";
  scopeVersion: "1.0.0";
  plane: CatalogPlane;
  defaultScopeBehavior: "deny_undeclared";
  permissions: readonly PermissionScopeDeclaration[];
  sha256: string;
}

const allowedKinds: Readonly<Record<CatalogPlane, ReadonlySet<ScopeKind>>> = {
  studio: new Set(["tenant", "workspace", "module", "resource"]),
  neon: new Set(["tenant", "company_code", "legal_entity", "operating_organization", "resource"]),
  mesh: new Set(["tenant", "network_account", "network_relationship", "resource"]),
};

export function buildExactScopeCompatibility(input: {
  plane: CatalogPlane;
  permissionCodes: readonly string[];
  semanticCodes?: Readonly<Record<string, string>>;
  requiredScopesByPermission?: Readonly<Record<string, readonly { kind: ScopeKind; propagation: ScopePropagation }[]>>;
}): ExactScopeCompatibilityContract {
  const codes = [...new Set(input.permissionCodes)].sort();
  if (codes.length !== input.permissionCodes.length) throw new Error(`duplicate ${input.plane} permission in scope input`);
  const permissions = codes.map((permissionCode) => ({
    permissionCode,
    scopes: mergeScopes(
      scopesFor(input.plane, input.semanticCodes?.[permissionCode] ?? permissionCode),
      input.requiredScopesByPermission?.[permissionCode] ?? [],
    ),
  }));
  const body = {
    contractVersion: "athyper.authorization.scope-compatibility.v1" as const,
    scopeVersion: "1.0.0" as const, plane: input.plane, defaultScopeBehavior: "deny_undeclared" as const, permissions,
  };
  const contract = { ...body, sha256: sha256(canonical(body)) };
  validateExactScopeCompatibility(contract, codes);
  return contract;
}

function mergeScopes(
  inferred: PermissionScopeDeclaration["scopes"],
  required: readonly { kind: ScopeKind; propagation: ScopePropagation }[],
): PermissionScopeDeclaration["scopes"] {
  const byCoordinate = new Map(inferred.map((scope) => [`${scope.kind}/${scope.propagation}`, scope]));
  for (const scope of [...required].sort((left, right) =>
    `${left.kind}/${left.propagation}`.localeCompare(`${right.kind}/${right.propagation}`))) {
    byCoordinate.set(`${scope.kind}/${scope.propagation}`, scope);
  }
  return [...byCoordinate.values()];
}

export function validateExactScopeCompatibility(contract: ExactScopeCompatibilityContract, expectedPermissionCodes: readonly string[]): void {
  if (contract.contractVersion !== "athyper.authorization.scope-compatibility.v1" || contract.defaultScopeBehavior !== "deny_undeclared") throw new Error("scope compatibility header is invalid");
  const actual = contract.permissions.map((item) => item.permissionCode);
  unique(actual, "permission scope declaration");
  const missing = expectedPermissionCodes.filter((code) => !actual.includes(code));
  const extra = actual.filter((code) => !expectedPermissionCodes.includes(code));
  if (missing.length || extra.length) throw new Error(`scope compatibility coverage mismatch: missing=${missing.join(",")} extra=${extra.join(",")}`);
  for (const item of contract.permissions) {
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(item.permissionCode)) throw new Error(`invalid permission code: ${item.permissionCode}`);
    if (item.scopes.length === 0) throw new Error(`permission has no declared scopes: ${item.permissionCode}`);
    unique(item.scopes.map((scope) => `${scope.kind}/${scope.propagation}`), `scope coordinate for ${item.permissionCode}`);
    for (const scope of item.scopes) {
      if (!allowedKinds[contract.plane].has(scope.kind)) throw new Error(`scope ${scope.kind} is not supported by ${contract.plane}`);
      if (["tenant", "resource", "network_relationship"].includes(scope.kind) && scope.propagation !== "exact") throw new Error(`${scope.kind} requires exact propagation`);
      if (scope.kind === "operating_organization" && scope.propagation !== "subtree") throw new Error("operating_organization requires explicit subtree propagation");
    }
  }
}

export function scopesFor(plane: CatalogPlane, permissionCode: string): PermissionScopeDeclaration["scopes"] {
  const scopes: Array<{ kind: ScopeKind; propagation: ScopePropagation }> = [{ kind: "tenant", propagation: "exact" }];
  const segments = permissionCode.split(".");
  if (segments.length !== 4 || segments[0] !== plane) throw new Error(`scope permission must be exact ${plane}.domain.entity.operation: ${permissionCode}`);
  const domain = segments[1] ?? "";
  const entity = segments.at(-2) ?? "";
  if (plane === "studio") {
    if (domain === "metadata" || domain === "publication") scopes.push({ kind: "workspace", propagation: "exact" });
    if (domain === "platform" && ["catalog", "reference", "taxonomy"].includes(entity)) scopes.push({ kind: "module", propagation: "exact" });
    if (domain === "documents" || domain === "workflow") scopes.push({ kind: "resource", propagation: "exact" });
  } else if (plane === "neon") {
    if (entity === "company_code") scopes.push({ kind: "company_code", propagation: "exact" });
    else if (entity === "legal_entity") scopes.push({ kind: "legal_entity", propagation: "exact" });
    if (domain === "context" && entity === "catalog") {
      scopes.push(
        { kind: "legal_entity", propagation: "exact" },
        { kind: "company_code", propagation: "exact" },
        { kind: "operating_organization", propagation: "subtree" },
      );
    }
    if (domain === "relationship" || domain === "supplier" || domain === "procurement") {
      scopes.push({ kind: "legal_entity", propagation: "exact" }, { kind: "operating_organization", propagation: "subtree" });
    }
    if (domain === "records" || entity === "agent_history") scopes.push({ kind: "resource", propagation: "exact" });
  } else {
    scopes.push({ kind: "network_account", propagation: "exact" });
    if (entity === "network_relationship" || entity === "document_envelope") scopes.push({ kind: "network_relationship", propagation: "exact" });
    if (["attachment", "bank_account", "content_item", "conversation", "document_envelope", "supplier_profile_verification"].includes(entity)) scopes.push({ kind: "resource", propagation: "exact" });
  }
  return scopes;
}

function unique(values: readonly string[], label: string): void { const seen=new Set<string>();for(const value of values){if(seen.has(value))throw new Error(`duplicate ${label}: ${value}`);seen.add(value);} }
function canonical(value: unknown): string { if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([name,item])=>`${JSON.stringify(name)}:${canonical(item)}`).join(",")}}`;return JSON.stringify(value); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
