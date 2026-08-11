export type JsonObject = Readonly<Record<string, unknown>>;
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type FailureDisposition = "transient" | "permanent";

export interface ConnectorType { readonly id:string;readonly code:string;readonly name:string;readonly categoryCode:string;readonly configSchema:JsonObject;readonly authTypes:readonly string[];readonly capabilities:readonly string[];readonly healthCheckConfig:JsonObject;readonly status:"active"|"deprecated"; }
export interface ConnectorInstance { readonly id:string;readonly tenantId:string;readonly connectorTypeId:string;readonly code:string;readonly name:string;readonly baseUrl?:string;readonly credentialReference?:string;readonly credentialRevision:number;readonly config:JsonObject;readonly status:"draft"|"active"|"suspended"|"retired"; }
export interface RetryPolicy { readonly maxAttempts:number;readonly initialDelayMs:number;readonly maxDelayMs:number;readonly multiplier:number;readonly retryStatuses:readonly number[]; }
export interface EndpointDefinition { readonly id:string;readonly tenantId:string;readonly connectorInstanceId:string;readonly code:string;readonly name:string;readonly kind:string;readonly path:string;readonly method:HttpMethod;readonly requestContentType:string;readonly timeoutMs:number;readonly headers:Readonly<Record<string,string>>;readonly requestSchema?:JsonObject;readonly maxPayloadBytes:number;readonly retryPolicy:RetryPolicy;readonly version:number;readonly status:"draft"|"active"|"suspended"|"retired"; }
export interface InvocationPlan { readonly version:number;readonly tenantId:string;readonly endpointId:string;readonly connectorInstanceId:string;readonly kind:string;readonly url:string;readonly method:HttpMethod;readonly requestContentType:string;readonly timeoutMs:number;readonly headers:Readonly<Record<string,string>>;readonly requestSchema?:JsonObject;readonly maxPayloadBytes:number;readonly retryPolicy:RetryPolicy;readonly credentialReference?:string;readonly credentialRevision:number;readonly audience:string; }
export interface Delivery { readonly id:string;readonly tenantId:string;readonly endpointId:string;readonly plan:InvocationPlan;readonly payload:JsonObject;readonly payloadHash:string;readonly idempotencyKey:string;readonly status:"pending"|"processing"|"delivered"|"failed"|"dead_letter";readonly attemptCount:number;readonly nextAttemptAt?:string; }
export interface RedactedConnectorError { readonly classification:"provider"|"transport"|"validation"|"security";readonly code:string;readonly fields?:Readonly<Record<string,string|number|boolean|null>>;readonly purgeAfter:string; }
export interface DeliveryAttemptEvidence { readonly deliveryId:string;readonly tenantId:string;readonly attempt:number;readonly startedAt:string;readonly completedAt:string;readonly requestUrl:string;readonly requestMethod:HttpMethod;readonly requestHeaders:Readonly<Record<string,string>>;readonly requestBodyHash:string;readonly responseStatus?:number;readonly responseHeaders:Readonly<Record<string,string>>;readonly responseBodyHash?:string;readonly redactedError?:RedactedConnectorError;readonly durationMs:number;readonly disposition:FailureDisposition;readonly errorCode?:string; }
export interface DeliveryFailure { readonly disposition:FailureDisposition;readonly code:string;readonly message:string;readonly responseStatus?:number; }
export interface IntegrationDlqReplayReceipt { readonly kind:"prepared"|"replayed";readonly tenantId:string;readonly deliveryId:string;readonly dlqId:string;readonly replayedAt:string;readonly replayedBy:string;readonly jobId:string;readonly maxAttempts:number; }
export interface ConnectorCatalog { listTypes(categoryCode?:string):Promise<readonly ConnectorType[]>;getType(id:string):Promise<ConnectorType|undefined>; }
export interface IntegrationRepository extends ConnectorCatalog { getInstance(tenantId:string,id:string):Promise<ConnectorInstance|undefined>;getEndpoint(tenantId:string,id:string):Promise<EndpointDefinition|undefined>;createDelivery(input:Omit<Delivery,"id"|"status"|"attemptCount">,actorPrincipalId:string):Promise<Delivery>;getDelivery(tenantId:string,id:string):Promise<Delivery|undefined>;beginAttempt(tenantId:string,deliveryId:string):Promise<Delivery>;appendAttempt(evidence:DeliveryAttemptEvidence):Promise<void>;markDelivered(tenantId:string,id:string):Promise<void>;scheduleRetry(tenantId:string,id:string,nextAttemptAt:string,failure:DeliveryFailure):Promise<void>;moveToDlq(tenantId:string,id:string,failure:DeliveryFailure):Promise<void>;prepareDlqReplay(input:{readonly tenantId:string;readonly deliveryId:string;readonly principalId:string;readonly requestId:string;readonly correlationId?:string}):Promise<IntegrationDlqReplayReceipt>;admitInbound(input:InboundAdmission):Promise<{readonly id:string;readonly duplicate:boolean}>; }
export interface SecretResolver { resolve(reference:string):Promise<{readonly bytes:Uint8Array;readonly version:string}>; }
export interface TokenCache { get(key:string):Promise<string|undefined>;set(key:string,value:string,ttlSeconds:number):Promise<void>; }
export interface ConnectorResponse { readonly status:number;readonly headers:Readonly<Record<string,string>>;readonly body:Uint8Array; }
export interface ConnectorTransport { invoke(plan:InvocationPlan,payload:Uint8Array,credential:Uint8Array|undefined,signal?:AbortSignal):Promise<ConnectorResponse>;probe(plan:InvocationPlan,credential:Uint8Array|undefined,signal?:AbortSignal):Promise<ConnectorResponse>; }
export interface InboundAdmission { readonly tenantId:string;readonly subscriptionId:string;readonly deliveryKey:string;readonly timestamp:string;readonly bodyHash:string;readonly rawBody:Uint8Array;readonly headers:Readonly<Record<string,string>>; }
export interface InboundWebhookPolicy { readonly tenantId:string;readonly subscriptionId:string;readonly signingSecretReference:string;readonly signatureHeader:string;readonly timestampHeader:string;readonly toleranceSeconds:number;readonly maxBodyBytes:number;readonly algorithm:"hmac-sha256"; }
export interface InboundWebhookPolicyResolver { resolve(subscriptionId:string):Promise<InboundWebhookPolicy|undefined>; }
export type ProvisioningPlane = "studio"|"neon"|"mesh"|"trustiam";
export interface AuthenticatedServiceActor { readonly serviceId:string;readonly audience:string;readonly subject:string;readonly authenticatedAt:string; }
export interface ProvisioningCommandEnvelope<Body extends JsonObject=JsonObject> { readonly schemaVersion:1;readonly commandId:string;readonly commandCode:string;readonly idempotencyKey:string;readonly requestFingerprint:string;readonly correlationId:string;readonly causationId?:string;readonly caseId:string;readonly targetPlane:ProvisioningPlane;readonly targetTenantId:string;readonly desiredVersion:number;readonly desiredHash:string;readonly actor:AuthenticatedServiceActor;readonly body:Body; }
export interface ProvisioningCommandReceipt { readonly commandId:string;readonly executionId:string;readonly duplicate:boolean;readonly status:"applied"|"rejected";readonly resourceId?:string;readonly appliedVersion?:number;readonly appliedHash?:string;readonly outboxEventId?:string;readonly errorCode?:string; }
export interface ProvisioningCommandTransport { execute(command:ProvisioningCommandEnvelope):Promise<ProvisioningCommandReceipt>; }

/** Result produced by a plane-local provisioner before evidence is committed. */
export interface ProvisioningMutationResult {
  readonly status: "applied" | "rejected";
  readonly resourceId?: string;
  readonly errorCode?: string;
  readonly eventCode: string;
  readonly eventPayload: JsonObject;
}

/**
 * Target-plane transaction boundary. Implementations must atomically:
 * 1. reserve or replay event.command_execution,
 * 2. apply local state,
 * 3. persist the command result, and
 * 4. append event.outbox.
 * A reused idempotency key with another fingerprint must return `conflict`.
 */
export interface ProvisioningCommandExecutionStore<Transaction = unknown> {
  executeAtomically(
    command: ProvisioningCommandEnvelope,
    apply: (transaction: Transaction) => Promise<ProvisioningMutationResult>,
  ): Promise<
    | { readonly kind: "committed"; readonly receipt: ProvisioningCommandReceipt }
    | { readonly kind: "replayed"; readonly receipt: ProvisioningCommandReceipt }
    | { readonly kind: "conflict" }
  >;
}

/** Authenticates service credentials and verifies subject, audience and target-plane binding. */
export interface ProvisioningCommandAuthenticator {
  authenticate(command: ProvisioningCommandEnvelope): Promise<
    | { readonly allowed: true }
    | { readonly allowed: false; readonly errorCode: "PROVISIONING_UNAUTHENTICATED" | "PROVISIONING_AUDIENCE_MISMATCH" | "PROVISIONING_PLANE_MISMATCH" }
  >;
}
