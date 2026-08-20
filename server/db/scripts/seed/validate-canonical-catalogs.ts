#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { deterministicPermissionId, type CatalogPlane } from "./canonical-catalog-v2-model.js";

type Permission = {
  permissionId: string;
  canonicalCode: string;
  product: CatalogPlane;
  domain: string;
  entity: string;
  operation: string;
  permissionKind: string;
  riskTier: "low" | "medium" | "high" | "critical";
  requiresMfa: boolean;
  lifecycle: "proposed";
  definitionSha256: string;
};
type Catalog = {
  contractVersion: string;
  catalogVersion: string;
  plane: CatalogPlane;
  canonicalCodePattern: string;
  idStrategy: string;
  permissions: Permission[];
  sha256: string;
};

const databaseRoot = resolve(import.meta.dirname, "../..");
const write = process.argv.includes("--write");
const planes: readonly CatalogPlane[] = ["studio", "neon", "mesh"];

for (const plane of planes) {
  const path = resolve(databaseRoot, `seed/contracts/authorization/catalog/${plane}/catalog.v2.json`);
  const source = JSON.parse(await readFile(path, "utf8")) as Catalog & Record<string, unknown>;
  if (source.contractVersion !== "athyper.authorization.catalog.v2" || source.catalogVersion !== "2.0.0" || source.plane !== plane) {
    throw new Error(`${plane} catalog header is invalid`);
  }
  if (source.canonicalCodePattern !== "{product}.{domain}.{entity}.{operation}") {
    throw new Error(`${plane} catalog permission identity pattern is invalid`);
  }
  const codes = new Set<string>();
  const ids = new Set<string>();
  for (const permission of source.permissions) {
    const expectedCode = `${plane}.${permission.domain}.${permission.entity}.${permission.operation}`;
    if (permission.canonicalCode !== expectedCode || permission.product !== plane || permission.canonicalCode.split(".").length !== 4) {
      throw new Error(`${plane} permission is not an exact four-coordinate identity: ${permission.canonicalCode}`);
    }
    if (permission.canonicalCode.startsWith("legacy.") || permission.domain === "action" || permission.entity === "action") {
      throw new Error(`${plane} catalog contains prohibited legacy or generic action authority: ${permission.canonicalCode}`);
    }
    if (permission.permissionId !== deterministicPermissionId(permission.canonicalCode)) {
      throw new Error(`${plane} permission ID is not deterministic: ${permission.canonicalCode}`);
    }
    const { permissionId: _permissionId, definitionSha256, ...definition } = permission;
    if (definitionSha256 !== sha256(canonical(definition))) {
      throw new Error(`${plane} permission definition hash mismatch: ${permission.canonicalCode}`);
    }
    if (codes.has(permission.canonicalCode) || ids.has(permission.permissionId)) {
      throw new Error(`${plane} catalog contains a duplicate permission identity: ${permission.canonicalCode}`);
    }
    codes.add(permission.canonicalCode);
    ids.add(permission.permissionId);
  }
  const body = {
    contractVersion: source.contractVersion,
    catalogVersion: source.catalogVersion,
    plane: source.plane,
    canonicalCodePattern: source.canonicalCodePattern,
    idStrategy: source.idStrategy,
    permissions: [...source.permissions].sort((left, right) => left.canonicalCode.localeCompare(right.canonicalCode)),
  };
  const normalized = { ...body, sha256: sha256(canonical(body)) };
  if (write) await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  else if (canonical(source) !== canonical(normalized)) throw new Error(`${plane} canonical catalog drift; run catalog-v2:build`);
  process.stdout.write(`${plane}:${normalized.sha256}:${normalized.permissions.length}\n`);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
