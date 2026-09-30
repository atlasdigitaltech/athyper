import { restrictAuthenticationToPlanes } from "./plane-admission.js";
import type { AuditEvent } from "@athyper/server-contract-audit";
import {
  createAuditService,
  createStructuredLogAuditSink,
  createTransactionBoundAuditSink,
} from "@athyper/server-platform-audit";
import {
  createIamConfig,
  createIamService,
  createPermissionAuthorizer,
  readSourcePermissionRequirement,
  createKyselyIdentityContextResolver,
  ExactPlaneAuthorizationError,
  type IamConfig,
} from "@athyper/server-platform-iam";
import type { HostConfig } from "../../../config/environment.js";
import type { Container } from "../../../kernel/container.js";
import { sql, type Transaction } from "kysely";
import type { PlatformRegistrationDependencies } from "./registration-contract.js";

export type IdentityAuthorityDependencies = Pick<
  PlatformRegistrationDependencies,
  | "servedPlanes"
  | "tokenVerifier"
  | "auditSink"
  | "createAudit"
  | "createIam"
  | "resolveIdentityContext"
>;

/** Shared identity and permission authority; does not register routes, jobs, or Studio administration. */
export function registerIdentityAuthority(
  container: Container,
  config: HostConfig,
  dependencies: IdentityAuthorityDependencies = {},
) {
  const structuredSink = createStructuredLogAuditSink({
    info(event, fields) {
      console.log(JSON.stringify({ event, ...fields }));
    },
  });
  const sink =
    dependencies.auditSink ??
    createTransactionBoundAuditSink(structuredSink, {
      append: (event, transaction) =>
        insertAuditEvent(
          event,
          transaction as Transaction<Record<string, never>>,
        ),
    });
  const audit =
    dependencies.createAudit?.(sink) ?? createAuditService({ sink });
  container.platform.audit = audit;

  const tokenVerifier =
    dependencies.tokenVerifier ?? container.adapters.keycloakAuth;
  if (!tokenVerifier) return;
  const iamConfig = createIamConfig({
    environment: config.env,
    defaultRealmKey: config.iam.defaultRealmKey,
    claimContextMode: config.iam.claimContextMode,
    requireAuthorizedRole: config.iam.requireAuthorizedRole,
    enforceRequiredActions: config.iam.enforceRequiredActions,
    ...(config.iam.requiredActionsMatrixJson
      ? {
          requiredActionsMatrix: parseRequiredActionMatrix(
            config.iam.requiredActionsMatrixJson,
          ),
        }
      : {}),
  });
  const resolveIdentityContext =
    dependencies.resolveIdentityContext ??
    createKyselyIdentityContextResolver({
      run(plane, work) {
        const adapter =
          plane === "studio"
            ? container.adapters.athyperDatabase
            : plane === "neon"
              ? container.adapters.neonDatabase
              : container.adapters.meshDatabase;
        if (!adapter)
          throw new ExactPlaneAuthorizationError(
            "AUTHZ_PLANE_DATABASE_UNAVAILABLE",
          );
        return adapter.withSystemTransaction((transaction) =>
          work(transaction as unknown as Transaction<Record<string, never>>),
        );
      },
    });
  const underlyingIam = (dependencies.createIam ?? createIamService)({
    tokenVerifier,
    audit,
    config: iamConfig,
    resolveIdentityContext,
  });
  const iam = dependencies.servedPlanes
    ? restrictAuthenticationToPlanes(underlyingIam, dependencies.servedPlanes)
    : underlyingIam;
  container.platform.iam = iam;
  const authorizer = createPermissionAuthorizer({
    // Canonical target reads can have no source allow. Read the source's
    // current catalog requirements independently of the allow snapshot.
    readSourceRequirement: async (context, permissionCode) => {
      const adapter =
        context.planeKey === "studio"
          ? container.adapters.athyperDatabase
          : context.planeKey === "neon"
            ? container.adapters.neonDatabase
            : context.planeKey === "mesh"
              ? container.adapters.meshDatabase
              : undefined;
      if (!adapter) return null;
      return adapter.database.transaction().execute(async (transaction) => {
        await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.execute(
          transaction,
        );
        await sql`SET LOCAL statement_timeout='1500ms'`.execute(transaction);
        await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true)`.execute(
          transaction,
        );
        return readSourcePermissionRequirement(
          transaction as unknown as Transaction<Record<string, never>>,
          context.tenantId,
          permissionCode,
        );
      });
    },
  });
  container.platform.authorizer = authorizer;
  return { iam, authorizer, audit, tokenVerifier, iamConfig };
}

async function insertAuditEvent(
  event: AuditEvent,
  transaction: Transaction<Record<string, never>>,
): Promise<void> {
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
  return [
    "create",
    "delete",
    "restore",
    "execute",
    "approve",
    "reject",
    "grant",
    "revoke",
    "import",
    "export",
    "login",
    "logout",
  ].includes(action)
    ? action
    : "execute";
}

function uuidOrNull(value: string | undefined): string | null {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

function parseRequiredActionMatrix(
  raw: string,
): IamConfig["requiredActionsMatrix"] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("AUTH_REQUIRED_ACTIONS_MATRIX must be valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AUTH_REQUIRED_ACTIONS_MATRIX must be a JSON object");
  }
  return value as Readonly<Record<string, readonly string[]>>;
}
