import type { Request, RequestHandler, Response, Router } from "express";

import { requireVerifiedContext } from "@athyper/svc-iam";
import type { VerifiedRequestContext } from "@athyper/svc-iam";
import type { EntityDescriptorRepository } from "../repositories/entity-descriptor.repository.js";
import type { EntityMutationService, MutationResult } from "../mutation/entity-mutation.types.js";
import { mapMutationResultToHttp } from "../mutation/entity-mutation-http.js";
import type { MutationKernelRolloutDecision, MutationKernelOperation } from "../mutation/mutation-kernel-rollout.js";

export interface EntityMutationRouteDeps {
  service: EntityMutationService;
  descriptors: EntityDescriptorRepository;
  isCanonicalEntity(entityCode: string): boolean;
  resolveRollout?(context: VerifiedRequestContext, entityCode: string, operation: MutationKernelOperation): MutationKernelRolloutDecision;
  legacy: { create: RequestHandler; put: RequestHandler; patch: RequestHandler; delete: RequestHandler };
  afterCommit?(
    result: Extract<MutationResult, { kind: "Committed" }>,
    context: VerifiedRequestContext,
  ): Promise<void>;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
}

export function registerEntityMutationRoutes(router: Router, deps: EntityMutationRouteDeps): void {
  const handlers = createEntityMutationHandlers(deps);
  for (const root of ["/runtime/v1/entities", "/records"]) {
    router.post(`${root}/:entity`, handlers.create);
    router.put(`${root}/:entity/:id`, handlers.update);
    router.patch(`${root}/:entity/:id`, handlers.patch);
    router.delete(`${root}/:entity/:id`, handlers.remove);
  }
}

export function createEntityMutationHandlers(deps: EntityMutationRouteDeps): {
  create: RequestHandler; update: RequestHandler; patch: RequestHandler; remove: RequestHandler;
} {
  const create: RequestHandler = async (req, res, next) => {
    const entityCode = String(req.params["entity"] ?? "");
    try {
      const context = requireVerifiedContext(req, res);
      if (!deps.isCanonicalEntity(entityCode)) return deps.legacy.create(req, res, next);
      const body = (req.body ?? {}) as { data?: Record<string, unknown> };
      const command = {
        context, entityCode, input: body.data ?? {}, idempotencyKey: context.idempotencyKey,
        origin: "classic" as const, validationMode: "strict" as const,
      };
      const rollout = deps.resolveRollout?.(context, entityCode, "create");
      selectMutationPath(res, rollout?.executeNewMutation ?? true, "create");
      if (rollout && !rollout.executeNewMutation) {
        reportShadowDifference(deps, rollout, entityCode, context, await deps.service.validateCreate(command));
        return deps.legacy.create(req, res, next);
      }
      await writeResult(res, await deps.service.create(command), deps, context);
    } catch (error) {
      deps.logger?.error("entity_mutation_route_create_failed", { entityCode, error: String(error) });
      next(error);
    }
  };

  const update: RequestHandler = async (req, res, next) => {
    const entityCode = String(req.params["entity"] ?? "");
    try {
      const context = requireVerifiedContext(req, res);
      if (!deps.isCanonicalEntity(entityCode)) return deps.legacy.put(req, res, next);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const input = object(body["data"]) ?? withoutTransportFields(body);
      const rollout = deps.resolveRollout?.(context, entityCode, "patch");
      selectMutationPath(res, rollout?.executeNewMutation ?? true, "patch");
      if (rollout && !rollout.executeNewMutation) {
        reportShadowDifference(deps, rollout, entityCode, context, await deps.service.validatePatch({
          context, entityCode, recordId: String(req.params["id"] ?? ""), input,
          ...(parseExpectedVersion(req.headers["if-match"]) !== undefined
            ? { expectedVersion: parseExpectedVersion(req.headers["if-match"]) } : {}),
          idempotencyKey: context.idempotencyKey, origin: "classic", validationMode: "strict",
        }));
        return deps.legacy.put(req, res, next);
      }
      const recordId = await resolveRecordId(req, res, deps.descriptors, context.tenantId, context.planeKey);
      if (!recordId) return;
      const expectedVersion = readExpectedVersion(req, res);
      if (expectedVersion === null) return;
      const lockToken = text(body["lock_token"]) ?? text(req.headers["x-lock-token"]);
      await writeResult(res, await deps.service.patch({
        context, entityCode, recordId, input, expectedVersion,
        ...(lockToken ? { lockToken } : {}),
        idempotencyKey: context.idempotencyKey, origin: "classic", validationMode: "strict",
      }), deps, context);
    } catch (error) {
      deps.logger?.error("entity_mutation_route_put_failed", { entityCode, error: String(error) });
      next(error);
    }
  };

  const patch: RequestHandler = async (req, res, next) => {
    const entityCode = String(req.params["entity"] ?? "");
    try {
      const context = requireVerifiedContext(req, res);
      if (!deps.isCanonicalEntity(entityCode)) return deps.legacy.patch(req, res, next);
      const rollout = deps.resolveRollout?.(context, entityCode, "patch");
      selectMutationPath(res, rollout?.executeNewMutation ?? true, "patch");
      if (rollout && !rollout.executeNewMutation) {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const input = object(body["data"]) ?? withoutTransportFields(body);
        const suppliedVersion = parseExpectedVersion(req.headers["if-match"]);
        const shadow = await deps.service.validatePatch({
          context,
          entityCode,
          recordId: String(req.params["id"] ?? ""),
          input,
          ...(suppliedVersion !== undefined ? { expectedVersion: suppliedVersion } : {}),
          idempotencyKey: context.idempotencyKey,
          origin: "classic",
          validationMode: "strict",
        });
        reportShadowDifference(deps, rollout, entityCode, context, shadow);
        return deps.legacy.patch(req, res, next);
      }
      const recordId = await resolveRecordId(req, res, deps.descriptors, context.tenantId, context.planeKey);
      if (!recordId) return;
      const expectedVersion = readExpectedVersion(req, res);
      if (expectedVersion === null) return;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const input = object(body["data"]) ?? withoutTransportFields(body);
      const lockToken = text(body["lock_token"]) ?? text(req.headers["x-lock-token"]);
      await writeResult(res, await deps.service.patch({
        context, entityCode, recordId, input, expectedVersion,
        ...(lockToken ? { lockToken } : {}),
        idempotencyKey: context.idempotencyKey, origin: "classic", validationMode: "strict",
      }), deps, context);
    } catch (error) {
      deps.logger?.error("entity_mutation_route_patch_failed", { entityCode, error: String(error) });
      next(error);
    }
  };

  const remove: RequestHandler = async (req, res, next) => {
      const entityCode = String(req.params["entity"] ?? "");
    try {
      const context = requireVerifiedContext(req, res);
      if (!deps.isCanonicalEntity(entityCode)) return deps.legacy.delete(req, res, next);
      const rollout = deps.resolveRollout?.(context, entityCode, "delete");
      selectMutationPath(res, rollout?.executeNewMutation ?? true, "delete");
      if (rollout && !rollout.executeNewMutation) {
        reportShadowDifference(deps, rollout, entityCode, context, await deps.service.validateDelete({
          context, entityCode, recordId: String(req.params["id"] ?? ""),
          ...(parseExpectedVersion(req.headers["if-match"]) !== undefined
            ? { expectedVersion: parseExpectedVersion(req.headers["if-match"]) } : {}),
          idempotencyKey: context.idempotencyKey, origin: "classic", validationMode: "strict",
        }));
        return deps.legacy.delete(req, res, next);
      }
      const recordId = await resolveRecordId(req, res, deps.descriptors, context.tenantId, context.planeKey);
      if (!recordId) return;
      const expectedVersion = readExpectedVersion(req, res);
      if (expectedVersion === null) return;
      if (!context.idempotencyKey) {
        res.status(428).json({ error: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key is required for DELETE." });
        return;
      }
      const lockToken = text(req.headers["x-lock-token"]);
      const result = await deps.service.delete({
        context, entityCode, recordId, expectedVersion,
        ...(lockToken ? { lockToken } : {}), idempotencyKey: context.idempotencyKey,
        origin: "classic", validationMode: "strict",
      });
      if (result.kind === "Committed") {
        if (!result.durableSideEffects) await deps.afterCommit?.(result, context);
        res.status(204).end();
        return;
      }
      await writeResult(res, result, deps, context);
    } catch (error) {
      deps.logger?.error("entity_mutation_route_delete_failed", { entityCode, error: String(error) });
      next(error);
    }
  };
  return { create, update, patch, remove };
}

/**
 * Select the authoritative writer once per request. This marker is deliberately
 * request-local: downstream middleware and legacy fallbacks cannot silently
 * make a second rollout decision after a kernel command has started.
 */
function selectMutationPath(
  res: Response,
  executeNewMutation: boolean,
  operation: MutationKernelOperation,
): void {
  const selected = executeNewMutation ? "kernel" : "legacy";
  const locals = res.locals as Record<string, unknown>;
  const existing = locals["mutationKernelPath"] as { selected: string; operation: string } | undefined;
  if (existing && (existing.selected !== selected || existing.operation !== operation)) {
    throw new Error("MUTATION_ROLLOUT_RESELECTED");
  }
  locals["mutationKernelPath"] = { selected, operation };
  res.setHeader("X-Athyper-Mutation-Path", selected);
}

function reportShadowDifference(
  deps: EntityMutationRouteDeps,
  rollout: MutationKernelRolloutDecision,
  entityCode: string,
  context: VerifiedRequestContext,
  result: MutationResult | null,
): void {
  if (!result) return;
  deps.logger?.warn?.("entity_mutation_shadow_difference", {
    entityCode,
    tenantId: context.tenantId,
    operation: rollout.operation,
    stage: rollout.stage,
    resultKind: result.kind,
  });
}

async function writeResult(
  res: Response,
  result: MutationResult,
  deps: EntityMutationRouteDeps,
  context: VerifiedRequestContext,
): Promise<void> {
  if (result.kind === "Committed" && !result.durableSideEffects) await deps.afterCommit?.(result, context);
  const mapped = mapMutationResultToHttp(result);
  for (const [name, value] of Object.entries(mapped.headers ?? {})) res.setHeader(name, value);
  res.status(mapped.status).json(mapped.body);
}

async function resolveRecordId(
  req: Request, res: Response, descriptors: EntityDescriptorRepository, tenantId: string,
  plane: VerifiedRequestContext["planeKey"],
): Promise<string | null> {
  const entityCode = String(req.params["entity"] ?? "");
  const supplied = String(req.params["id"] ?? "");
  const recordId = await descriptors.resolveRecordId(entityCode, supplied, tenantId, plane);
  if (!recordId) res.status(404).json({ error: "RECORD_NOT_FOUND", message: `Record '${supplied}' not found` });
  return recordId;
}

function readExpectedVersion(req: Request, res: Response): number | null {
  const raw = text(req.headers["if-match"]);
  const normalized = raw?.trim().replace(/^W\//i, "").replace(/^"(\d+)"$/, "$1");
  if (!normalized) {
    res.status(428).json({ error: "PRECONDITION_REQUIRED", message: "If-Match is required." });
    return null;
  }
  if (!/^\d+$/.test(normalized)) {
    res.status(400).json({ error: "BAD_ETAG", message: "If-Match must be a numeric etag." });
    return null;
  }
  return Number.parseInt(normalized, 10);
}

function parseExpectedVersion(value: unknown): number | undefined {
  const raw = text(value);
  const normalized = raw?.trim().replace(/^W\//i, "").replace(/^"(\d+)"$/, "$1");
  return normalized && /^\d+$/.test(normalized) ? Number.parseInt(normalized, 10) : undefined;
}

function withoutTransportFields(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([name]) => name !== "lock_token" && name !== "expected_row_version"));
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;
}
