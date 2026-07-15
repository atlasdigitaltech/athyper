/**
 * Entity-scoped registry for record lifecycle commands.
 *
 * This is deliberately separate from entity-op.registry.ts: lifecycle commands
 * mutate an existing record, while entity operations model source-document
 * conversions and therefore require a conversion workspace contract.
 */

import type { Kysely } from "kysely";
import {
  preparePurchaseInvoiceSubmit as preparePurchaseInvoiceSubmitBusiness,
  PurchaseInvoiceSubmitPreparationError,
} from "../../business/p2p/purchase_invoice/invoice-submit.handler.js";
import { entityHandlerRegistryFamily } from "../mutation/handler-registry-family.js";

export type LifecycleCommandKey = `${string}::${string}`;

export interface LifecyclePayloadPolicy {
  mode: "allowlist";
  allowedFields: readonly string[];
  requiredFields: readonly string[];
  rejectUnknownFields: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface LifecycleCommandPrepareContext {
  db: AnyDb;
  tenantId: string;
  recordId: string;
  principalId: string;
  entityCode: string;
  operationCode: string;
  record: Readonly<Record<string, unknown>>;
  payload: Readonly<Record<string, unknown>>;
}

export interface LifecycleCommandPreparation {
  recordPatch?: Readonly<Record<string, unknown>>;
  operationPayload?: Readonly<Record<string, unknown>>;
}

export type LifecycleCommandPrepare = (
  context: LifecycleCommandPrepareContext,
) => Promise<LifecycleCommandPreparation | void> | LifecycleCommandPreparation | void;

export class LifecycleCommandPreparationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LifecycleCommandPreparationError";
  }
}

export interface LifecycleCommandRegistration {
  entityCode: string;
  operationCode: string;
  allowedFlowCodes?: readonly string[];
  prepare?: LifecycleCommandPrepare;
  transitionOwner: "lifecycle_orchestrator";
  payloadPolicy: LifecyclePayloadPolicy;
}

export type LifecycleCommandResolutionErrorCode =
  | "LIFECYCLE_COMMAND_NOT_REGISTERED"
  | "LIFECYCLE_FLOW_ENTITY_MISMATCH";

export class LifecycleCommandResolutionError extends Error {
  constructor(
    readonly code: LifecycleCommandResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LifecycleCommandResolutionError";
  }
}

export function lifecycleCommandKey(
  entityCode: string,
  operationCode: string,
): LifecycleCommandKey {
  return `${normalizeCode(entityCode)}::${normalizeCode(operationCode)}`;
}

export class LifecycleCommandRegistry {
  private readonly registrations = new Map<LifecycleCommandKey, LifecycleCommandRegistration>();

  constructor(registrations: readonly LifecycleCommandRegistration[] = []) {
    for (const registration of registrations) this.register(registration);
  }

  register(registration: LifecycleCommandRegistration): void {
    const normalized = normalizeRegistration(registration);
    const key = lifecycleCommandKey(normalized.entityCode, normalized.operationCode);
    if (this.registrations.has(key)) {
      throw new Error(`Duplicate lifecycle command registration: ${key}`);
    }
    this.registrations.set(key, Object.freeze(normalized));
  }

  resolve(
    entityCode: string,
    operationCode: string,
    flowCode?: string,
  ): LifecycleCommandRegistration {
    const key = lifecycleCommandKey(entityCode, operationCode);
    const registration = this.registrations.get(key);
    if (!registration) {
      throw new LifecycleCommandResolutionError(
        "LIFECYCLE_COMMAND_NOT_REGISTERED",
        `No lifecycle command is registered for '${key}'.`,
      );
    }

    if (flowCode !== undefined) {
      const normalizedFlowCode = normalizeFlowCode(flowCode);
      if (!registration.allowedFlowCodes?.includes(normalizedFlowCode)) {
        throw new LifecycleCommandResolutionError(
          "LIFECYCLE_FLOW_ENTITY_MISMATCH",
          `Lifecycle flow '${normalizedFlowCode}' is not allowed for '${key}'.`,
        );
      }
    }
    return registration;
  }

  list(): readonly LifecycleCommandRegistration[] {
    return [...this.registrations.values()];
  }
}

const REMARKS_PAYLOAD_POLICY: LifecyclePayloadPolicy = Object.freeze({
  mode: "allowlist",
  allowedFields: Object.freeze([
    "remarks", "notes", "reason", "reversal_reason", "idempotency_key",
    "expected_row_version", "confirmed", "confirmation",
  ]),
  requiredFields: Object.freeze([]),
  rejectUnknownFields: true,
});

const POST_PAYLOAD_POLICY: LifecyclePayloadPolicy = Object.freeze({
  mode: "allowlist",
  allowedFields: Object.freeze([
    "remarks", "notes", "reason", "posting_date", "idempotency_key",
    "expected_row_version", "confirmed", "confirmation",
  ]),
  requiredFields: Object.freeze([]),
  rejectUnknownFields: true,
});

const INITIAL_REGISTRATIONS: readonly LifecycleCommandRegistration[] = [
  {
    entityCode: "purchase_requisition",
    operationCode: "submit",
    allowedFlowCodes: ["submit_for_approval"],
    transitionOwner: "lifecycle_orchestrator",
    payloadPolicy: REMARKS_PAYLOAD_POLICY,
  },
  {
    entityCode: "receipt",
    operationCode: "submit",
    allowedFlowCodes: ["submit_for_approval"],
    transitionOwner: "lifecycle_orchestrator",
    payloadPolicy: REMARKS_PAYLOAD_POLICY,
  },
  {
    entityCode: "service_sheet",
    operationCode: "submit",
    allowedFlowCodes: ["submit_for_approval"],
    transitionOwner: "lifecycle_orchestrator",
    payloadPolicy: REMARKS_PAYLOAD_POLICY,
  },
  {
    entityCode: "purchase_invoice",
    operationCode: "submit",
    allowedFlowCodes: ["submit_for_approval"],
    prepare: preparePurchaseInvoiceSubmit,
    transitionOwner: "lifecycle_orchestrator",
    payloadPolicy: REMARKS_PAYLOAD_POLICY,
  },
  {
    entityCode: "purchase_invoice",
    operationCode: "post",
    allowedFlowCodes: ["post_invoice"],
    transitionOwner: "lifecycle_orchestrator",
    payloadPolicy: POST_PAYLOAD_POLICY,
  },
  {
    entityCode: "purchase_invoice",
    operationCode: "reverse",
    allowedFlowCodes: ["reverse_invoice"],
    transitionOwner: "lifecycle_orchestrator",
    payloadPolicy: REMARKS_PAYLOAD_POLICY,
  },
];

const LIFECYCLE_COMMAND_FLOW_CODES = new Set([
  "submit_for_approval",
  "post_invoice",
  "reverse_invoice",
]);

const lifecycleCommandRegistry = new LifecycleCommandRegistry(INITIAL_REGISTRATIONS);
for (const registration of INITIAL_REGISTRATIONS) {
  entityHandlerRegistryFamily.register(
    "lifecycle_command",
    lifecycleCommandKey(registration.entityCode, registration.operationCode),
    registration,
  );
}

export function registerLifecycleCommand(registration: LifecycleCommandRegistration): void {
  lifecycleCommandRegistry.register(registration);
  entityHandlerRegistryFamily.register(
    "lifecycle_command",
    lifecycleCommandKey(registration.entityCode, registration.operationCode),
    registration,
  );
}

export function resolveLifecycleCommand(
  entityCode: string,
  operationCode: string,
  flowCode?: string,
): LifecycleCommandRegistration {
  const key = lifecycleCommandKey(entityCode, operationCode);
  const registration = entityHandlerRegistryFamily.resolve<LifecycleCommandRegistration>("lifecycle_command", key);
  if (!registration) {
    throw new LifecycleCommandResolutionError(
      "LIFECYCLE_COMMAND_NOT_REGISTERED",
      `No lifecycle command is registered for '${key}'.`,
    );
  }
  if (flowCode !== undefined) {
    const normalizedFlowCode = normalizeFlowCode(flowCode);
    if (!registration.allowedFlowCodes?.includes(normalizedFlowCode)) {
      throw new LifecycleCommandResolutionError(
        "LIFECYCLE_FLOW_ENTITY_MISMATCH",
        `Lifecycle flow '${normalizedFlowCode}' is not allowed for '${key}'.`,
      );
    }
  }
  return registration;
}

/** Identifies metadata targets owned by this registry, independently of registration presence. */
export function isLifecycleCommandFlowCode(flowCode: string): boolean {
  return LIFECYCLE_COMMAND_FLOW_CODES.has(normalizeFlowCode(flowCode));
}

export function listLifecycleCommands(): readonly LifecycleCommandRegistration[] {
  return entityHandlerRegistryFamily.list("lifecycle_command")
    .map((key) => entityHandlerRegistryFamily.resolve<LifecycleCommandRegistration>("lifecycle_command", key)!)
    .filter(Boolean);
}

export function validateLifecycleCommandPayload(
  registration: LifecycleCommandRegistration,
  payload: Readonly<Record<string, unknown>>,
): void {
  const policy = registration.payloadPolicy;
  const missing = policy.requiredFields.filter((field) => payload[field] === undefined);
  if (missing.length > 0) {
    throw new LifecycleCommandPreparationError(
      "LIFECYCLE_PAYLOAD_REQUIRED",
      `Lifecycle command '${lifecycleCommandKey(registration.entityCode, registration.operationCode)}' is missing required payload fields.`,
      { fields: missing },
    );
  }
  if (policy.rejectUnknownFields) {
    const allowed = new Set(policy.allowedFields);
    const unknown = Object.keys(payload).filter((field) => !allowed.has(field));
    if (unknown.length > 0) {
      throw new LifecycleCommandPreparationError(
        "LIFECYCLE_PAYLOAD_REJECTED",
        `Lifecycle command '${lifecycleCommandKey(registration.entityCode, registration.operationCode)}' received unsupported payload fields.`,
        { fields: unknown },
      );
    }
  }
}

async function preparePurchaseInvoiceSubmit(
  context: LifecycleCommandPrepareContext,
): Promise<LifecycleCommandPreparation> {
  try {
    const prepared = await preparePurchaseInvoiceSubmitBusiness(
      context.db,
      context.tenantId,
      context.recordId,
      context.principalId,
      { ...context.payload },
    );
    return {
      recordPatch: prepared.statusPatch,
      operationPayload: {
        ...context.payload,
        workflow_request_id: prepared.context.workflowRequestId,
      },
    };
  } catch (err) {
    if (!(err instanceof PurchaseInvoiceSubmitPreparationError)) throw err;
    throw new LifecycleCommandPreparationError(
      err.code,
      err.message,
      err.details,
    );
  }
}

function normalizeRegistration(
  registration: LifecycleCommandRegistration,
): LifecycleCommandRegistration {
  const entityCode = normalizeCode(registration.entityCode);
  const operationCode = normalizeCode(registration.operationCode);
  if (registration.transitionOwner !== "lifecycle_orchestrator") {
    throw new Error(`Lifecycle command '${entityCode}::${operationCode}' has an invalid transition owner.`);
  }
  if (registration.payloadPolicy.mode !== "allowlist") {
    throw new Error(`Lifecycle command '${entityCode}::${operationCode}' has an invalid payload policy.`);
  }
  const allowedFlowCodes = registration.allowedFlowCodes?.map(normalizeFlowCode);
  if (allowedFlowCodes && new Set(allowedFlowCodes).size !== allowedFlowCodes.length) {
    throw new Error(`Lifecycle command '${entityCode}::${operationCode}' has duplicate allowed flow codes.`);
  }
  return { ...registration, entityCode, operationCode, allowedFlowCodes };
}

function normalizeCode(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (!normalized) throw new Error("Lifecycle command entity and operation codes must not be empty.");
  return normalized;
}

function normalizeFlowCode(value: string): string {
  return normalizeCode(value.startsWith("flow:") ? value.slice("flow:".length) : value);
}
