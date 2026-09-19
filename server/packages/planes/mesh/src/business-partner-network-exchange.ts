import { sql, type Transaction } from "kysely";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  SelfRegistrationPolicyUnavailableError,
  type SelfRegistrationPolicyAdapter,
  type SelfRegistrationPolicyEvaluation,
} from "./business-partner-self-registration-policy.js";

type Tx = Transaction<Record<string, never>>;
type Row = Readonly<Record<string, unknown>>;

export const businessPartnerNetworkExchangePermissions = Object.freeze({
  read: "mesh.business_partner_exchange.read",
  relationship: "mesh.business_partner_exchange.relationship",
  exchange: "mesh.business_partner_exchange.registration",
} as const);

export type NetworkCommandResult = Readonly<{
  id: string;
  status: string;
  rowVersion: number;
  evidenceId: string;
  replayed: boolean;
}>;
export type NetworkExchangeIssueResult = NetworkCommandResult &
  Readonly<{ policyEvaluation?: SelfRegistrationPolicyEvaluation }>;
export type BusinessPartnerNetworkWorkspace = Readonly<{
  actingAccount: Readonly<{
    id: string;
    code: string;
    displayName: string;
    role: string;
    status: string;
  }>;
  relationships: readonly Row[];
  capabilities: readonly Row[];
  registrationExchanges: readonly Row[];
  deliveryAcknowledgements?: readonly Row[];
}>;

export interface BusinessPartnerNetworkExchangeRepository {
  workspace(
    tenantId: string,
    accountId: string,
    tx: Tx,
  ): Promise<BusinessPartnerNetworkWorkspace | null>;
  requestRelationship(
    input: {
      tenantId: string;
      accountId: string;
      actorId: string;
      actorRole: "buyer" | "supplier";
      counterpartyTenantId: string;
      counterpartyAccountId: string;
      relationshipKind: string;
      effectiveFrom?: string;
      effectiveUntil?: string;
      reason: string;
      idempotencyKey: string;
    },
    tx: Tx,
  ): Promise<NetworkCommandResult | null>;
  transitionRelationship(
    input: {
      relationshipId: string;
      action:
        "accept" | "reject" | "cancel" | "suspend" | "reactivate" | "terminate";
      expectedVersion: number;
      reason: string;
      idempotencyKey: string;
      actorId: string;
    },
    tx: Tx,
  ): Promise<NetworkCommandResult | null>;
  requestCapability(
    input: {
      relationshipId: string;
      capabilityCode: string;
      effectiveFrom: string;
      effectiveUntil?: string;
      routingPolicy: Readonly<Record<string, unknown>>;
      reason: string;
      idempotencyKey: string;
      actorId: string;
    },
    tx: Tx,
  ): Promise<NetworkCommandResult | null>;
  transitionCapability(
    input: {
      capabilityId: string;
      action: "accept" | "reject" | "suspend" | "end";
      expectedVersion: number;
      reason: string;
      idempotencyKey: string;
      actorId: string;
    },
    tx: Tx,
  ): Promise<NetworkCommandResult | null>;
  issueExchange(
    input: {
      tenantId: string;
      accountId: string;
      actorId: string;
      counterpartyTenantId: string;
      counterpartyAccountId: string;
      intentKind:
        "buyer_request" | "supplier_self_registration" | "discovery_nomination";
      relationshipKind: string;
      contractName: string;
      contractVersion: number;
      contractHash: string;
      intentSnapshot: Readonly<Record<string, unknown>>;
      invitationTokenHash: string;
      expiresAt: string;
      reason: string;
      idempotencyKey: string;
    },
    tx: Tx,
  ): Promise<NetworkCommandResult | null>;
  transitionExchange(
    input: {
      exchangeId: string;
      action: "accept" | "reject" | "cancel" | "expire";
      expectedVersion: number;
      reason: string;
      idempotencyKey: string;
      actorId: string;
    },
    tx: Tx,
  ): Promise<NetworkCommandResult | null>;
}

export class KyselyBusinessPartnerNetworkExchangeRepository implements BusinessPartnerNetworkExchangeRepository {
  async workspace(tenantId: string, accountId: string, tx: Tx) {
    const account = (
      await sql<Row>`SELECT id,account_code,display_name,network_role::text,status::text FROM mesh.network_account WHERE tenant_id=${tenantId}::uuid AND id=${accountId}::uuid`.execute(
        tx,
      )
    ).rows[0];
    if (!account) return null;
    const relationships = (
      await sql<Row>`SELECT id,buyer_tenant_id,buyer_account_id,supplier_tenant_id,supplier_account_id,relationship_kind,status::text,row_version,effective_from,effective_until,created_by_tenant_id,status_changed_at FROM mesh.network_relationship WHERE (buyer_tenant_id=${tenantId}::uuid AND buyer_account_id=${accountId}::uuid) OR (supplier_tenant_id=${tenantId}::uuid AND supplier_account_id=${accountId}::uuid) ORDER BY created_at DESC,id DESC LIMIT 100`.execute(
        tx,
      )
    ).rows;
    const capabilities = (
      await sql<Row>`SELECT capability.id,capability.network_relationship_id,capability.capability_code,capability.status::text,capability.row_version,capability.requested_by_tenant_id,capability.effective_from,capability.effective_until FROM mesh.network_relationship_capability capability JOIN mesh.network_relationship relationship ON relationship.id=capability.network_relationship_id WHERE (relationship.buyer_tenant_id=${tenantId}::uuid AND relationship.buyer_account_id=${accountId}::uuid) OR (relationship.supplier_tenant_id=${tenantId}::uuid AND relationship.supplier_account_id=${accountId}::uuid) ORDER BY capability.created_at DESC,capability.id DESC LIMIT 200`.execute(
        tx,
      )
    ).rows;
    const registrationExchanges = (
      await sql<Row>`SELECT id,requester_tenant_id,counterparty_tenant_id,requester_account_id,counterparty_account_id,intent_kind,relationship_kind,contract_name,contract_version,contract_hash,intent_snapshot,status,row_version,expires_at,status_changed_at FROM mesh.registration_exchange WHERE (requester_tenant_id=${tenantId}::uuid AND requester_account_id=${accountId}::uuid) OR (counterparty_tenant_id=${tenantId}::uuid AND counterparty_account_id=${accountId}::uuid) ORDER BY created_at DESC,id DESC LIMIT 100`.execute(
        tx,
      )
    ).rows;
    const deliveryAcknowledgements = (
      await sql<Row>`SELECT id,event_id,outbox_id,recipient_tenant_id,attempt_no,disposition,reason_code,acknowledged_at FROM mesh.business_partner_delivery_acknowledgement
      WHERE source_tenant_id=${tenantId}::uuid AND source_network_account_id=${accountId}::uuid ORDER BY acknowledged_at DESC,id DESC LIMIT 100`.execute(
        tx,
      )
    ).rows;
    return {
      deliveryAcknowledgements,
      actingAccount: {
        id: String(account["id"]),
        code: String(account["account_code"]),
        displayName: String(account["display_name"]),
        role: String(account["network_role"]),
        status: String(account["status"]),
      },
      relationships,
      capabilities,
      registrationExchanges,
    };
  }
  async requestRelationship(
    input: Parameters<
      BusinessPartnerNetworkExchangeRepository["requestRelationship"]
    >[0],
    tx: Tx,
  ) {
    await sql`SELECT set_config('app.current_network_account_id',${input.accountId},true)`.execute(
      tx,
    );
    const buyer =
      input.actorRole === "buyer"
        ? [input.tenantId, input.accountId]
        : [input.counterpartyTenantId, input.counterpartyAccountId];
    const supplier =
      input.actorRole === "supplier"
        ? [input.tenantId, input.accountId]
        : [input.counterpartyTenantId, input.counterpartyAccountId];
    const row = (
      await sql<Row>`SELECT * FROM mesh.command_request_network_relationship(${buyer[0]}::uuid,${buyer[1]}::uuid,${supplier[0]}::uuid,${supplier[1]}::uuid,${input.relationshipKind},${input.effectiveFrom ?? null}::date,${input.effectiveUntil ?? null}::date,${input.reason},${input.idempotencyKey},${input.actorId}::uuid)`.execute(
        tx,
      )
    ).rows[0];
    return row ? command(row, "relationship_id") : null;
  }
  async transitionRelationship(
    input: Parameters<
      BusinessPartnerNetworkExchangeRepository["transitionRelationship"]
    >[0],
    tx: Tx,
  ) {
    const row = (
      await sql<Row>`SELECT * FROM mesh.command_network_relationship_lifecycle(${input.relationshipId}::uuid,${input.action},${input.expectedVersion},${input.reason},${input.idempotencyKey},${input.actorId}::uuid)`.execute(
        tx,
      )
    ).rows[0];
    return row ? command(row, "relationship_id") : null;
  }
  async requestCapability(
    input: Parameters<
      BusinessPartnerNetworkExchangeRepository["requestCapability"]
    >[0],
    tx: Tx,
  ) {
    const row = (
      await sql<Row>`SELECT * FROM mesh.command_request_relationship_capability(${input.relationshipId}::uuid,${input.capabilityCode},${input.effectiveFrom}::date,${input.effectiveUntil ?? null}::date,${JSON.stringify(input.routingPolicy)}::jsonb,${input.reason},${input.idempotencyKey},${input.actorId}::uuid)`.execute(
        tx,
      )
    ).rows[0];
    return row ? command(row, "capability_id") : null;
  }
  async transitionCapability(
    input: Parameters<
      BusinessPartnerNetworkExchangeRepository["transitionCapability"]
    >[0],
    tx: Tx,
  ) {
    const row = (
      await sql<Row>`SELECT * FROM mesh.command_relationship_capability_lifecycle(${input.capabilityId}::uuid,${input.action},${input.expectedVersion},${input.reason},${input.idempotencyKey},${input.actorId}::uuid)`.execute(
        tx,
      )
    ).rows[0];
    return row ? command(row, "capability_id") : null;
  }
  async issueExchange(
    input: Parameters<
      BusinessPartnerNetworkExchangeRepository["issueExchange"]
    >[0],
    tx: Tx,
  ) {
    const row = (
      await sql<Row>`SELECT * FROM mesh.command_issue_registration_exchange(${input.counterpartyTenantId}::uuid,${input.accountId}::uuid,${input.counterpartyAccountId}::uuid,${input.intentKind},${input.relationshipKind},${input.contractName},${input.contractVersion},${input.contractHash},${JSON.stringify(input.intentSnapshot)}::jsonb,${input.invitationTokenHash},${input.expiresAt}::timestamptz,${input.reason},${input.idempotencyKey},${input.actorId}::uuid)`.execute(
        tx,
      )
    ).rows[0];
    return row ? command(row, "exchange_id") : null;
  }
  async transitionExchange(
    input: Parameters<
      BusinessPartnerNetworkExchangeRepository["transitionExchange"]
    >[0],
    tx: Tx,
  ) {
    const row = (
      await sql<Row>`SELECT * FROM mesh.command_registration_exchange_lifecycle(${input.exchangeId}::uuid,${input.action},${input.expectedVersion},${input.reason},${input.idempotencyKey},${input.actorId}::uuid)`.execute(
        tx,
      )
    ).rows[0];
    return row ? command(row, "exchange_id") : null;
  }
}

export interface BusinessPartnerNetworkExchangeService {
  workspace(input: {
    context: VerifiedRequestContext;
  }): Promise<BusinessPartnerNetworkWorkspace>;
  requestRelationship(input: {
    context: VerifiedRequestContext;
    actorRole: "buyer" | "supplier";
    counterpartyTenantId: string;
    counterpartyAccountId: string;
    relationshipKind: string;
    effectiveFrom?: string;
    effectiveUntil?: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<NetworkCommandResult>;
  transitionRelationship(input: {
    context: VerifiedRequestContext;
    relationshipId: string;
    action:
      "accept" | "reject" | "cancel" | "suspend" | "reactivate" | "terminate";
    expectedVersion: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<NetworkCommandResult>;
  requestCapability(input: {
    context: VerifiedRequestContext;
    relationshipId: string;
    capabilityCode: string;
    effectiveFrom: string;
    effectiveUntil?: string;
    routingPolicy?: Readonly<Record<string, unknown>>;
    reason: string;
    idempotencyKey: string;
  }): Promise<NetworkCommandResult>;
  transitionCapability(input: {
    context: VerifiedRequestContext;
    capabilityId: string;
    action: "accept" | "reject" | "suspend" | "end";
    expectedVersion: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<NetworkCommandResult>;
  issueExchange(input: {
    context: VerifiedRequestContext;
    counterpartyTenantId: string;
    counterpartyAccountId: string;
    intentKind:
      "buyer_request" | "supplier_self_registration" | "discovery_nomination";
    relationshipKind: string;
    contractName: string;
    contractVersion: number;
    contractHash: string;
    intentSnapshot: Readonly<Record<string, unknown>>;
    invitationTokenHash: string;
    expiresAt: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<NetworkExchangeIssueResult>;
  transitionExchange(input: {
    context: VerifiedRequestContext;
    exchangeId: string;
    action: "accept" | "reject" | "cancel" | "expire";
    expectedVersion: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<NetworkCommandResult>;
}

export interface BusinessPartnerNetworkExchangeTransactions {
  run<T>(
    plane: "mesh",
    actor: {
      tenantId: string;
      principalId: string;
      requestId: string;
      correlationId?: string;
    },
    work: (tx: Tx) => Promise<T>,
  ): Promise<T>;
}

export function createBusinessPartnerNetworkExchangeService(options: {
  authorizer: Authorizer;
  repository: BusinessPartnerNetworkExchangeRepository;
  transactions: BusinessPartnerNetworkExchangeTransactions;
  selfRegistrationPolicy?: SelfRegistrationPolicyAdapter;
}): BusinessPartnerNetworkExchangeService {
  const run = <T>(
    context: VerifiedRequestContext,
    work: (tx: Tx) => Promise<T>,
  ) =>
    options.transactions.run("mesh", actor(context), work).catch((cause) => {
      throw databaseError(cause);
    });
  return {
    async workspace({ context }) {
      meshContext(context);
      const accountId = coordinate(context);
      await permit(
        options.authorizer,
        context,
        businessPartnerNetworkExchangePermissions.read,
        { networkAccountId: accountId },
      );
      const value = await run(context, (tx) =>
        options.repository.workspace(context.tenantId, accountId, tx),
      );
      if (!value)
        throw new MeshNetworkExchangeError(
          404,
          "MESH_NETWORK_ACCOUNT_NOT_FOUND",
          "The acting network account is unavailable",
        );
      return value;
    },
    async requestRelationship(input) {
      validate(input.context, input.idempotencyKey, input.reason);
      const accountId = coordinate(input.context);
      await permit(
        options.authorizer,
        input.context,
        businessPartnerNetworkExchangePermissions.relationship,
        { networkAccountId: accountId },
      );
      return required(
        await run(input.context, (tx) =>
          options.repository.requestRelationship(
            {
              ...input,
              tenantId: input.context.tenantId,
              accountId,
              actorId: input.context.principalId,
            },
            tx,
          ),
        ),
      );
    },
    async transitionRelationship(input) {
      validate(input.context, input.idempotencyKey, input.reason);
      await permit(
        options.authorizer,
        input.context,
        businessPartnerNetworkExchangePermissions.relationship,
        { networkRelationshipId: input.relationshipId },
      );
      return required(
        await run(input.context, (tx) =>
          options.repository.transitionRelationship(
            { ...input, actorId: input.context.principalId },
            tx,
          ),
        ),
      );
    },
    async requestCapability(input) {
      validate(input.context, input.idempotencyKey, input.reason);
      await permit(
        options.authorizer,
        input.context,
        businessPartnerNetworkExchangePermissions.relationship,
        { networkRelationshipId: input.relationshipId },
      );
      return required(
        await run(input.context, (tx) =>
          options.repository.requestCapability(
            {
              ...input,
              routingPolicy: input.routingPolicy ?? {},
              actorId: input.context.principalId,
            },
            tx,
          ),
        ),
      );
    },
    async transitionCapability(input) {
      validate(input.context, input.idempotencyKey, input.reason);
      await permit(
        options.authorizer,
        input.context,
        businessPartnerNetworkExchangePermissions.relationship,
        {},
      );
      return required(
        await run(input.context, (tx) =>
          options.repository.transitionCapability(
            { ...input, actorId: input.context.principalId },
            tx,
          ),
        ),
      );
    },
    async issueExchange(input) {
      const allowedIntentFields = new Set([
        "displayName",
        "countryCode",
        "requestedCapabilities",
        "sourceReference",
        "message",
      ]);
      if (
        Object.keys(input.intentSnapshot).some(
          (field) => !allowedIntentFields.has(field),
        )
      )
        throw new MeshNetworkExchangeError(
          400,
          "MESH_EXCHANGE_INVALID",
          "intentSnapshot contains unsupported fields",
        );
      validate(input.context, input.idempotencyKey, input.reason);
      const accountId = coordinate(input.context);
      await permit(
        options.authorizer,
        input.context,
        businessPartnerNetworkExchangePermissions.exchange,
        { networkAccountId: accountId },
      );
      let policyEvaluation: SelfRegistrationPolicyEvaluation | undefined;
      if (input.intentKind === "supplier_self_registration") {
        if (!options.selfRegistrationPolicy)
          throw new MeshNetworkExchangeError(
            503,
            "MESH_SELF_REGISTRATION_POLICY_UNAVAILABLE",
            "External self-registration policy is not configured",
          );
        try {
          policyEvaluation = await options.selfRegistrationPolicy.evaluate({
            tenantId: input.context.tenantId,
            principalId: input.context.principalId,
            networkAccountId: accountId,
            counterpartyTenantId: input.counterpartyTenantId,
            counterpartyAccountId: input.counterpartyAccountId,
            relationshipKind: input.relationshipKind,
            contractName: input.contractName,
            contractVersion: input.contractVersion,
            contractHash: input.contractHash,
            intentSnapshot: input.intentSnapshot,
            requestId: input.context.requestId,
          });
        } catch (cause) {
          if (cause instanceof SelfRegistrationPolicyUnavailableError)
            throw new MeshNetworkExchangeError(
              503,
              "MESH_SELF_REGISTRATION_POLICY_UNAVAILABLE",
              cause.message,
            );
          throw cause;
        }
        if (policyEvaluation.outcome === "internal_sponsor_required")
          throw new MeshNetworkExchangeError(
            409,
            "MESH_INTERNAL_SPONSOR_REQUIRED",
            `Internal sponsor required; policy evaluation ${policyEvaluation.evaluationId}`,
          );
        if (policyEvaluation.outcome === "rejected")
          throw new MeshNetworkExchangeError(
            403,
            "MESH_SELF_REGISTRATION_REJECTED",
            `Self-registration rejected; policy evaluation ${policyEvaluation.evaluationId}`,
          );
      }
      const result = required(
        await run(input.context, (tx) =>
          options.repository.issueExchange(
            {
              ...input,
              intentSnapshot: policyEvaluation
                ? {
                    ...input.intentSnapshot,
                    policyEvaluation: {
                      evaluationId: policyEvaluation.evaluationId,
                      policyVersion: policyEvaluation.policyVersion,
                      evidenceHash: policyEvaluation.evidenceHash,
                      evaluatedAt: policyEvaluation.evaluatedAt,
                    },
                  }
                : input.intentSnapshot,
              tenantId: input.context.tenantId,
              accountId,
              actorId: input.context.principalId,
            },
            tx,
          ),
        ),
      );
      return policyEvaluation ? { ...result, policyEvaluation } : result;
    },
    async transitionExchange(input) {
      validate(input.context, input.idempotencyKey, input.reason);
      await permit(
        options.authorizer,
        input.context,
        businessPartnerNetworkExchangePermissions.exchange,
        {},
      );
      return required(
        await run(input.context, (tx) =>
          options.repository.transitionExchange(
            { ...input, actorId: input.context.principalId },
            tx,
          ),
        ),
      );
    },
  };
}

export class MeshNetworkExchangeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function command(row: Row, idKey: string): NetworkCommandResult {
  return {
    id: String(row[idKey]),
    status: String(row["status"]),
    rowVersion: Number(row["row_version"]),
    evidenceId: String(row["evidence_id"]),
    replayed: Boolean(row["replayed"]),
  };
}
function coordinate(context: VerifiedRequestContext) {
  const id = context.permissions.networkAccountId;
  if (!id)
    throw new MeshNetworkExchangeError(
      409,
      "MESH_NETWORK_ACCOUNT_CONTEXT_REQUIRED",
      "Select an acting network account",
    );
  return id;
}
function validate(
  context: VerifiedRequestContext,
  key: string,
  reason: string,
) {
  meshContext(context);
  if (key.trim() !== key || key.length < 8 || key.length > 200)
    throw new MeshNetworkExchangeError(
      400,
      "MESH_EXCHANGE_INVALID",
      "idempotencyKey must contain 8 to 200 trimmed characters",
    );
  if (reason.trim() !== reason || reason.length < 1 || reason.length > 2000)
    throw new MeshNetworkExchangeError(
      400,
      "MESH_EXCHANGE_INVALID",
      "reason must contain 1 to 2000 trimmed characters",
    );
}
async function permit(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  permissionCode: string,
  resource: Readonly<Record<string, unknown>>,
) {
  if (
    !(
      await authorizer.authorize({
        context,
        permissionCode,
        resource: { tenantId: context.tenantId, ...resource },
      })
    ).allowed
  )
    throw new MeshNetworkExchangeError(
      403,
      "FORBIDDEN",
      `Permission denied: ${permissionCode}`,
    );
}
function actor(context: VerifiedRequestContext) {
  return {
    tenantId: context.tenantId,
    principalId: context.principalId,
    requestId: context.requestId,
    correlationId: context.correlationId,
  };
}
function required(value: NetworkCommandResult | null) {
  if (!value)
    throw new MeshNetworkExchangeError(
      409,
      "MESH_EXCHANGE_VERSION_CONFLICT",
      "The command did not produce a result; refresh and retry with the current version",
    );
  return value;
}

function meshContext(context: VerifiedRequestContext) {
  if (context.planeKey !== "mesh")
    throw new MeshNetworkExchangeError(
      400,
      "MESH_CONTEXT_REQUIRED",
      "MESH context is required",
    );
}
function databaseError(cause: unknown) {
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? String(cause.code)
      : "";
  const errors: Record<string, [number, string, string]> = {
    "42501": [
      403,
      "FORBIDDEN",
      "The current participant cannot perform this command",
    ],
    P0002: [
      404,
      "MESH_EXCHANGE_NOT_FOUND",
      "The requested resource was not found",
    ],
    "40001": [
      409,
      "MESH_EXCHANGE_VERSION_CONFLICT",
      "The version is stale; refresh and retry",
    ],
    "55000": [
      409,
      "MESH_EXCHANGE_STATE_CONFLICT",
      "The current state does not permit this command",
    ],
    "23505": [
      409,
      "MESH_EXCHANGE_IDEMPOTENCY_CONFLICT",
      "The command conflicts with existing evidence",
    ],
    "23503": [
      409,
      "MESH_EXCHANGE_REFERENCE_CONFLICT",
      "A referenced participant or resource is unavailable",
    ],
    "23514": [
      400,
      "MESH_EXCHANGE_INVALID",
      "The command violates the input constraints",
    ],
    "22007": [400, "MESH_EXCHANGE_INVALID", "A date or timestamp is invalid"],
    "22008": [
      400,
      "MESH_EXCHANGE_INVALID",
      "A date or timestamp is out of range",
    ],
    "22P02": [
      400,
      "MESH_EXCHANGE_INVALID",
      "A command value has an invalid format",
    ],
  };
  const mapped = errors[code];
  return mapped ? new MeshNetworkExchangeError(...mapped) : cause;
}
