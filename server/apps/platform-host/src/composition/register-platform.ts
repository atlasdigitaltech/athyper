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
