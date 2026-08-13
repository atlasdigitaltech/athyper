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
  createPermissionAuthorizer,
  createKyselyProvisioningRepository,
  createProvisioningVertical,
  IdentityProvisioningService,
  KyselyIdentityProvisioningAttemptRepository,
  KyselyTrustIamAuthorityRepository,
  OrganizationProjectionService,
  OrganizationService,
  ProjectionScopeService,
  type TrustIamAuthorityOptions,
  registerIamRoutes,
  type IamConfig,
  type ProvisioningVertical,
} from "@athyper/server-platform-iam";

import type { HostConfig } from "../config/index.js";
import type { Container } from "./create-container.js";
import { sql, type Transaction } from "kysely";
import { defineRouteContract, registerContractRoute } from "@athyper/server-runtime-http";

export interface PlatformRegistrationDependencies {
  readonly tokenVerifier?: TokenVerifier;
  readonly auditSink?: AuditEventSink;
  readonly createAudit?: (sink: AuditEventSink) => AuditRecorder;
  readonly createIam?: typeof createIamService;
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
  const iam = (dependencies.createIam ?? createIamService)({ tokenVerifier, audit, config: iamConfig });
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
  container.platform.httpRegistrars.push((application) => registerIamRoutes(application, { authenticator: iam, ...(provisioning ? { provisioning } : {}) }));
  container.platform.httpRegistrars.push((application) => registerAuditRoutes(application, {
    authenticate: createIamAuthenticationMiddleware(iam),
  }));
}

function registerIdentityContextDiscovery(application: Parameters<Container["platform"]["httpRegistrars"][number]>[0], container: Container, verifier: TokenVerifier, defaultRealmKey: string): void {
  registerContractRoute(application, defineRouteContract({
    method: "get", path: "/api/iam/contexts", operationId: "iam.listIdentityContexts",
    summary: "List active exact-plane tenant memberships for the verified identity", tags: ["IAM"],
    responses: { 200: { description: "Sanitized active contexts", body: { type: "object" } }, 401: { description: "Authentication required" }, 403: { description: "Plane access rejected" }, 503: { description: "Exact-plane identity directory unavailable" } },
  }), async (request, response) => {
    response.setHeader("Cache-Control", "private, no-store");
    try {
      const authorization = request.header("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
      const rawPlane = request.header("x-plane")?.toLowerCase();
      const plane = rawPlane === "neon" || rawPlane === "mesh" || rawPlane === "studio" ? rawPlane : undefined;
      if (!authorization || !plane) { response.status(401).json(problem(401, "AUTH_TOKEN_REQUIRED", "Bearer token and exact plane are required")); return; }
      let token;
      try { token = await verifier.verify(authorization); }
      catch { response.status(401).json(problem(401, "AUTH_TOKEN_INVALID", "Authentication token is invalid")); return; }
      if (!acceptsPlane(token.claims, plane)) { response.status(403).json(problem(403, "AUTH_ACCESS_DENIED", "Account is not authorized for this plane")); return; }
      const realmKey = claim(token.claims, "realm_key") ?? issuerRealm(token.issuer) ?? defaultRealmKey;
      const requestedRealm = request.header("x-realm");
      if (realmKey !== defaultRealmKey || (requestedRealm && requestedRealm !== realmKey)) { response.status(403).json(problem(403, "AUTH_CONTEXT_MISMATCH", "Identity realm does not match this deployment")); return; }
      const run = contextTransaction(container, plane);
      if (!run) { response.status(503).json(problem(503, "AUTH_CONTEXT_DIRECTORY_UNAVAILABLE", "The exact-plane identity directory is unavailable")); return; }
      const contexts = await run(async (transaction) => {
        const memberships = await sql<{ tenantId: string; tenantCode: string; tenantName: string; principalId: string }>`
          SELECT t.id::text AS "tenantId", t.code AS "tenantCode", COALESCE(t.display_name, t.name) AS "tenantName", p.id::text AS "principalId"
          FROM master.principal_identity_binding b
          JOIN master.principal p ON p.tenant_id=b.tenant_id AND p.id=b.principal_id AND p.status='active'
          JOIN master.tenant t ON t.id=b.tenant_id AND t.status='active'
          JOIN authz.plane_membership pm ON pm.tenant_id=p.tenant_id AND pm.principal_id=p.id AND pm.status='active'
            AND pm.effective_from<=now() AND (pm.effective_until IS NULL OR pm.effective_until>now())
          WHERE b.provider_code='keycloak' AND b.realm_key=${realmKey} AND b.subject_id=${token.subject} AND b.status='active'
          ORDER BY COALESCE(t.display_name,t.name),t.code
        `.execute(transaction);
        return Promise.all(memberships.rows.map(async (row) => ({ ...row, ...(await contextPresentation(transaction, plane, row.tenantId)) })));
      });
      response.status(200).json({ schemaVersion: 1, plane, contexts });
    } catch {
      response.status(503).json(problem(503, "AUTH_CONTEXT_DIRECTORY_UNAVAILABLE", "The exact-plane identity directory is unavailable"));
    }
  });
}

type SystemWork = <Result>(work: (transaction: Transaction<Record<string, never>>) => Promise<Result>) => Promise<Result>;
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
  const gate = { neon: "NEON_USER", mesh: "MESH_BUYER_USER", studio: "STUDIO_USER" }[plane];
  const realm = claims["realm_access"] as { roles?: unknown } | undefined;
  const roles = Array.isArray(realm?.roles) ? realm.roles : [];
  const access = claims["resource_access"] as Record<string, { roles?: unknown }> | undefined;
  const clientRoles = access?.[`${plane}-web`]?.roles;
  const claimPlane = claim(claims, "plane") ?? claim(claims, "azp")?.replace(/-web$/, "");
  return claimPlane === plane && roles.includes(gate) && Array.isArray(clientRoles) && clientRoles.includes("AUTHORIZED");
}
function claim(claims: Readonly<Record<string, unknown>>, name: string): string | undefined { const value=claims[name]; return typeof value==="string"&&value.trim()?value.trim():undefined; }
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
  const actorType = event.actor.kind === "service" ? "service_account" : event.actor.kind;
  await sql`
    INSERT INTO audit.audit_log
      (id, tenant_id, event_code, operation, outcome, severity, entity_type, entity_id,
       actor_principal_id, actor_type, context, correlation_id, request_id, occurred_at)
    VALUES
      (${event.id}::uuid, ${event.tenantId ?? null}::uuid, ${event.eventCode}, ${operation},
       ${event.outcome}, ${event.severity}, ${event.entityType ?? "platform.audit_event"},
       ${event.entityId ?? null}::uuid, ${event.actor.principalId ?? null}::uuid, ${actorType},
       ${JSON.stringify(event.metadata ?? {})}::jsonb, ${uuidOrNull(event.correlationId)}::uuid,
       ${event.requestId ?? null}, ${event.occurredAt}::timestamptz)
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
