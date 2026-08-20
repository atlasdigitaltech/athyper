import type { AuditEvent, AuditEventSink, AuditRecorder } from "@athyper/server-contract-audit";
import type { TokenVerifier } from "@athyper/server-contract-auth";
import type { OutboxWriter } from "@athyper/server-contract-events";
import {
  createAuditService,
  createStructuredLogAuditSink,
  createTransactionBoundAuditSink,
  registerAuditRoutes,
} from "@athyper/server-platform-audit";
import {
  createIamConfig,
  createIamService,
  createIamAuthenticationMiddleware,
  readVerifiedRequestContext,
  createPermissionAuthorizer,
  createKyselyIdentityContextResolver,
  organizationIdsFromClaims,
  ExactPlaneAuthorizationError,
  createKyselyProvisioningRepository,
  createProvisioningVertical,
  IdentityProvisioningService,
  KyselyIdentityProvisioningAttemptRepository,
  KyselyTrustIamAuthorityRepository,
  OrganizationProjectionService,
  OrganizationService,
  ProjectionScopeService,
  KyselyProjectionReconciliationRepository,
  KyselyExactPlaneProjectionApplier,
  ProjectionReconciliationWorker,
  type TrustIamAuthorityOptions,
  type IamServiceOptions,
  registerIamRoutes,
  type IamConfig,
  type ProvisioningVertical,
} from "@athyper/server-platform-iam";

import type { HostConfig } from "../config/index.js";
import type { Container } from "./create-container.js";
import { sql, type Transaction } from "kysely";
import { defineRouteContract, registerContractRoute } from "@athyper/server-runtime-http";
import { randomUUID } from "node:crypto";
import { captureOperationalError } from "../monitoring/error-collector.js";

const PROJECTION_RECONCILIATION_QUEUE="iam.reconciliation";
const RECONCILE_PROJECTIONS_JOB="trustiam.projection.reconcile";
const SYSTEM_ACTOR_ID="00000000-0000-0000-0000-000000000000";

export interface PlatformRegistrationDependencies {
  readonly tokenVerifier?: TokenVerifier;
  readonly auditSink?: AuditEventSink;
  readonly createAudit?: (sink: AuditEventSink) => AuditRecorder;
  readonly createIam?: typeof createIamService;
  /** Composition seam for an exact-plane identity authority; runtime defaults to Kysely. */
  readonly resolveIdentityContext?: NonNullable<IamServiceOptions["resolveIdentityContext"]>;
  readonly provisioning?: ProvisioningVertical;
}

export function registerPlatform(
  container: Container,
  config: HostConfig,
  dependencies: PlatformRegistrationDependencies = {},
): void {
  const structuredSink = createStructuredLogAuditSink({
    info(event, fields) { console.log(JSON.stringify({ event, ...fields })); },
  });
  const sink = dependencies.auditSink ?? createTransactionBoundAuditSink(structuredSink, {
    append: (event, transaction) => insertAuditEvent(event, transaction as Transaction<Record<string, never>>),
  });
  const audit = dependencies.createAudit?.(sink) ?? createAuditService({ sink });
  container.platform.audit = audit;

  const tokenVerifier = dependencies.tokenVerifier ?? container.adapters.keycloakAuth;
  if (!tokenVerifier) return;
  const iamConfig = createIamConfig({
    environment: config.env,
    defaultRealmKey: config.iam.defaultRealmKey,
    claimContextMode: config.iam.claimContextMode,
    requireAuthorizedRole: config.iam.requireAuthorizedRole,
    enforceRequiredActions: config.iam.enforceRequiredActions,
    ...(config.iam.requiredActionsMatrixJson
      ? { requiredActionsMatrix: parseRequiredActionMatrix(config.iam.requiredActionsMatrixJson) }
      : {}),
  });
  const resolveIdentityContext = dependencies.resolveIdentityContext ?? createKyselyIdentityContextResolver({
    run(plane, work) {
      const adapter = plane === "studio" ? container.adapters.athyperDatabase
        : plane === "neon" ? container.adapters.neonDatabase
        : container.adapters.meshDatabase;
      if (!adapter) throw new ExactPlaneAuthorizationError("AUTHZ_PLANE_DATABASE_UNAVAILABLE");
      return adapter.withSystemTransaction((transaction) =>
        work(transaction as unknown as Transaction<Record<string, never>>));
    },
  });
  const iam = (dependencies.createIam ?? createIamService)({
    tokenVerifier, audit, config: iamConfig, resolveIdentityContext,
  });
  container.platform.iam = iam;
  const authorizer = createPermissionAuthorizer();
  container.platform.authorizer = authorizer;
  container.platform.httpRegistrars.push((application) => registerIdentityContextDiscovery(application, container, tokenVerifier, iamConfig.defaultRealmKey));
  const studioDatabase = container.adapters.athyperDatabase;
  const provisioning = dependencies.provisioning ?? (studioDatabase ? createProvisioningVertical({
    authorizer,
    repository: createKyselyProvisioningRepository(),
    transactions: {
      run: (_actor, work) => studioDatabase.withTenantTransaction((transaction) => work(transaction as unknown as Transaction<Record<string, never>>)),
    },
    audit,
    outbox: createIamOutboxWriter(),
  }) : undefined);
  if (provisioning) container.platform.provisioning = provisioning;
  if(studioDatabase&&provisioning){
    const transactions={run:<Result>(actor:{tenantId:string;principalId:string},work:(transaction:Transaction<Record<string,never>>)=>Promise<Result>)=>studioDatabase.withTenantTransaction(transaction=>work(transaction as unknown as Transaction<Record<string,never>>))};
    const options:TrustIamAuthorityOptions<Transaction<Record<string,never>>>={repository:new KyselyTrustIamAuthorityRepository(),transactions,authorizer,audit,outbox:createIamOutboxWriter()};
    container.platform.trustIam={organizations:new OrganizationService(options),projections:new OrganizationProjectionService(options),scopes:new ProjectionScopeService(options),identityProvisioning:new IdentityProvisioningService<Transaction<Record<string,never>>>({create:provisioning,repository:new KyselyIdentityProvisioningAttemptRepository(),transactions,authorizer,audit,outbox:createIamOutboxWriter()})};
    container.runtimes.health.register("trustiam.studio-authority",async()=>{try{await sql`SELECT 1 FROM trustiam.organization LIMIT 1`.execute(studioDatabase.database);return{status:"healthy"};}catch{return{status:"unhealthy",message:"TrustIAM Studio authority database is unavailable"};}});
  }
  if(studioDatabase)container.platform.httpRegistrars.push(application=>registerProjectionReconciliationRoutes(application,studioDatabase,iam,authorizer));
  registerProjectionReconciliationWorker(container);
  container.platform.httpRegistrars.push((application) => registerIamRoutes(application, { authenticator: iam, ...(provisioning ? { provisioning } : {}) }));
  container.platform.httpRegistrars.push((application) => registerTrustedDeviceRoutes(application, container, iam));
  container.platform.httpRegistrars.push((application) => registerAuditRoutes(application, {
    authenticate: createIamAuthenticationMiddleware(iam),
  }));
}

function registerProjectionReconciliationWorker(container:Container):void{
  const studio=container.adapters.jobAthyperDatabase,targetAdapters={studio:container.adapters.jobAthyperDatabase,neon:container.adapters.jobNeonDatabase,mesh:container.adapters.jobMeshDatabase};
  if(!studio||!targetAdapters.studio||!targetAdapters.neon||!targetAdapters.mesh)return;
  const repository=new KyselyProjectionReconciliationRepository(studio.database as never);
  const targets=new KyselyExactPlaneProjectionApplier({run(plane,work){const adapter=targetAdapters[plane]!;return adapter.withSystemTransaction(transaction=>work(transaction as never));}},SYSTEM_ACTOR_ID);
  const metric=container.adapters.openTelemetry?.metrics.counter("trustiam_projection_reconciliation_total");
  const worker=new ProjectionReconciliationWorker({workerId:`projection-${process.env["HOSTNAME"]??"worker"}`,repository,targets,alerts:{
    async outbox(event){await studio.withSystemTransaction(transaction=>sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,actor_id,source,payload,created_by) VALUES(${event.authorityTenantId}::uuid,'iam.authority','trustiam.projection.reconciliation.dead_letter',${event.attemptId},'trustiam.projection_reconciliation_attempt',${event.attemptId}::uuid,'trustiam.application_projection',${event.projectionId}::uuid,${SYSTEM_ACTOR_ID}::uuid,'trustiam-reconciler',${JSON.stringify({targetPlane:event.targetPlane,errorCode:event.errorCode})}::jsonb,${SYSTEM_ACTOR_ID}::uuid)`.execute(transaction));},
    metric(labels){metric?.increment(labels);},capture(error,context){captureOperationalError(error,{component:"trustiam-projection-reconciliation","target.plane":context.targetPlane,"projection.id":context.projectionId,"attempt.id":context.attemptId});},
  }});
  if(container.runtimes.jobs)container.runtimes.jobs.register(PROJECTION_RECONCILIATION_QUEUE,RECONCILE_PROJECTIONS_JOB,{async handle(){const outcomes:Record<string,number>={};for(let index=0;index<100;index++){const outcome=await worker.runOne(randomUUID());outcomes[outcome]=(outcomes[outcome]??0)+1;if(outcome==="idle")break;}return{status:"completed",output:outcomes};}});
  container.runtimes.jobDefinitions.push({code:RECONCILE_PROJECTIONS_JOB,owner:"@athyper/server-platform-iam",queue:PROJECTION_RECONCILIATION_QUEUE,name:RECONCILE_PROJECTIONS_JOB,scope:"plane",payloadSchema:{name:RECONCILE_PROJECTIONS_JOB,version:1},timeoutMs:120_000,maxAttempts:1,executionRetentionDays:90});
  if(container.runtimes.scheduler)container.runtimes.scheduledJobs.push({scheduleId:"trustiam-projection-reconciliation",queue:PROJECTION_RECONCILIATION_QUEUE,name:RECONCILE_PROJECTIONS_JOB,data:{},pattern:{kind:"interval",everyMs:60_000},options:{jobId:"trustiam:projection:reconcile",maxAttempts:1,payloadSchema:{name:RECONCILE_PROJECTIONS_JOB,version:1},execution:{planeKey:"studio",scope:"plane",principalId:"trustiam-projection-reconciler"}}});
}

function registerProjectionReconciliationRoutes(application:Parameters<Container["platform"]["httpRegistrars"][number]>[0],studio:NonNullable<Container["adapters"]["athyperDatabase"]>,iam:ReturnType<typeof createIamService>,authorizer:ReturnType<typeof createPermissionAuthorizer>):void{
  const authenticate=createIamAuthenticationMiddleware(iam);
  registerContractRoute(application,defineRouteContract({method:"get",path:"/api/iam/projection-health",operationId:"iam.getProjectionHealth",summary:"Read Studio-authoritative projection reconciliation health",tags:["IAM"],authenticated:true,permission:"studio.iam.application_projection.read",responses:{200:{description:"Projection reconciliation health",body:{type:"object"}},403:{description:"Forbidden"}}}),authenticate,async(_request,response,next)=>{try{const context=readVerifiedRequestContext(response);if(context.planeKey!=="studio"||!(await authorizer.authorize({context,permissionCode:"studio.iam.application_projection.read"})).allowed){response.status(403).json(problem(403,"AUTH_PROJECTION_HEALTH_FORBIDDEN","Projection health requires Studio projection-read authority"));return;}const result=await studio.withTenantTransaction(async transaction=>(await sql<Row>`SELECT count(*) FILTER(WHERE reconciliation_status='in_sync')::int "inSync",count(*) FILTER(WHERE reconciliation_status='pending')::int pending,count(*) FILTER(WHERE reconciliation_status='drifted')::int drifted,count(*) FILTER(WHERE reconciliation_status='failed')::int failed,min(coalesce(updated_at,created_at)) FILTER(WHERE reconciliation_status<>'in_sync') "oldestUnreconciledAt",(SELECT count(*)::int FROM trustiam.projection_reconciliation_attempt WHERE authority_tenant_id=${context.tenantId}::uuid AND status='dead_letter' AND replay_requested_at IS NULL) "deadLetters" FROM trustiam.application_projection WHERE authority_tenant_id=${context.tenantId}::uuid`.execute(transaction)).rows[0]);response.status(200).json(result);}catch(error){next(error);}});
  registerContractRoute(application,defineRouteContract({method:"post",path:"/api/iam/projection-reconciliation-attempts/:attemptId/replay",operationId:"iam.replayProjectionReconciliation",summary:"Request a reviewed replay of one dead-lettered projection attempt",tags:["IAM"],authenticated:true,permission:"studio.iam.application_projection.replay",responses:{202:{description:"Replay accepted",body:{type:"object"}},403:{description:"Forbidden"},404:{description:"Dead letter not found"}}}),authenticate,async(request,response,next)=>{try{const context=readVerifiedRequestContext(response);if(context.planeKey!=="studio"||!(await authorizer.authorize({context,permissionCode:"studio.iam.application_projection.replay"})).allowed){response.status(403).json(problem(403,"AUTH_PROJECTION_REPLAY_FORBIDDEN","Projection replay requires Studio projection-replay authority"));return;}const changed=await studio.withTenantTransaction(transaction=>sql`UPDATE trustiam.projection_reconciliation_attempt SET replay_requested_at=clock_timestamp(),replay_requested_by=${context.principalId}::uuid,updated_by=${context.principalId}::uuid WHERE authority_tenant_id=${context.tenantId}::uuid AND id=${request.params.attemptId}::uuid AND status='dead_letter' AND replay_requested_at IS NULL`.execute(transaction));if(Number(changed.numAffectedRows??0)!==1){response.status(404).json(problem(404,"AUTH_PROJECTION_DEAD_LETTER_NOT_FOUND","Replayable projection dead letter was not found"));return;}response.status(202).json({accepted:true,attemptId:request.params.attemptId});}catch(error){next(error);}});
}

type Row=Record<string,unknown>;

function registerTrustedDeviceRoutes(
  application: Parameters<Container["platform"]["httpRegistrars"][number]>[0],
  container: Container,
  authenticator: ReturnType<typeof createIamService>,
): void {
  const authenticate = createIamAuthenticationMiddleware(authenticator);
  registerContractRoute(application, defineRouteContract({
    method: "post", path: "/api/iam/trusted-devices", operationId: "iam.registerTrustedDevice",
    summary: "Register remembered-device evidence after verified step-up", tags: ["IAM"], authenticated: true,
    request: { body: { type: "object", properties: { deviceTokenHash: { type: "string", pattern: "^[0-9a-f]{64}$" }, ttlSeconds: { type: "integer", minimum: 60, maximum: 7_776_000 }, userAgent: { type: "string", maxLength: 2048 } }, required: ["deviceTokenHash", "ttlSeconds"] } },
    responses: { 201: { description: "Remembered-device evidence registered", body: { type: "object" } }, 400: { description: "Invalid registration" }, 401: { description: "Authentication required" }, 403: { description: "Context rejected" }, 409: { description: "Token digest collision" }, 503: { description: "Exact-plane authority unavailable" } },
  }), authenticate, async (request, response, next) => {
    try {
      const context = readVerifiedRequestContext(response);
      if (!hasSecondFactor(context.authenticationMethods)) { response.status(403).json(problem(403, "AUTH_STEP_UP_ASSURANCE_REQUIRED", "Trusted-device enrollment requires issuer-proven multi-factor authentication")); return; }
      const hash = typeof request.body?.deviceTokenHash === "string" ? request.body.deviceTokenHash : "";
      const ttlSeconds = request.body?.ttlSeconds;
      const userAgent = request.body?.userAgent;
      if (!/^[0-9a-f]{64}$/.test(hash) || typeof ttlSeconds !== "number" || !Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 7_776_000 || (userAgent !== undefined && (typeof userAgent !== "string" || userAgent.length > 2048))) { response.status(400).json(problem(400, "AUTH_TRUSTED_DEVICE_REGISTRATION_INVALID", "Trusted-device registration is invalid")); return; }
      const run = tenantContextTransaction(container, context.planeKey);
      if (!run) { response.status(503).json(problem(503, "AUTH_TRUSTED_DEVICE_DIRECTORY_UNAVAILABLE", "Exact-plane trusted-device authority is unavailable")); return; }
      const row = await run(async (transaction) => {
        const created = (await sql<{ id: string; expiresAt: string }>`
          INSERT INTO authz.trusted_device
            (tenant_id,principal_id,auth_epoch,device_token_hash,user_agent,expires_at,created_by)
          VALUES
            (${context.tenantId}::uuid,${context.principalId}::uuid,${context.authEpoch},${hash},${typeof userAgent === "string" ? userAgent : null},clock_timestamp()+(${ttlSeconds}*interval '1 second'),${context.principalId}::uuid)
          ON CONFLICT (tenant_id,device_token_hash) DO NOTHING
          RETURNING id::text,expires_at::text AS "expiresAt"
        `.execute(transaction)).rows[0];
        if (created) await container.platform.audit?.record({ eventCode: "iam.trusted_device.registered", action: "create", outcome: "success", actor: { kind: "user", principalId: context.principalId }, tenantId: context.tenantId, entityType: "authz.trusted_device", entityId: created.id, requestId: context.requestId, ...(context.correlationId ? { correlationId: context.correlationId } : {}), metadata: { planeKey: context.planeKey, expiresAt: created.expiresAt } }, transaction);
        return created;
      });
      if (!row) { response.status(409).json(problem(409, "AUTH_TRUSTED_DEVICE_TOKEN_COLLISION", "Trusted-device registration could not allocate unique evidence")); return; }
      response.setHeader("Cache-Control", "private, no-store");
      response.status(201).json({ tenantId: context.tenantId, principalId: context.principalId, expiresAt: row.expiresAt });
    } catch (error) { next(error); }
  });
  registerContractRoute(application, defineRouteContract({
    method: "post", path: "/api/iam/trusted-devices/verify", operationId: "iam.verifyTrustedDevice",
    summary: "Verify remembered-device evidence in the exact authenticated plane", tags: ["IAM"], authenticated: true,
    request: { body: { type: "object", properties: { deviceTokenHash: { type: "string", pattern: "^[0-9a-f]{64}$" } }, required: ["deviceTokenHash"] } },
    responses: { 200: { description: "Current remembered-device decision", body: { type: "object" } }, 400: { description: "Invalid token digest" }, 401: { description: "Authentication required" }, 403: { description: "Context rejected" }, 503: { description: "Exact-plane authority unavailable" } },
  }), authenticate, async (request, response, next) => {
    try {
      const context = readVerifiedRequestContext(response);
      const hash = typeof request.body?.deviceTokenHash === "string" ? request.body.deviceTokenHash : "";
      if (!/^[0-9a-f]{64}$/.test(hash)) { response.status(400).json(problem(400, "AUTH_TRUSTED_DEVICE_TOKEN_INVALID", "Trusted-device token digest is invalid")); return; }
      const run = tenantContextTransaction(container, context.planeKey);
      if (!run) { response.status(503).json(problem(503, "AUTH_TRUSTED_DEVICE_DIRECTORY_UNAVAILABLE", "Exact-plane trusted-device authority is unavailable")); return; }
      const row = await run(async (transaction) => (await sql<{ expiresAt: string }>`
        UPDATE authz.trusted_device
           SET last_seen_at=clock_timestamp()
         WHERE tenant_id=${context.tenantId}::uuid
           AND principal_id=${context.principalId}::uuid
           AND auth_epoch=${context.authEpoch}
           AND device_token_hash=${hash}
           AND revoked_at IS NULL
           AND expires_at>clock_timestamp()
         RETURNING expires_at::text AS "expiresAt"
      `.execute(transaction)).rows[0]);
      response.setHeader("Cache-Control", "private, no-store");
      response.status(200).json(row ? { active: true, tenantId: context.tenantId, principalId: context.principalId, expiresAt: row.expiresAt } : { active: false, tenantId: context.tenantId, principalId: context.principalId });
    } catch (error) { next(error); }
  });
}

function registerIdentityContextDiscovery(application: Parameters<Container["platform"]["httpRegistrars"][number]>[0], container: Container, verifier: TokenVerifier, defaultRealmKey: string): void {
  registerContractRoute(application, defineRouteContract({
    method: "get", path: "/api/iam/contexts", operationId: "iam.listIdentityContexts",
    summary: "List active exact-plane tenant memberships for the verified identity", tags: ["IAM"],
    responses: { 200: { description: "Sanitized active contexts", body: { type: "object" } }, 401: { description: "Authentication required" }, 403: { description: "Plane access rejected" }, 503: { description: "Exact-plane identity directory unavailable" } },
  }), async (request, response) => {
    response.setHeader("Cache-Control", "private, no-store");
    let stage = "request";
    try {
      const authorization = request.header("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
      const rawPlane = request.header("x-plane")?.toLowerCase();
      const plane = rawPlane === "neon" || rawPlane === "mesh" || rawPlane === "studio" ? rawPlane : undefined;
      if (!authorization || !plane) { response.status(401).json(problem(401, "AUTH_TOKEN_REQUIRED", "Bearer token and exact plane are required")); return; }
      let token;
      stage = "token_verification";
      try { token = await verifier.verify(authorization); }
      catch { response.status(401).json(problem(401, "AUTH_TOKEN_INVALID", "Authentication token is invalid")); return; }
      if (!acceptsPlane(token.claims, plane)) { response.status(403).json(problem(403, "AUTH_ACCESS_DENIED", "Account is not authorized for this plane")); return; }
      const realmKey = claim(token.claims, "realm_key") ?? issuerRealm(token.issuer) ?? defaultRealmKey;
      const requestedRealm = request.header("x-realm");
      if (realmKey !== defaultRealmKey || (requestedRealm && requestedRealm !== realmKey)) { response.status(403).json(problem(403, "AUTH_CONTEXT_MISMATCH", "Identity realm does not match this deployment")); return; }
      const run = contextTransaction(container, plane);
      if (!run) { response.status(503).json(problem(503, "AUTH_CONTEXT_DIRECTORY_UNAVAILABLE", "The exact-plane identity directory is unavailable")); return; }
      const organizationIds = organizationIdsFromClaims(token.claims);
      if (organizationIds.length === 0) { response.status(403).json(problem(403, "AUTH_ORGANIZATION_REQUIRED", "An active organization context is required")); return; }
      stage = "projection_resolution";
      const contexts = await run(async (transaction) => {
        await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.execute(transaction);
        const projections = await sql<{ tenantId: string }>`
          SELECT DISTINCT projection.tenant_id::text AS "tenantId"
            FROM authz.fn_resolve_active_application_projections(${realmKey},${organizationIds}::text[],'keycloak') projection
           ORDER BY 1
        `.execute(transaction);
        const memberships: Array<{ tenantId: string; tenantCode: string; tenantName: string; principalId: string; authEpoch: number }> = [];
        for (const projection of projections.rows) {
          stage = "principal_resolution";
          await sql`SELECT set_config('app.current_tenant_id',${projection.tenantId},true)`.execute(transaction);
          const principal = (await sql<{ principalId: string; authEpoch: number }>`
            SELECT resolved.principal_id::text AS "principalId",resolved.auth_epoch AS "authEpoch"
              FROM master.fn_resolve_principal_identity(${projection.tenantId}::uuid,'keycloak'::master.identity_provider_d,${realmKey},${token.subject}) resolved
             LIMIT 1
          `.execute(transaction)).rows[0];
          if (!principal) continue;
          stage = "membership_resolution";
          await sql`SELECT set_config('app.current_principal_id',${principal.principalId},true)`.execute(transaction);
          const membership = (await sql<{ tenantId: string; tenantCode: string; tenantName: string; principalId: string; authEpoch: number }>`
            SELECT tenant.id::text AS "tenantId",tenant.code AS "tenantCode",COALESCE(tenant.display_name,tenant.name) AS "tenantName",${principal.principalId}::text AS "principalId",${principal.authEpoch}::int AS "authEpoch"
              FROM master.tenant tenant
             WHERE tenant.id=${projection.tenantId}::uuid AND tenant.status='active'
               AND EXISTS(SELECT 1 FROM authz.plane_membership membership
                 WHERE membership.tenant_id=tenant.id AND membership.principal_id=${principal.principalId}::uuid
                   AND membership.status='active' AND membership.effective_from<=statement_timestamp()
                   AND (membership.effective_until IS NULL OR membership.effective_until>statement_timestamp()))
          `.execute(transaction)).rows[0];
          if (membership) memberships.push(membership);
        }
        memberships.sort((left,right)=>left.tenantName.localeCompare(right.tenantName)||left.tenantCode.localeCompare(right.tenantCode));
        const presented = [];
        for (const row of memberships) {
          stage = "context_presentation";
          await sql`SELECT set_config('app.current_tenant_id',${row.tenantId},true),set_config('app.current_principal_id',${row.principalId},true)`.execute(transaction);
          presented.push({ ...row, ...(await contextPresentation(transaction, plane, row.tenantId)) });
        }
        return presented;
      });
      stage = "response";
      response.status(200).json({ schemaVersion: 1, plane, contexts });
    } catch (cause) {
      const rawPlane = request.header("x-plane")?.toLowerCase();
      process.stderr.write(`${JSON.stringify({
        level: "error",
        event: "auth.context_directory",
        plane: rawPlane === "neon" || rawPlane === "mesh" || rawPlane === "studio" ? rawPlane : "unknown",
        stage,
        errorName: cause instanceof Error ? cause.name : "UnknownError",
        errorCode: safeErrorCode(cause),
      })}\n`);
      response.status(503).json(problem(503, "AUTH_CONTEXT_DIRECTORY_UNAVAILABLE", "The exact-plane identity directory is unavailable"));
    }
  });
}

type SystemWork = <Result>(work: (transaction: Transaction<Record<string, never>>) => Promise<Result>) => Promise<Result>;
function tenantContextTransaction(container: Container, plane: "neon" | "mesh" | "studio"): SystemWork | undefined {
  if (plane === "neon" && container.adapters.neonDatabase) return (work) => container.adapters.neonDatabase!.withTenantTransaction((transaction) => work(transaction as unknown as Transaction<Record<string, never>>));
  if (plane === "mesh" && container.adapters.meshDatabase) return (work) => container.adapters.meshDatabase!.withTenantTransaction((transaction) => work(transaction as unknown as Transaction<Record<string, never>>));
  if (plane === "studio" && container.adapters.athyperDatabase) return (work) => container.adapters.athyperDatabase!.withTenantTransaction((transaction) => work(transaction as unknown as Transaction<Record<string, never>>));
  return undefined;
}
function contextTransaction(container: Container, plane: "neon" | "mesh" | "studio"): SystemWork | undefined {
  if (plane === "neon" && container.adapters.neonDatabase) return (work) => container.adapters.neonDatabase!.withSystemTransaction((transaction) => work(transaction as unknown as Transaction<Record<string, never>>));
  if (plane === "mesh" && container.adapters.meshDatabase) return (work) => container.adapters.meshDatabase!.withSystemTransaction((transaction) => work(transaction as unknown as Transaction<Record<string, never>>));
  if (plane === "studio" && container.adapters.athyperDatabase) return (work) => container.adapters.athyperDatabase!.withSystemTransaction((transaction) => work(transaction as unknown as Transaction<Record<string, never>>));
  return undefined;
}

async function contextPresentation(transaction: Transaction<Record<string, never>>, plane: "neon" | "mesh" | "studio", tenantId: string): Promise<{ description: string; badges: readonly string[] }> {
  if (plane === "neon") {
    const row = (await sql<{ legalEntities: number; operatingOrganizations: number }>`SELECT (SELECT count(*)::int FROM master.legal_entity WHERE tenant_id=${tenantId}::uuid AND status='active') AS "legalEntities", (SELECT count(*)::int FROM master.operating_organization WHERE tenant_id=${tenantId}::uuid AND status='active') AS "operatingOrganizations"`.execute(transaction)).rows[0];
    return { description: "Business operations, finance and governed execution", badges: [`${row?.legalEntities ?? 0} legal entities`, `${row?.operatingOrganizations ?? 0} operating organizations`] };
  }
  if (plane === "mesh") {
    const rows = (await sql<{ role: string; count: number }>`SELECT network_role::text AS role,count(*)::int AS count FROM mesh.network_account WHERE tenant_id=${tenantId}::uuid AND status='active' GROUP BY network_role ORDER BY network_role`.execute(transaction)).rows;
    return { description: "Verified buyer and supplier network participation", badges: rows.map((row) => `${row.count} ${row.role} account${row.count === 1 ? "" : "s"}`) };
  }
  return { description: "Platform administration and governed tenant operations", badges: ["Administrative authority", "Audited access"] };
}

function acceptsPlane(claims: Readonly<Record<string, unknown>>, plane: "neon" | "mesh" | "studio"): boolean {
  const access = claims["resource_access"] as Record<string, { roles?: unknown }> | undefined;
  const planeClient = `${plane}-web`;
  const authorizedParty = claim(claims, "azp");
  const clientRoles = access?.[planeClient]?.roles;
  const claimPlane = claim(claims, "plane") ?? authorizedParty?.replace(/-web$/, "");
  return claimPlane === plane && authorizedParty === planeClient && Array.isArray(clientRoles) && clientRoles.includes("AUTHORIZED");
}
function claim(claims: Readonly<Record<string, unknown>>, name: string): string | undefined { const value=claims[name]; return typeof value==="string"&&value.trim()?value.trim():undefined; }
function safeErrorCode(cause: unknown): string | undefined {
  if (!cause || typeof cause !== "object" || !("code" in cause)) return undefined;
  const code = (cause as { readonly code?: unknown }).code;
  return typeof code === "string" && /^[A-Z0-9_.-]{1,80}$/i.test(code) ? code : undefined;
}
function hasSecondFactor(methods: readonly string[] | undefined): boolean { return methods?.some((method) => ["otp", "webauthn", "webauthn-passwordless", "fido", "fido2", "hwk", "mfa"].includes(method.trim().toLowerCase())) === true; }
function issuerRealm(issuer: string): string | undefined { return issuer.split("/").filter(Boolean).at(-1); }
function problem(status: number, code: string, title: string) { return { type: `https://athyper.dev/problems/${code}`, title, status, code }; }

function createIamOutboxWriter(): OutboxWriter<Transaction<Record<string, never>>> {
  return {
    async append(event, transaction) {
      if (!transaction) throw new Error("IAM outbox writes require the active transaction");
      await sql`
        INSERT INTO event.outbox
          (tenant_id, topic, event_type, event_key, entity_type, entity_id,
           aggregate_type, aggregate_id, actor_id, source, correlation_id, causation_id,
           payload, created_by)
        VALUES
          (${event.tenantId}::uuid, ${event.topic}, ${event.eventType}, ${event.eventKey ?? null},
           ${event.entityType ?? null}, ${event.entityId ?? null}::uuid,
           ${event.aggregateType ?? null}, ${event.aggregateId ?? null}::uuid,
           ${event.actorId}::uuid, 'iam', ${event.correlationId ?? null}::uuid,
           ${event.causationId ?? null}::uuid, ${JSON.stringify(event.payload ?? {})}::jsonb,
           ${event.actorId}::uuid)
      `.execute(transaction);
    },
  };
}

async function insertAuditEvent(event: AuditEvent, transaction: Transaction<Record<string, never>>): Promise<void> {
  const operation = operationFor(event.action);
  await sql`
    SELECT audit.append_event(
      p_event_code := ${event.eventCode},
      p_operation := ${operation}::audit.operation_d,
      p_entity_type := ${event.entityType ?? "platform.audit_event"},
      p_entity_id := ${event.entityId ?? null}::uuid,
      p_outcome := ${event.outcome}::audit.outcome_d,
      p_severity := ${event.severity}::audit.event_severity_d,
      p_context := ${JSON.stringify({ ...(event.metadata ?? {}), recorderEventId: event.id })}::jsonb,
      p_correlation_id := ${uuidOrNull(event.correlationId)}::uuid,
      p_request_id := ${event.requestId ?? null},
      p_occurred_at := ${event.occurredAt}::timestamptz
    )
  `.execute(transaction);
}

function operationFor(action: string): string {
  if (action === "patch" || action === "update") return "update";
  if (action === "transition") return "execute";
  if (action === "authenticate") return "login";
  return ["create", "delete", "restore", "execute", "approve", "reject", "grant", "revoke", "import", "export", "login", "logout"].includes(action)
    ? action
    : "execute";
}

function uuidOrNull(value: string | undefined): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function parseRequiredActionMatrix(raw: string): IamConfig["requiredActionsMatrix"] {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error("AUTH_REQUIRED_ACTIONS_MATRIX must be valid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AUTH_REQUIRED_ACTIONS_MATRIX must be a JSON object");
  }
  return value as Readonly<Record<string, readonly string[]>>;
}
