import { sql, type Kysely } from "kysely";
import type { RequestHandler, Router } from "express";

import {
  extractOrgHeaders,
  resolvePrincipalIdOrNull,
  resolveTenantId,
  setCachePrivate,
  verifyBearer,
} from "@athyper/svc-shared";
import { createStepUpBinding, requireStepUp } from "../mfa/step-up.service.js";
import { checkPermission, requireAllow } from "../permission/permission.service.js";
import type { CacheClient } from "../session/session.service.js";
import {
  invalidateParameterSnapshot,
  loadParameterRecords,
  resolveParameterSnapshot,
  type ParameterRecord,
} from "../parameters/parameter-resolver.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Record<string, any>;

export interface ParameterRoutesDeps {
  db: Kysely<AnyDb>;
  cache: CacheClient;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

interface ParameterReadAuth {
  claims: Record<string, unknown>;
  sub: string;
  tenantId: string;
  xRealm: string;
}

interface ParameterAuth extends ParameterReadAuth {
  callerPrincipalId: string;
}

interface ExistingValueRow {
  override_enabled: boolean;
  value: unknown;
}

export function createParameterRoutes(router: Router, deps: ParameterRoutesDeps): Router {
  const { db, cache, auth, logger } = deps;

  router.get("/iam/parameters/effective", (async (req, res, next) => {
    try {
      const auth_ = await resolveReadAuth(req, res, db, auth);
      if (!auth_) return;

      const namespace = readString(req.query.namespace);
      const snapshot = await resolveParameterSnapshot(db, cache, auth_.tenantId, namespace);
      setCachePrivate(res, 30);
      res.json(snapshot);
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  router.get("/iam/parameters", (async (req, res, next) => {
    try {
      const auth_ = await resolveReadAuth(req, res, db, auth);
      if (!auth_) return;

      const namespace = readString(req.query.namespace);
      const type = readString(req.query.type);
      const q = readString(req.query.q)?.toLowerCase();
      const configurableOnly = readBooleanFlag(req.query.configurable);
      const overridesOnly = readBooleanFlag(req.query.overrides);

      let parameters = await loadParameterRecords(db, auth_.tenantId);
      if (namespace) {
        parameters = parameters.filter((record) => (
          record.namespace === namespace || record.namespace.startsWith(`${namespace}.`)
        ));
      }
      if (type && type !== "all") {
        parameters = parameters.filter((record) => record.controlLevel === type || record.ownerModel === type);
      }
      if (q) {
        parameters = parameters.filter((record) => {
          const haystack = `${record.code} ${record.displayName} ${record.description ?? ""} ${record.namespace}`.toLowerCase();
          return haystack.includes(q);
        });
      }
      if (configurableOnly) {
        parameters = parameters.filter((record) => record.tenantVisibility === "configurable");
      }
      if (overridesOnly) {
        parameters = parameters.filter((record) => record.overrideEnabled);
      }

      setCachePrivate(res, 30);
      res.json({
        tenantId: auth_.tenantId,
        count: parameters.length,
        parameters,
      });
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  router.patch("/iam/parameters/:code", (async (req, res, next) => {
    try {
      const auth_ = await resolveParameterAuth(req, res, db, auth);
      if (!auth_) return;

      if (!await requireStepUp(cache, createStepUpBinding(auth_.claims, auth_.sub, auth_.tenantId, "iam_admin"), res)) return;
      const decision = await checkPermission(db, auth_.tenantId, auth_.callerPrincipalId, "IAM.PARAMETER.MANAGE");
      if (!requireAllow(decision, res)) return;

      const code = String(req.params.code ?? "").trim();
      const body = isRecord(req.body) ? req.body : {};
      const overrideEnabled = readBodyBoolean(body, "overrideEnabled", "override_enabled");
      if (overrideEnabled === null) {
        res.status(400).json({
          error: "INVALID_BODY",
          message: "overrideEnabled must be true or false.",
        });
        return;
      }

      const currentRecords = await loadParameterRecords(db, auth_.tenantId);
      const parameter = currentRecords.find((record) => record.code === code);
      if (!parameter) {
        res.status(404).json({ error: "PARAMETER_NOT_FOUND", message: `Parameter '${code}' was not found.` });
        return;
      }

      if (overrideEnabled && parameter.tenantVisibility !== "configurable") {
        res.status(403).json({
          error: "READ_ONLY_PARAMETER",
          message: "This parameter is product controlled and cannot be overridden by the tenant.",
        });
        return;
      }

      const value = overrideEnabled
        ? normalizeParameterValue(parameter, body.value)
        : null;
      if (value instanceof ParameterValidationError) {
        res.status(422).json({ error: "INVALID_PARAMETER_VALUE", message: value.message, field: "value" });
        return;
      }

      const reason = readString(body.reason) ?? null;
      const before = await readExistingValue(db, auth_.tenantId, code);
      const operation = classifyOperation(before, overrideEnabled);
      const valueJson = overrideEnabled ? JSON.stringify(value) : null;

      await sql`
        INSERT INTO master.tenant_parameter_value (
          tenant_id,
          parameter_code,
          override_enabled,
          value,
          reason,
          created_by,
          updated_at,
          updated_by
        )
        VALUES (
          ${auth_.tenantId}::uuid,
          ${code},
          ${overrideEnabled},
          ${valueJson}::jsonb,
          ${reason},
          ${auth_.callerPrincipalId}::uuid,
          now(),
          ${auth_.callerPrincipalId}::uuid
        )
        ON CONFLICT (tenant_id, parameter_code) DO UPDATE SET
          override_enabled = EXCLUDED.override_enabled,
          value = EXCLUDED.value,
          reason = EXCLUDED.reason,
          status = 'active',
          updated_at = now(),
          updated_by = EXCLUDED.updated_by
      `.execute(db);

      writeParameterChangeLog(db, {
        tenantId: auth_.tenantId,
        principalId: auth_.callerPrincipalId,
        parameter,
        before,
        overrideEnabled,
        value,
        operation,
        reason,
        requestId: readHeader(req.headers["x-request-id"]),
      }).catch((err) => {
        logger?.warn("parameter_change_log_write_failed", {
          code,
          err: err instanceof Error ? err.message : String(err),
        });
      });

      await invalidateParameterSnapshot(cache, auth_.tenantId, parameter.namespace);

      const refreshed = (await loadParameterRecords(db, auth_.tenantId)).find((record) => record.code === code);
      res.json({ ok: true, parameter: refreshed });
    } catch (err) {
      next(err);
    }
  }) as RequestHandler);

  return router;
}

async function resolveReadAuth(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  db: Kysely<AnyDb>,
  auth: ParameterRoutesDeps["auth"],
): Promise<ParameterReadAuth | null> {
  const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
  if (!claims) return null;

  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!sub) {
    res.status(401).json({ error: "INVALID_TOKEN", message: "JWT missing sub claim" });
    return null;
  }

  const { xOrg, xRealm } = extractOrgHeaders(req);
  const tenantId = await resolveTenantId(db, xOrg, xRealm);
  if (!tenantId) {
    res.status(400).json({ error: "MISSING_HEADER", message: "X-Org header with a valid tenant is required" });
    return null;
  }

  return { claims, sub, tenantId, xRealm };
}

async function resolveParameterAuth(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  db: Kysely<AnyDb>,
  auth: ParameterRoutesDeps["auth"],
): Promise<ParameterAuth | null> {
  const base = await resolveReadAuth(req, res, db, auth);
  if (!base) return null;

  const callerPrincipalId = await resolvePrincipalIdOrNull(db, base.sub, base.tenantId, base.xRealm);
  if (!callerPrincipalId) {
    res.status(403).json({ error: "NO_PRINCIPAL", message: "No principal found for this user in the current tenant" });
    return null;
  }

  return { ...base, callerPrincipalId };
}

async function readExistingValue(
  db: Kysely<AnyDb>,
  tenantId: string,
  code: string,
): Promise<ExistingValueRow | null> {
  const result = await sql<ExistingValueRow>`
    SELECT override_enabled, value
    FROM master.tenant_parameter_value
    WHERE tenant_id = ${tenantId}::uuid
      AND parameter_code = ${code}
      AND status = 'active'
  `.execute(db);
  return result.rows[0] ?? null;
}

async function writeParameterChangeLog(
  db: Kysely<AnyDb>,
  input: {
    tenantId: string;
    principalId: string;
    parameter: ParameterRecord;
    before: ExistingValueRow | null;
    overrideEnabled: boolean;
    value: unknown;
    operation: "create" | "update" | "disable_override" | "enable_override";
    reason: string | null;
    requestId: string | null;
  },
): Promise<void> {
  const oldValueJson = input.before ? JSON.stringify(input.before.value) : null;
  const newValueJson = input.overrideEnabled ? JSON.stringify(input.value) : null;

  await sql`
    INSERT INTO log.parameter_change_log (
      tenant_id,
      parameter_code,
      actor_principal_id,
      operation,
      old_override_enabled,
      new_override_enabled,
      old_value,
      new_value,
      reason,
      request_id,
      created_by
    )
    VALUES (
      ${input.tenantId}::uuid,
      ${input.parameter.code},
      ${input.principalId}::uuid,
      ${input.operation},
      ${input.before?.override_enabled ?? null},
      ${input.overrideEnabled},
      ${oldValueJson}::jsonb,
      ${newValueJson}::jsonb,
      ${input.reason},
      ${input.requestId},
      ${input.principalId}::uuid
    )
  `.execute(db);
}

function classifyOperation(
  before: ExistingValueRow | null,
  overrideEnabled: boolean,
): "create" | "update" | "disable_override" | "enable_override" {
  if (!before) return overrideEnabled ? "enable_override" : "create";
  if (!overrideEnabled) return "disable_override";
  return before.override_enabled ? "update" : "enable_override";
}

class ParameterValidationError extends Error {}

function normalizeParameterValue(parameter: ParameterRecord, raw: unknown): unknown | ParameterValidationError {
  if (raw === undefined || raw === null || raw === "") {
    return new ParameterValidationError("A value is required when the tenant override is enabled.");
  }

  let value: unknown;
  switch (parameter.dataType) {
    case "boolean":
      value = coerceBoolean(raw);
      if (value === null) return new ParameterValidationError("Value must be true or false.");
      break;
    case "integer":
    case "duration":
      value = coerceNumber(raw, true);
      if (value === null) return new ParameterValidationError("Value must be a whole number.");
      break;
    case "number":
      value = coerceNumber(raw, false);
      if (value === null) return new ParameterValidationError("Value must be numeric.");
      break;
    case "enum":
    case "string":
      value = String(raw);
      if (!value) return new ParameterValidationError("Value cannot be empty.");
      break;
    case "json":
      value = typeof raw === "string" ? parseJson(raw) : raw;
      if (value instanceof ParameterValidationError) return value;
      break;
    default:
      return new ParameterValidationError(`Unsupported parameter type '${parameter.dataType}'.`);
  }

  const allowed = parameter.allowedValues;
  if (allowed.length > 0 && !allowed.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) {
    return new ParameterValidationError(`Value must be one of: ${allowed.map(String).join(", ")}.`);
  }

  const numberValue = typeof value === "number" ? value : null;
  if (numberValue !== null) {
    const min = typeof parameter.minValue === "number" ? parameter.minValue : null;
    const max = typeof parameter.maxValue === "number" ? parameter.maxValue : null;
    if (min !== null && numberValue < min) {
      return new ParameterValidationError(`Value must be greater than or equal to ${min}.`);
    }
    if (max !== null && numberValue > max) {
      return new ParameterValidationError(`Value must be less than or equal to ${max}.`);
    }
  }

  return value;
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(lower)) return true;
    if (["false", "0", "no", "off"].includes(lower)) return false;
  }
  return null;
}

function coerceNumber(value: unknown, integer: boolean): number | null {
  const number = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(number)) return null;
  if (integer && !Number.isInteger(number)) return null;
  return number;
}

function parseJson(value: string): unknown | ParameterValidationError {
  try {
    return JSON.parse(value);
  } catch {
    return new ParameterValidationError("Value must be valid JSON.");
  }
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readHeader(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBooleanFlag(value: unknown): boolean {
  if (Array.isArray(value)) return readBooleanFlag(value[0]);
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readBodyBoolean(body: Record<string, unknown>, ...keys: string[]): boolean | null {
  for (const key of keys) {
    if (!(key in body)) continue;
    return coerceBoolean(body[key]);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
