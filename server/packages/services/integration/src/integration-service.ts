import { Ajv } from "ajv";
import { createHash } from "node:crypto";
import type {
  Delivery,
  EndpointDefinition,
  IntegrationRepository,
  InvocationPlan,
  JsonObject,
} from "@athyper/server-contract-integration";
export class IntegrationService {
  constructor(private readonly repository: IntegrationRepository) {}
  async resolveInvocationPlan(
    tenantId: string,
    endpointId: string,
  ): Promise<InvocationPlan> {
    const endpoint = await this.repository.getEndpoint(tenantId, endpointId);
    if (!endpoint || endpoint.status !== "active")
      throw permanent("INTEGRATION_ENDPOINT_UNAVAILABLE");
    const instance = await this.repository.getInstance(
      tenantId,
      endpoint.connectorInstanceId,
    );
    if (!instance || instance.status !== "active" || !instance.baseUrl)
      throw permanent("INTEGRATION_CONNECTOR_UNAVAILABLE");
    let base: URL, url: URL;
    try {
      base = new URL(instance.baseUrl);
      url = new URL(endpoint.path, base);
    } catch {
      throw permanent("INTEGRATION_ENDPOINT_URL_INVALID");
    }
    if (url.origin !== base.origin)
      throw permanent("INTEGRATION_ENDPOINT_ORIGIN_ESCAPE");
    return {
      version: endpoint.version,
      tenantId,
      endpointId: endpoint.id,
      connectorInstanceId: instance.id,
      kind: endpoint.kind,
      url: url.toString(),
      method: endpoint.method,
      requestContentType: endpoint.requestContentType,
      timeoutMs: endpoint.timeoutMs,
      headers: endpoint.headers,
      ...(endpoint.requestSchema
        ? { requestSchema: endpoint.requestSchema }
        : {}),
      maxPayloadBytes: endpoint.maxPayloadBytes,
      retryPolicy: endpoint.retryPolicy,
      ...(instance.credentialReference
        ? { credentialReference: instance.credentialReference }
        : {}),
      credentialRevision: instance.credentialRevision,
      audience: url.origin,
    };
  }
  async enqueue(input: {
    tenantId: string;
    endpointId: string;
    payload: JsonObject;
    semanticKey: string;
    actorPrincipalId: string;
  }): Promise<Delivery> {
    const plan = await this.resolveInvocationPlan(
        input.tenantId,
        input.endpointId,
      ),
      encoded = canonicalJson(input.payload);
    if (Buffer.byteLength(encoded) > plan.maxPayloadBytes)
      throw permanent("INTEGRATION_PAYLOAD_TOO_LARGE");
    validateSchema(input.payload, plan.requestSchema);
    return this.repository.createDelivery(
      {
        tenantId: input.tenantId,
        endpointId: input.endpointId,
        plan,
        payload: input.payload,
        payloadHash: sha256(encoded),
        idempotencyKey: sha256(
          `${input.tenantId}\0${input.endpointId}\0${plan.version}\0${input.semanticKey}`,
        ),
      },
      input.actorPrincipalId,
    );
  }
  async planTest(
    tenantId: string,
    endpointId: string,
  ): Promise<InvocationPlan> {
    const plan = await this.resolveInvocationPlan(tenantId, endpointId);
    if (plan.kind !== "health" && plan.method !== "GET")
      throw permanent("INTEGRATION_TEST_OPERATION_NOT_ALLOWED");
    return plan;
  }
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(",")}}`;
}
export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
const schemaValidator = new Ajv({
  strict: false,
  validateFormats: false,
  ownProperties: true,
});
function validateSchema(
  payload: JsonObject,
  schema: JsonObject | undefined,
): void {
  if (!schema) return;
  let validate;
  try {
    validate = schemaValidator.compile(schema);
    // Database JSON is a fresh object on each read; do not retain every schema.
    schemaValidator.removeSchema(schema);
  } catch {
    throw permanent("INTEGRATION_ENDPOINT_SCHEMA_INVALID");
  }
  if (!validate(payload)) throw permanent("INTEGRATION_PAYLOAD_SCHEMA_INVALID");
}
function permanent(code: string): Error {
  const statuses: Record<string, number> = {
    INTEGRATION_ENDPOINT_UNAVAILABLE: 409,
    INTEGRATION_CONNECTOR_UNAVAILABLE: 409,
    INTEGRATION_ENDPOINT_ORIGIN_ESCAPE: 422,
    INTEGRATION_ENDPOINT_URL_INVALID: 422,
    INTEGRATION_ENDPOINT_SCHEMA_INVALID: 422,
    INTEGRATION_PAYLOAD_TOO_LARGE: 413,
    INTEGRATION_PAYLOAD_SCHEMA_INVALID: 422,
    INTEGRATION_TEST_OPERATION_NOT_ALLOWED: 422,
  };
  return Object.assign(new Error(code), {
    code,
    status: statuses[code] ?? 500,
    retryable: false,
  });
}
export function retryDelay(
  endpoint: EndpointDefinition,
  attempt: number,
): number {
  return Math.min(
    endpoint.retryPolicy.maxDelayMs,
    Math.round(
      endpoint.retryPolicy.initialDelayMs *
        Math.pow(endpoint.retryPolicy.multiplier, Math.max(0, attempt - 1)),
    ),
  );
}
