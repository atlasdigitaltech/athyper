import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { createHash } from "node:crypto";

import { MetaEntityContractV21Schema, type MetaEntityContractV21 } from "@athyper/api-contracts/meta-entity-contract-v21";
import { verifyBearer } from "@athyper/svc-shared";

import {
  loadPublishedRuntimeDescriptor,
  RuntimeDescriptorAdmissionError,
  type PublishedRuntimeDescriptor,
} from "../src/published-runtime-descriptor.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

interface MeshPermissionContext {
  planeKey: "mesh";
  tenantId: string;
  principalId: string;
  accountGrantId: string;
  networkAccountId: string;
  allowed: ReadonlySet<string>;
  denied: ReadonlySet<string>;
  profileHash: string;
}

export interface MeshRuntimeRoutesDeps {
  db: AnyDb;
  meshDb?: AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
}

/**
 * Mesh runtime is descriptor-driven and read-only. These routes deliberately
 * sit in front of the generic Records API so every request revalidates the
 * account binding and record grant before touching tenant business data.
 */
export function createMeshRuntimeRoutes(router: Router, deps: MeshRuntimeRoutesDeps): Router {
  if (!deps.meshDb) throw new Error("MESH_DATABASE_CONFIGURATION_REQUIRED");
  const meshDb = deps.meshDb;

  const catalogHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await authenticate(req.headers.authorization, deps.auth, res)) return;
      const context = await requireMeshContext(res, meshDb);
      if (!context) return;

      const candidates = await loadPublishedEntityCodes(deps.db, context.tenantId);
      const admitted = await Promise.all(candidates.map(async (entityCode) => {
        try {
          const descriptor = await loadPublishedRuntimeDescriptor(deps.db, {
            entityCode,
            tenantId: context.tenantId,
            plane: "mesh",
          });
          return projectCatalogItem(descriptor, context);
        } catch (error) {
          if (error instanceof RuntimeDescriptorAdmissionError) return null;
          throw error;
        }
      }));
      const items = admitted.filter((item): item is NonNullable<typeof item> => item !== null);

      res.setHeader("Cache-Control", "private, no-cache");
      res.setHeader("Vary", "Authorization, X-Org, X-Account-Grant");
      res.json({
        schemaVersion: 1,
        accountGrantId: context.accountGrantId,
        profileHash: context.profileHash,
        items,
      });
    } catch (error) {
      deps.logger?.error("mesh_runtime_catalog_error", { err: String(error) });
      next(error);
    }
  };

  const listHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await authenticate(req.headers.authorization, deps.auth, res)) return;
      const context = await requireMeshContext(res, meshDb);
      if (!context) return;
      const admitted = await admitEntity(deps.db, req.params["entity"], context, "list", res);
      if (!admitted) return;

      const pageSize = boundedInteger(req.query["page_size"] ?? req.query["size"], 20, 1, 200);
      const page = boundedInteger(req.query["page"], 1, 1, 100_000);
      const offset = (page - 1) * pageSize;
      const fields = visibleSurfaceFields(admitted.contract, context, "list");
      const storage = admitted.contract.runtime.storage;
      const primaryKey = storage.primary_key;
      if (!primaryKey) return safeNotFound(res);

      const selected = unique([primaryKey, ...fields.map((field) => field.column_name)]);
      const table = qualifiedIdentifier(storage.table_schema, storage.table_name);
      const columns = selected.map(quoteIdentifier).join(", ");
      const predicates = [
        recordGrantPredicate(context, admitted.contract.catalog.entity_code, primaryKey),
        ...(storage.tenant_column
          ? [sql`${sql.ref(`t.${storage.tenant_column}`)} = ${context.tenantId}::uuid`]
          : []),
        ...listQueryPredicates(admitted.contract, fields, req.query),
      ];
      const where = sql.join(predicates, sql` AND `);
      const order = listOrder(fields, req.query["sort"], primaryKey);

      const [rows, count] = await Promise.all([
        sql<Record<string, unknown>>`
          SELECT ${sql.raw(columns)}
            FROM ${sql.raw(table)} t
           WHERE ${where}
           ORDER BY ${sql.ref(`t.${order.column}`)} ${sql.raw(order.direction)}
           LIMIT ${pageSize}
          OFFSET ${offset}
        `.execute(deps.db),
        sql<{ total: string }>`
          SELECT count(*)::text AS total
            FROM ${sql.raw(table)} t
           WHERE ${where}
        `.execute(deps.db),
      ]);
      const total = Number(count.rows[0]?.total ?? 0);

      res.setHeader("Cache-Control", "private, no-cache");
      res.json({
        data: rows.rows.map((row) => projectMeshRuntimeRow(
          row,
          fields,
          admitted.contract,
          primaryKey,
        )),
        pagination: {
          page,
          page_size: pageSize,
          total,
          total_pages: Math.ceil(total / pageSize),
          has_more: offset + rows.rows.length < total,
        },
        descriptor_hash: admitted.compiledHash,
        published_version_id: admitted.publishedVersionId,
      });
    } catch (error) {
      deps.logger?.error("mesh_runtime_list_error", { err: String(error) });
      next(error);
    }
  };

  const detailHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!await authenticate(req.headers.authorization, deps.auth, res)) return;
      const context = await requireMeshContext(res, meshDb);
      if (!context) return;
      const admitted = await admitEntity(deps.db, req.params["entity"], context, "detail", res);
      if (!admitted) return;

      const storage = admitted.contract.runtime.storage;
      const primaryKey = storage.primary_key;
      const recordId = String(req.params["id"] ?? "");
      if (!primaryKey || !recordId) return safeNotFound(res);
      const fields = visibleSurfaceFields(admitted.contract, context, "detail");
      const selected = unique([primaryKey, ...fields.map((field) => field.column_name)]);
      const table = qualifiedIdentifier(storage.table_schema, storage.table_name);
      const columns = selected.map(quoteIdentifier).join(", ");
      const tenantPredicate = storage.tenant_column
        ? sql`AND ${sql.ref(`t.${storage.tenant_column}`)} = ${context.tenantId}::uuid`
        : sql.raw("");

      const rows = await sql<Record<string, unknown>>`
        SELECT ${sql.raw(columns)}
          FROM ${sql.raw(table)} t
         WHERE t.${sql.raw(quoteIdentifier(primaryKey))}::text = ${recordId}
           AND ${recordGrantPredicate(context, admitted.contract.catalog.entity_code, primaryKey)}
               ${tenantPredicate}
         LIMIT 1
      `.execute(deps.db);
      const row = rows.rows[0];
      if (!row) return safeNotFound(res);

      res.setHeader("Cache-Control", "private, no-cache");
      res.json({
        data: projectMeshRuntimeRow(row, fields, admitted.contract, primaryKey),
        descriptor_hash: admitted.compiledHash,
        published_version_id: admitted.publishedVersionId,
      });
    } catch (error) {
      deps.logger?.error("mesh_runtime_detail_error", { err: String(error) });
      next(error);
    }
  };

  router.get("/metadata/mesh/runtime-catalog", catalogHandler);
  router.get("/mesh/runtime/entities/:entity", listHandler);
  router.get("/mesh/runtime/entities/:entity/:id", detailHandler);
  return router;
}

async function authenticate(
  authorization: string | undefined,
  auth: MeshRuntimeRoutesDeps["auth"],
  res: Parameters<RequestHandler>[1],
): Promise<boolean> {
  return Boolean(await verifyBearer(authorization ?? "", auth, res));
}

async function requireMeshContext(
  res: Parameters<RequestHandler>[1],
  meshDb: AnyDb,
): Promise<MeshPermissionContext | null> {
  const raw = (res.locals as Record<string, unknown>)["effectivePermissionContext"] as
    | Partial<MeshPermissionContext>
    | undefined;
  if (raw?.planeKey !== "mesh"
      || !raw.tenantId
      || !raw.principalId
      || !raw.accountGrantId
      || !raw.networkAccountId
      || !(raw.allowed instanceof Set)
      || !(raw.denied instanceof Set)
      || !raw.profileHash) {
    safeNotFound(res);
    return null;
  }

  // Do not trust a request-lifetime cache for partner revocation. The active
  // grant is re-read for catalog, list, detail and operation bootstrap calls.
  const binding = await sql<{ present: boolean }>`
    SELECT true AS present
      FROM mesh.auth_current_plane_membership_v
     WHERE id=${raw.accountGrantId}::uuid
       AND principal_id=${raw.principalId}::uuid
       AND account_id=${raw.networkAccountId}::uuid
       AND plane_code='mesh'
     LIMIT 1
  `.execute(meshDb);
  if (!binding.rows[0]?.present) {
    safeNotFound(res);
    return null;
  }
  return raw as MeshPermissionContext;
}

async function loadPublishedEntityCodes(db: AnyDb, tenantId: string): Promise<string[]> {
  const result = await sql<{ entity_code: string }>`
    SELECT e.entity_code
      FROM control.entity e
      JOIN control.entity_publish_state ps
        ON ps.entity_id=e.id
       AND ps.tenant_id IS NOT DISTINCT FROM e.tenant_id
      JOIN control.entity_version ev
        ON ev.id=ps.published_version_id
       AND ev.status='EFFECTIVE'
     WHERE (e.tenant_id=${tenantId}::uuid OR e.tenant_id IS NULL)
       AND ps.readiness_status='READY'
     ORDER BY e.tenant_id IS NULL, e.entity_code
  `.execute(db);
  return unique(result.rows.map((row) => row.entity_code));
}

function projectCatalogItem(descriptor: PublishedRuntimeDescriptor, context: MeshPermissionContext) {
  const contract = descriptor.contract;
  const list = hasAuthorizedSurface(contract, context, "list");
  const detail = hasAuthorizedSurface(contract, context, "detail");
  if (!list && !detail) return null;
  return {
    entityCode: contract.catalog.entity_code,
    label: contract.catalog.labels.singular,
    labelPlural: contract.catalog.labels.plural,
    description: contract.catalog.labels.description,
    iconKey: contract.catalog.presentation.icon_key,
    list,
    detail,
    create: false,
    mutationMode: "delegated-submit",
    publishedVersionId: descriptor.publishedVersionId,
    compiledHash: descriptor.compiledHash,
  };
}

async function admitEntity(
  db: AnyDb,
  rawEntity: unknown,
  context: MeshPermissionContext,
  mode: "list" | "detail",
  res: Parameters<RequestHandler>[1],
): Promise<PublishedRuntimeDescriptor | null> {
  const entityCode = String(rawEntity ?? "").replace(/-/g, "_");
  if (!/^[a-z][a-z0-9_]*$/.test(entityCode)) {
    safeNotFound(res);
    return null;
  }
  try {
    const descriptor = await loadPublishedRuntimeDescriptor(db, {
      entityCode,
      tenantId: context.tenantId,
      plane: "mesh",
    });
    if (!hasAuthorizedSurface(descriptor.contract, context, mode)) {
      safeNotFound(res);
      return null;
    }
    return descriptor;
  } catch (error) {
    if (error instanceof RuntimeDescriptorAdmissionError) {
      safeNotFound(res);
      return null;
    }
    throw error;
  }
}

function hasAuthorizedSurface(
  contract: MetaEntityContractV21,
  context: MeshPermissionContext,
  mode: "list" | "detail",
): boolean {
  if (contract.runtime.capabilities.read === "none") return false;
  return contract.surfaces.some((surface) => {
    if (!surface.enabled) return false;
    if (surface.kind === "CUSTOM") return false;
    const compatible = mode === "list"
      ? ["list", "compact_card", "spreadsheet"].includes(surface.mode)
      : surface.mode === "detail";
    return compatible && surface.security.required_permissions.every((permission) =>
      context.allowed.has(permission) && !context.denied.has(permission));
  });
}

function visibleSurfaceFields(
  contract: MetaEntityContractV21,
  context: MeshPermissionContext,
  mode: "list" | "detail",
) {
  const fieldById = new Map(contract.fields.map((field) => [field.id, field]));
  const ids = new Set(contract.surfaces
    .filter((surface) => surface.enabled
      && surface.kind !== "CUSTOM"
      && surface.security.required_permissions.every((permission) =>
        context.allowed.has(permission) && !context.denied.has(permission))
      && (mode === "detail"
        ? surface.mode === "detail"
        : ["list", "compact_card", "spreadsheet"].includes(surface.mode)))
    .flatMap((surface) => surface.bindings.filter((binding) => binding.visible).map((binding) => binding.field_id)));
  return [...ids]
    .map((id) => fieldById.get(id))
    .filter((field): field is MetaEntityContractV21["fields"][number] =>
      Boolean(field?.runtime_enabled
        && !field.deprecated
        && isMeshFieldReadable(contract, field.name, context)));
}

function isMeshFieldReadable(
  contract: MetaEntityContractV21,
  fieldName: string,
  context: MeshPermissionContext,
): boolean {
  const security = contract.policy.field_security.find((entry) => entry.field_name === fieldName);
  if (!security) return true;
  if (security.read_permissions.some((permission) => context.denied.has(permission))) return false;
  if (!security.read_permissions.every((permission) => context.allowed.has(permission))) return false;
  return security.read_permissions.length > 0
    || security.classification === "public"
    || security.classification === "internal";
}

function projectMeshRuntimeRow(
  row: Record<string, unknown>,
  fields: MetaEntityContractV21["fields"],
  contract: MetaEntityContractV21,
  primaryKey: string,
) {
  const projected: Record<string, unknown> = { [primaryKey]: row[primaryKey] };
  for (const field of fields) {
    const security = contract.policy.field_security.find((entry) => entry.field_name === field.name);
    projected[field.column_name] = applyMeshFieldMask(row[field.column_name], security?.mask ?? "none");
  }
  return {
    ...projected,
    id: stringifyId(row[primaryKey]),
    data: projected,
  };
}

function applyMeshFieldMask(
  value: unknown,
  mask: "none" | "partial" | "full" | "hash",
): unknown {
  if (value == null || mask === "none") return value;
  const text = String(value);
  if (mask === "full") return "••••";
  if (mask === "hash") return createHash("sha256").update(text).digest("hex");
  if (text.length <= 4) return "••••";
  return `${text.slice(0, 2)}${"•".repeat(Math.min(8, text.length - 4))}${text.slice(-2)}`;
}

function recordGrantPredicate(
  context: MeshPermissionContext,
  entityCode: string,
  primaryKey: string,
) {
  const key = sql.ref(`t.${primaryKey}`);
  return sql`EXISTS (
    SELECT 1
      FROM master.auth_record_acl acl
      JOIN control.entity entity_row ON entity_row.id = acl.entity_id
     WHERE acl.tenant_id=${context.tenantId}::uuid
       AND acl.principal_id=${context.principalId}::uuid
       AND acl.subject_kind='principal'
       AND acl.status='active'
       AND (acl.effective_until IS NULL OR acl.effective_until > now())
       AND entity_row.code=${entityCode}
       AND acl.record_id::text=${key}::text
  )`;
}

function listQueryPredicates(
  contract: MetaEntityContractV21,
  visibleFields: MetaEntityContractV21["fields"],
  query: Record<string, unknown>,
) {
  const visibleByName = new Map(visibleFields.map((field) => [field.name, field]));
  const predicates = [];
  const rawSearch = firstQueryValue(query["q"])?.trim();
  if (rawSearch
      && contract.runtime.search.enabled
      && rawSearch.length >= contract.runtime.search.minimum_query_length) {
    const searchable = contract.runtime.search.fields
      .map((entry) => visibleByName.get(entry.field))
      .filter((field): field is MetaEntityContractV21["fields"][number] => Boolean(field));
    if (searchable.length > 0) {
      const pattern = contract.runtime.search.operator === "prefix"
        ? `${rawSearch}%`
        : contract.runtime.search.operator === "exact"
          ? rawSearch
          : `%${rawSearch}%`;
      predicates.push(sql`(${sql.join(searchable.map((field) =>
        sql`${sql.ref(`t.${field.column_name}`)}::text ILIKE ${pattern}`), sql` OR `)})`);
    }
  }
  for (const [key, raw] of Object.entries(query)) {
    if (!key.startsWith("filter.")) continue;
    const field = visibleByName.get(key.slice("filter.".length));
    const value = firstQueryValue(raw)?.trim();
    if (!field || !field.capabilities.filterable || !value) continue;
    const values = value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 100);
    if (values.length === 1) predicates.push(sql`${sql.ref(`t.${field.column_name}`)}::text = ${values[0]}`);
    else if (values.length > 1) predicates.push(sql`${sql.ref(`t.${field.column_name}`)}::text IN (${sql.join(values)})`);
  }
  return predicates;
}

function listOrder(
  visibleFields: MetaEntityContractV21["fields"],
  rawSort: unknown,
  primaryKey: string,
): { column: string; direction: "ASC" | "DESC" } {
  const value = firstQueryValue(rawSort)?.trim();
  if (!value) return { column: primaryKey, direction: "ASC" };
  const descending = value.startsWith("-") || value.endsWith(":desc");
  const fieldName = value.replace(/^-/, "").replace(/:(?:asc|desc)$/i, "");
  const field = visibleFields.find((candidate) =>
    candidate.name === fieldName && candidate.capabilities.sortable);
  return field
    ? { column: field.column_name, direction: descending ? "DESC" : "ASC" }
    : { column: primaryKey, direction: "ASC" };
}

function firstQueryValue(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : undefined;
}

function safeNotFound(res: Parameters<RequestHandler>[1]) {
  return res.status(404).json({ error: "NOT_FOUND", message: "The requested resource was not found." });
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function qualifiedIdentifier(schema: string, table: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Invalid published SQL identifier.");
  return `"${value}"`;
}

function stringifyId(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" || typeof value === "bigint"
    ? String(value)
    : undefined;
}

/** Used by contract tests to assert the deny-by-default authority boundary. */
export function isMeshOperationHandlerAllowed(operation: MetaEntityContractV21["operations"][number]): boolean {
  if (!operation.enabled || operation.plane_filter?.includes("mesh") === false) return false;
  if (operation.handler.kind === "navigate") return operation.handler.target.startsWith("/app/");
  if (operation.handler.kind === "api") {
    return operation.handler.target.startsWith("/api/mesh/")
      || operation.handler.target.startsWith("mesh:");
  }
  return operation.handler.kind === "modal" || operation.handler.kind === "inline";
}
