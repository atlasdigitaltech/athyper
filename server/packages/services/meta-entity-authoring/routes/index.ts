import type {
  MetaEntityCheckpointCommand,
  MetaEntityContractTestRunCommand,
  MetaEntityNumberingPreviewCommand,
  MetaEntityCreateChangeSetCommand,
  MetaEntityCreateCommand,
  MetaEntityPublishCommand,
  MetaEntitySaveCommand,
  MetaEntityWorkflowCommand,
  NumberingPolicyTestCommand,
  NumberingPolicyTestResult,
} from "@athyper/meta-entity-authoring-contracts";
import {
  createStepUpBinding,
  readEffectivePermissionContext,
  requireStepUp,
  TargetCapabilityAuthorizer,
  type CacheClient,
} from "@athyper/svc-iam";
import { isUuid, verifyBearer } from "@athyper/svc-shared";
import type { Request, RequestHandler, Response, Router } from "express";
import type { Kysely } from "kysely";
import { z } from "zod";
import {
  MetaEntityAuthoringError,
  MetaEntityAuthoringService,
  type MetaEntityActorContext,
  type MetaEntityWorkflowAction,
} from "../src/meta-entity-authoring.service.js";
import { PostgresMetaEntityAuthoringRepository } from "../src/postgres-meta-entity-authoring.repository.js";

export interface MetaEntityAuthoringRoutesDeps {
  // The repository uses schema-qualified raw SQL and deliberately does not
  // import the legacy generated database model.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  cache: CacheClient;
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
  numberingPolicyTesters?: Partial<Record<"neon" | "mesh", {
    test(command: NumberingPolicyTestCommand): Promise<NumberingPolicyTestResult>;
  }>>;
}

type Permission =
  | "metadata.entity.view"
  | "metadata.entity.author"
  | "metadata.entity.review"
  | "metadata.entity.publish"
  | "metadata.entity.rollback"
  | "metadata.entity.retire";

const createEntitySchema = z.object({
  moduleCoordinate: z.object({
    planeCode: z.literal("athyper"),
    workspaceCode: z.string().regex(/^[a-z][a-z0-9_.-]{1,62}$/),
    moduleCode: z.string().regex(/^[a-z][a-z0-9_.-]{1,62}$/),
  }).strict(),
  entityCode: z.string().regex(/^[a-z][a-z0-9_]{1,62}$/),
  entityClass: z.enum(["business", "configuration", "reference", "process", "projection", "technical"]),
  initialChangeSet: z.object({
    changeSetCode: z.string().regex(/^[a-z][a-z0-9_.-]{1,126}$/),
    title: z.string().min(1).max(256),
    storagePlane: z.enum(["athyper", "neon", "mesh"]),
    storageSchema: z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/),
    storageObject: z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/),
  }).strict(),
}).strict();

const createChangeSetSchema = z.object({
  entityId: z.string().uuid(), changeSetCode: z.string().min(2).max(127), branchCode: z.string().optional(),
  title: z.string().min(1).max(256), baseReleaseId: z.string().uuid().optional(),
  parentChangeSetId: z.string().uuid().optional(), changeSummary: z.string().max(4000).optional(),
  changeReasonCode: z.string().optional(), ticketReference: z.string().max(256).optional(),
}).strict();

const saveSchema = z.object({
  commandId: z.string().uuid(), changeSetId: z.string().uuid(), expectedLockVersion: z.number().int().nonnegative(),
  graph: z.object({ runtimeProfile: z.record(z.string(), z.unknown()), fields: z.array(z.record(z.string(), z.unknown())),
    keys: z.array(z.record(z.string(), z.unknown())), searchProfiles: z.array(z.record(z.string(), z.unknown())),
    relations: z.array(z.record(z.string(), z.unknown())), surfaces: z.array(z.record(z.string(), z.unknown())),
    operations: z.array(z.record(z.string(), z.unknown())),
    surfaceOperations: z.array(z.record(z.string(), z.unknown())), operationRules: z.array(z.record(z.string(), z.unknown())),
    flows: z.array(z.record(z.string(), z.unknown())), policyBindings: z.array(z.record(z.string(), z.unknown())),
    fieldPolicyBindings: z.array(z.record(z.string(), z.unknown())), testCases: z.array(z.record(z.string(), z.unknown())),
    lifecycleBindings: z.array(z.record(z.string(), z.unknown())),
    lifecycleOperationBindings: z.array(z.record(z.string(), z.unknown())),
    numberingBindings: z.array(z.record(z.string(), z.unknown())) }).strict(),
}).strict();

const checkpointSchema = z.object({
  changeSetId: z.string().uuid(), expectedLockVersion: z.number().int().nonnegative(),
  compatibilityLevel: z.enum(["backward_compatible", "forward_compatible", "full", "breaking"]),
  correlationId: z.string().uuid().optional(),
}).strict();

const contractTestRunSchema = z.object({
  changeSetId: z.string().uuid(), expectedLockVersion: z.number().int().nonnegative(),
  correlationId: z.string().uuid().optional(),
}).strict();

const numberingPreviewSchema = z.object({
  changeSetId: z.string().uuid(), expectedLockVersion: z.number().int().nonnegative(),
  numberingBindingId: z.string().uuid(), nextValue: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  occurredAt: z.string().datetime({ offset: true }), scopeKey: z.string().trim().min(1).max(512).nullable().optional(),
  fiscalYear: z.string().trim().min(1).max(32).nullable().optional(), correlationId: z.string().uuid().optional(),
}).strict();

const workflowSchema = z.object({
  changeSetId: z.string().uuid(), expectedLockVersion: z.number().int().nonnegative(),
  reason: z.string().max(4000).optional(), correlationId: z.string().uuid().optional(),
}).strict();

const publishSchema = workflowSchema.extend({
  revisionId: z.string().uuid(), versionLabel: z.string().optional(),
  releaseKind: z.enum(["publish", "rollback", "retire"]).optional(),
  rollbackOfReleaseId: z.string().uuid().optional(),
  targetPlanes: z.array(z.enum(["athyper", "neon", "mesh"])).min(1).max(3),
  minimumRuntimeVersion: z.string().optional(), ticketReference: z.string().max(256).optional(),
}).strict();

function correlationId(req: Request): string | undefined {
  const value = req.headers["x-correlation-id"];
  return typeof value === "string" && isUuid(value) ? value : undefined;
}

function requestId(req: Request): string | undefined {
  const value = req.headers["x-request-id"];
  return typeof value === "string" ? value.slice(0, 256) : undefined;
}

function statusFor(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof MetaEntityAuthoringError) {
    return { status: error.status, body: { error: error.code, message: error.message, detail: error.detail } };
  }
  if (error instanceof z.ZodError) {
    return { status: 400, body: { error: "INVALID_REQUEST", message: "Request payload is invalid.", detail: error.issues } };
  }
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === "23505") return { status: 409, body: { error: "DUPLICATE_COORDINATE", message: candidate.message ?? "Duplicate Entity coordinate." } };
  return { status: 500, body: { error: "META_ENTITY_AUTHORING_FAILED", message: "Meta Entity authoring failed." } };
}

export function registerMetaEntityAuthoringRoutes(router: Router, deps: MetaEntityAuthoringRoutesDeps): Router {
  const service = new MetaEntityAuthoringService(
    new PostgresMetaEntityAuthoringRepository(deps.db),
    deps.numberingPolicyTesters,
  );
  const authorizer = new TargetCapabilityAuthorizer(deps.db);

  type RouteContext = MetaEntityActorContext & { claims: Record<string, unknown> };

  const authorized = (permission: Permission, handler: (req: Request, res: Response, context: RouteContext) => Promise<unknown>): RequestHandler =>
    async (req, res) => {
      const claims = await verifyBearer(req.headers.authorization ?? "", deps.auth, res);
      if (!claims) return;
      const permissions = readEffectivePermissionContext(res);
      if (!permissions) {
        res.status(403).json({ error: "VERIFIED_CONTEXT_REQUIRED", message: "Verified tenant and principal context is required." });
        return;
      }
      try {
        const decision = await authorizer.authorize({
          tenantId: permissions.tenantId,
          principalId: permissions.principalId,
          permissionCode: permission,
          scope: { kind: "tenant", targetId: permissions.tenantId },
        });
        if (!decision.granted) {
          res.status(403).json({
            error: "FORBIDDEN",
            message: `Exact permission ${permission} is required at the current tenant scope.`,
            reason: decision.reason,
          });
          return;
        }
        const context: RouteContext = {
          tenantId: permissions.tenantId,
          principalId: permissions.principalId,
          correlationId: correlationId(req),
          requestId: requestId(req),
          claims,
        };
        const value = await handler(req, res, context);
        if (!res.headersSent) res.json(value);
      } catch (error) {
        deps.logger?.error("meta_entity_authoring.route_failed", {
          method: req.method, path: req.path, error: error instanceof Error ? error.message : String(error),
        });
        const mapped = statusFor(error);
        if (!res.headersSent) res.status(mapped.status).json(mapped.body);
      }
    };

  router.get("/meta-entity/entities", authorized("metadata.entity.view", (_req, _res, context) => service.listEntities(context)));
  router.get("/meta-entity/capabilities", authorized("metadata.entity.view", async (_req, _res, context) => {
    const checks = await Promise.all(([
      ["view", "metadata.entity.view"],
      ["author", "metadata.entity.author"],
      ["review", "metadata.entity.review"],
      ["publish", "metadata.entity.publish"],
      ["rollback", "metadata.entity.rollback"],
      ["retire", "metadata.entity.retire"],
    ] as const).map(async ([key, permissionCode]) => [key, (await authorizer.authorize({
      tenantId: context.tenantId,
      principalId: context.principalId,
      permissionCode,
      scope: { kind: "tenant", targetId: context.tenantId },
    })).granted] as const));
    return Object.fromEntries(checks);
  }));
  router.get("/meta-entity/module-coordinates", authorized("metadata.entity.view", (_req, _res, context) =>
    service.listModuleCoordinates(context)));
  router.get("/meta-entity/class-profiles", authorized("metadata.entity.view", (_req, _res, context) => service.listClassProfiles(context)));
  router.get("/meta-entity/policy-definitions", authorized("metadata.entity.view", (_req, _res, context) => service.listPolicyDefinitions(context)));
  router.post("/meta-entity/entities", authorized("metadata.entity.author", async (req, res, context) => {
    const result = await service.createEntity(context, createEntitySchema.parse(req.body) as MetaEntityCreateCommand);
    res.status(201); return result;
  }));
  router.get("/meta-entity/entities/:entityId/change-sets", authorized("metadata.entity.view", (req, _res, context) => {
    const entityId = String(req.params["entityId"]); if (!isUuid(entityId)) throw new MetaEntityAuthoringError("INVALID_ENTITY_ID", "Entity id is invalid.", 400);
    return service.listChangeSets(context, entityId);
  }));
  router.get("/meta-entity/entities/:entityId/releases", authorized("metadata.entity.view", (req, _res, context) => {
    const entityId = String(req.params["entityId"]);
    if (!isUuid(entityId)) throw new MetaEntityAuthoringError("INVALID_ENTITY_ID", "Entity id is invalid.", 400);
    return service.listReleases(context, entityId);
  }));
  router.get("/meta-entity/entities/:entityId/activity", authorized("metadata.entity.view", (req, _res, context) => {
    const entityId = String(req.params["entityId"]);
    if (!isUuid(entityId)) throw new MetaEntityAuthoringError("INVALID_ENTITY_ID", "Entity id is invalid.", 400);
    return service.listActivity(context, entityId);
  }));
  router.post("/meta-entity/entities/:entityId/change-sets", authorized("metadata.entity.author", async (req, res, context) => {
    const entityId = String(req.params["entityId"]);
    const command = createChangeSetSchema.parse({ ...(req.body as object), entityId }) as MetaEntityCreateChangeSetCommand;
    const result = await service.createChangeSet(context, command); res.status(201); return result;
  }));
  router.get("/meta-entity/change-sets/:changeSetId/graph", authorized("metadata.entity.view", (req, _res, context) =>
    service.getGraph(context, String(req.params["changeSetId"]))));
  router.put("/meta-entity/change-sets/:changeSetId/graph", authorized("metadata.entity.author", (req, _res, context) => {
    const command = saveSchema.parse({ ...(req.body as object), changeSetId: String(req.params["changeSetId"]) }) as unknown as MetaEntitySaveCommand;
    return service.saveGraph(context, command);
  }));
  router.post("/meta-entity/change-sets/:changeSetId/validate", authorized("metadata.entity.view", (req, _res, context) =>
    service.validate(context, String(req.params["changeSetId"]))));
  router.post("/meta-entity/change-sets/:changeSetId/checkpoints", authorized("metadata.entity.author", async (req, res, context) => {
    const command = checkpointSchema.parse({ ...(req.body as object), changeSetId: String(req.params["changeSetId"]) }) as MetaEntityCheckpointCommand;
    const result = await service.checkpoint(context, command); res.status(201); return result;
  }));
  router.get("/meta-entity/change-sets/:changeSetId/revisions", authorized("metadata.entity.view", (req, _res, context) =>
    service.listRevisions(context, String(req.params["changeSetId"]))));
  router.post("/meta-entity/change-sets/:changeSetId/test-runs", authorized("metadata.entity.author", async (req, res, context) => {
    const command = contractTestRunSchema.parse({ ...(req.body as object), changeSetId: String(req.params["changeSetId"]) }) as MetaEntityContractTestRunCommand;
    const result = await service.runContractTests(context, command); res.status(201); return result;
  }));
  router.get("/meta-entity/change-sets/:changeSetId/test-runs", authorized("metadata.entity.view", (req, _res, context) =>
    service.listContractTestRuns(context, String(req.params["changeSetId"]))));
  router.get("/meta-entity/test-runs/:testRunId/results", authorized("metadata.entity.view", (req, _res, context) => {
    const testRunId = String(req.params["testRunId"]);
    if (!isUuid(testRunId)) throw new MetaEntityAuthoringError("INVALID_TEST_RUN_ID", "Contract test run id is invalid.", 400);
    return service.listContractTestResults(context, testRunId);
  }));
  router.post("/meta-entity/change-sets/:changeSetId/numbering-previews", authorized("metadata.entity.author", async (req, res, context) => {
    const command = numberingPreviewSchema.parse({ ...(req.body as object), changeSetId: String(req.params["changeSetId"]) }) as MetaEntityNumberingPreviewCommand;
    const result = await service.previewNumbering(context, command); res.status(201); return result;
  }));
  router.get("/meta-entity/change-sets/:changeSetId/numbering-previews", authorized("metadata.entity.view", (req, _res, context) =>
    service.listNumberingTestArtifacts(context, String(req.params["changeSetId"]))));
  router.get("/meta-entity/revisions/:leftRevisionId/diff/:rightRevisionId", authorized("metadata.entity.view", async (req, _res, context) => ({
    changedPaths: await service.diffRevisions(context, String(req.params["leftRevisionId"]), String(req.params["rightRevisionId"])),
  })));

  const workflow = (action: MetaEntityWorkflowAction, permission: Permission): void => {
    router.post(`/meta-entity/change-sets/:changeSetId/${action.replaceAll("_", "-")}`, authorized(permission, async (req, _res, context) => {
      const command = workflowSchema.parse({ ...(req.body as object), changeSetId: String(req.params["changeSetId"]) }) as MetaEntityWorkflowCommand;
      if (permission === "metadata.entity.review") {
        await service.assertSeparationOfDuties(context, "review", command.changeSetId);
      }
      return service.transition(context, action, command);
    }));
  };
  workflow("submit", "metadata.entity.author");
  workflow("return_to_draft", "metadata.entity.review");
  workflow("approve", "metadata.entity.review");
  workflow("reject", "metadata.entity.review");
  workflow("abandon", "metadata.entity.author");
  const release = (
    path: "publish" | "rollback" | "retire",
    permission: Permission,
  ): void => {
    router.post(`/meta-entity/change-sets/:changeSetId/${path}`, authorized(permission, async (req, res, context) => {
      const command = publishSchema.parse({ ...(req.body as object), changeSetId: String(req.params["changeSetId"]), releaseKind: path }) as MetaEntityPublishCommand;
      const subject = typeof context.claims.sub === "string" ? context.claims.sub : "";
      const binding = createStepUpBinding(context.claims, subject, context.tenantId, "metadata_release");
      if (!await requireStepUp(deps.cache, binding, res)) return undefined;
      await service.assertSeparationOfDuties(context, path, command.changeSetId, command.rollbackOfReleaseId);
      return service.publish(context, command);
    }));
  };
  release("publish", "metadata.entity.publish");
  release("rollback", "metadata.entity.rollback");
  release("retire", "metadata.entity.retire");
  return router;
}
