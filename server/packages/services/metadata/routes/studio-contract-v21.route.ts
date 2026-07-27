import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { MetaEntityContractV21 } from "@athyper/api-contracts/meta-entity-contract-v21";

import { readEffectivePermissionContext } from "@athyper/svc-iam";
import { verifyBearer } from "@athyper/svc-shared";

import {
  ContractApplicationError,
  ContractApplicationService,
  type ContractApplicationRequest,
} from "../src/contract-application/contract-application.service.js";
import { PostgresContractApplicationRepository } from "../src/contract-application/postgres-contract-application.repository.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface StudioContractV21RoutesDeps {
  db: AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
  compileEntityVersionInTransaction?: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction: Kysely<any>,
    versionId: string,
  ) => Promise<unknown>;
}

function principalId(claims: Record<string, unknown>): string | null {
  const value = claims["sub"] ?? claims["principal_id"];
  return typeof value === "string" && value.trim() ? value : null;
}

function tenantId(claims: Record<string, unknown>): string | null {
  const value = claims["tenant_id"];
  return typeof value === "string" && value.trim() ? value : null;
}

function lockVersion(req: Parameters<RequestHandler>[0]): number {
  return Number(req.headers["x-contract-lock-version"]);
}

function ifMatch(req: Parameters<RequestHandler>[0]): string {
  const value = req.headers["if-match"];
  return typeof value === "string" ? value : "";
}

function requestKey(req: Parameters<RequestHandler>[0]): string | null {
  const value = req.headers["idempotency-key"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createStudioContractV21Routes(
  router: Router,
  deps: StudioContractV21RoutesDeps,
): Router {
  const service = new ContractApplicationService(
    new PostgresContractApplicationRepository(
      deps.db,
      deps.compileEntityVersionInTransaction
        ? (transaction, versionId) =>
            deps.compileEntityVersionInTransaction!(transaction as AnyDb, versionId)
        : undefined,
    ),
  );

  function authorized(
    permissions: readonly string[],
    options: { any?: boolean } = {},
  ): RequestHandler {
    return async (req, res, next) => {
      try {
        const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
        const actorId = claims ? principalId(claims) : null;
        if (!claims || !actorId) return;
        const context = readEffectivePermissionContext(res);
        const has = (permission: string) =>
          context?.allowed.has(permission)
          && !context.denied.has(permission)
          && !context.planLocked.has(permission)
          && !context.planeExcluded.has(permission);
        const permissionAllowed = options.any
          ? permissions.some(has)
          : permissions.every(has);
        if (context?.planeKey !== "admin"
            || context.principalId !== actorId
            || !permissionAllowed) {
          res.status(403).json({
            error: "METADATA_CONTRACT_FORBIDDEN",
            required_permissions: permissions,
          });
          return;
        }
        (req as typeof req & {
          contractActorId: string;
          contractTenantId: string | null;
          contractPermissions: ReadonlySet<string>;
        }).contractActorId = actorId;
        (req as typeof req & { contractTenantId: string | null }).contractTenantId = tenantId(claims);
        (req as typeof req & { contractPermissions: ReadonlySet<string> }).contractPermissions = context.allowed;
        next();
      } catch (error) {
        if (error instanceof ContractApplicationError) {
          res.status(error.status).json({ error: error.code, message: error.message, ...error.details });
          return;
        }
        next(error);
      }
    };
  }

  const execute = (
    build: (req: Parameters<RequestHandler>[0]) => ContractApplicationRequest,
  ): RequestHandler => async (req, res, next) => {
    try {
      const result = await service.execute(build(req));
      if (result.contractHash) res.setHeader("ETag", `"${result.contractHash}"`);
      if (result.lockVersion !== undefined) {
        res.setHeader("X-Contract-Lock-Version", String(result.lockVersion));
      }
      const permissionSet = (req as typeof req & {
        contractPermissions?: ReadonlySet<string>;
      }).contractPermissions;
      const permissions = permissionSet
        ? [...permissionSet].filter((permission) => permission.startsWith("metadata.contract.")).sort()
        : [];
      res.status(result.valid ? 200 : 422).json({
        ...result,
        ...(req.method === "GET"
          ? {
              permissions,
              workflow: {
                status: result.versionStatus ?? null,
                lock_version: result.lockVersion ?? null,
                contract_hash: result.contractHash ?? null,
              },
            }
          : {}),
      });
    } catch (error) {
      if (error instanceof ContractApplicationError) {
        res.status(error.status).json({
          error: error.code,
          message: error.message,
          ...error.details,
        });
        return;
      }
      deps.logger?.error("studio_contract_v21_error", { error: String(error) });
      next(error);
    }
  };

  // Pure schema operations: no repository mutation.
  router.post(
    "/metadata/studio/contracts/v2.1/validate",
    authorized(["metadata.contract.view"]),
    execute((req) => ({ mode: "validate", contract: req.body })),
  );
  router.post(
    "/metadata/studio/contracts/v2.1/diff",
    authorized(["metadata.contract.view"]),
    execute((req) => ({
      mode: "diff",
      before: (req.body as Record<string, unknown>)["before"],
      after: (req.body as Record<string, unknown>)["after"],
    })),
  );

  router.post(
    "/metadata/studio/contracts/v2.1/drafts",
    authorized(["metadata.contract.draft.create"]),
    execute((req) => {
      const body = req.body as Record<string, unknown>;
      const request = req as typeof req & {
        contractActorId: string;
        contractTenantId: string | null;
      };
      return {
        mode: "create-draft",
        entityCode: String(body["entity_code"]),
        tenantId: request.contractTenantId,
        actorId: request.contractActorId,
        changeType: (body["change_type"] ?? "behavioral") as
          "structural" | "behavioral" | "governance" | "label" | "fix",
        changeSummary: typeof body["change_summary"] === "string"
          ? body["change_summary"]
          : null,
        baseVersionId: typeof body["base_version_id"] === "string"
          ? body["base_version_id"]
          : null,
      };
    }),
  );

  // This GET performs exactly one canonical-document read. It never clones,
  // materializes, repairs, or updates projection rows.
  router.get(
    "/metadata/studio/entity-versions/:id/contract-v2.1",
    authorized(["metadata.contract.view"]),
    execute((req) => ({ mode: "get", versionId: String(req.params["id"]) })),
  );

  router.get(
    "/metadata/studio/entity-versions/:id/contract-v2.1/export",
    authorized(["metadata.contract.export"]),
    execute((req) => ({ mode: "export", versionId: String(req.params["id"]) })),
  );

  router.get(
    "/metadata/studio/entity-versions/:id/contract-v2.1/diff",
    authorized(["metadata.contract.view"]),
    async (req, res, next) => {
      try {
        const fromVersionId = String(req.query["from"] ?? "");
        if (!fromVersionId) {
          res.status(400).json({ error: "DIFF_BASE_REQUIRED", message: "Query parameter 'from' is required." });
          return;
        }
        const [before, after] = await Promise.all([
          service.execute({ mode: "export", versionId: fromVersionId }),
          service.execute({ mode: "export", versionId: String(req.params["id"]) }),
        ]);
        const result = await service.execute({
          mode: "diff",
          before: before.contract,
          after: after.contract,
        });
        res.json(result);
      } catch (error) {
        if (error instanceof ContractApplicationError) {
          res.status(error.status).json({
            error: error.code,
            message: error.message,
            ...error.details,
          });
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/metadata/studio/entity-versions/:id/contract-v2.1/dry-run",
    authorized(["metadata.contract.edit", "metadata.contract.import"], { any: true }),
    execute((req) => ({
      mode: "dry-run",
      versionId: String(req.params["id"]),
      contract: req.body,
      ifMatch: ifMatch(req),
      expectedLockVersion: lockVersion(req),
    })),
  );

  router.post(
    "/metadata/studio/entity-versions/:id/contract-v2.1/validate",
    authorized(["metadata.contract.view"]),
    execute((req) => ({
      mode: "dry-run",
      versionId: String(req.params["id"]),
      contract: req.body,
      ifMatch: ifMatch(req),
      expectedLockVersion: lockVersion(req),
    })),
  );

  router.patch(
    "/metadata/studio/entity-versions/:id/contract-v2.1/:owner",
    authorized(["metadata.contract.edit"]),
    execute((req) => ({
      mode: "patch-owner",
      versionId: String(req.params["id"]),
      actorId: (req as typeof req & { contractActorId: string }).contractActorId,
      owner: String(req.params["owner"]) as keyof MetaEntityContractV21,
      value: (req.body as Record<string, unknown>)["value"] ?? req.body,
      baseContract: (req.body as Record<string, unknown>)["base_contract"],
      ifMatch: ifMatch(req),
      expectedLockVersion: lockVersion(req),
      requestKey: requestKey(req),
    })),
  );

  router.post(
    "/metadata/studio/entity-versions/:id/contract-v2.1/submit",
    authorized(["metadata.contract.submit"]),
    execute((req) => ({
      mode: "submit",
      versionId: String(req.params["id"]),
      actorId: (req as typeof req & { contractActorId: string }).contractActorId,
      ifMatch: ifMatch(req),
      expectedLockVersion: lockVersion(req),
      requestKey: requestKey(req),
    })),
  );

  router.put(
    "/metadata/studio/entity-versions/:id/contract-v2.1",
    authorized(["metadata.contract.edit", "metadata.contract.import"], { any: true }),
    execute((req) => ({
      mode: "apply-to-draft",
      versionId: String(req.params["id"]),
      actorId: (req as typeof req & { contractActorId: string }).contractActorId,
      contract: req.body,
      ifMatch: ifMatch(req),
      expectedLockVersion: lockVersion(req),
    })),
  );

  router.post(
    "/metadata/studio/entity-versions/:id/contract-v2.1/publish",
    authorized(["metadata.contract.review", "metadata.contract.publish"]),
    execute((req) => {
      const request = req as typeof req & {
        contractActorId: string;
        contractPermissions: ReadonlySet<string>;
      };
      const body = req.body as Record<string, unknown>;
      const reason = typeof body["reason"] === "string" ? body["reason"] : null;
      const ticket = typeof body["ticket_reference"] === "string"
        ? body["ticket_reference"]
        : null;
      if ((reason || ticket)
          && !request.contractPermissions.has("metadata.contract.break_glass")) {
        throw new ContractApplicationError(
          "BREAK_GLASS_FORBIDDEN",
          "Break-glass permission is required when reason or ticket_reference is supplied.",
          403,
        );
      }
      return {
        mode: "publish",
        versionId: String(req.params["id"]),
        actorId: request.contractActorId,
        ifMatch: ifMatch(req),
        expectedLockVersion: lockVersion(req),
        breakGlassReason: reason,
        breakGlassTicket: ticket,
        requestKey: requestKey(req),
      };
    }),
  );

  router.post(
    "/metadata/studio/entity-versions/:id/contract-v2.1/approve",
    authorized(["metadata.contract.review", "metadata.contract.publish"]),
    execute((req) => {
      const body = req.body as Record<string, unknown>;
      const reason = typeof body["reason"] === "string" ? body["reason"] : null;
      const ticket = typeof body["ticket_reference"] === "string"
        ? body["ticket_reference"]
        : null;
      const permissions = (req as typeof req & {
        contractPermissions: ReadonlySet<string>;
      }).contractPermissions;
      if ((reason || ticket) && !permissions.has("metadata.contract.break_glass")) {
        throw new ContractApplicationError(
          "BREAK_GLASS_FORBIDDEN",
          "Break-glass permission is required when reason or ticket_reference is supplied.",
          403,
        );
      }
      return {
        mode: "publish",
        versionId: String(req.params["id"]),
        actorId: (req as typeof req & { contractActorId: string }).contractActorId,
        ifMatch: ifMatch(req),
        expectedLockVersion: lockVersion(req),
        breakGlassReason: reason,
        breakGlassTicket: ticket,
        requestKey: requestKey(req),
      };
    }),
  );

  router.post(
    "/metadata/studio/entity-versions/:id/contract-v2.1/reject",
    authorized(["metadata.contract.review"]),
    execute((req) => ({
      mode: "reject",
      versionId: String(req.params["id"]),
      actorId: (req as typeof req & { contractActorId: string }).contractActorId,
      ifMatch: ifMatch(req),
      expectedLockVersion: lockVersion(req),
      reason: String((req.body as Record<string, unknown>)["reason"] ?? ""),
      requestKey: requestKey(req),
    })),
  );

  router.post(
    "/metadata/studio/entity-versions/:id/contract-v2.1/rollback",
    authorized(["metadata.contract.rollback"]),
    execute((req) => ({
      mode: "rollback",
      sourceVersionId: String(req.params["id"]),
      actorId: (req as typeof req & { contractActorId: string }).contractActorId,
      requestKey: requestKey(req),
    })),
  );

  return router;
}
