import { createHash, randomUUID } from "node:crypto";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { fingerprintCommand, parseIdempotencyKey, type OutboxWriter } from "@athyper/server-contract-events";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { assertIamPlane } from "./iam-contracts.js";

export type OrganizationStatus = "draft" | "provisioning" | "active" | "suspended" | "retiring" | "retired";
export type OrganizationProviderStatus = "draft" | "provisioning" | "active" | "suspended" | "failed" | "retired";
export type ApplicationProjectionStatus = "draft" | "pending" | "provisioning" | "active" | "suspended" | "failed" | "retiring" | "retired";
export type ProjectionReconciliationStatus = "pending" | "in_sync" | "drifted" | "failed";
export type ProjectionScopeKind = "tenant" | "workspace" | "module" | "legal_entity" | "company_code" | "operating_organization" | "network_account";
export type ProjectionCeilingMode = "exact" | "subtree" | "member_companies";

export interface TrustIamOrganization { readonly id: string; readonly tenantId: string; readonly canonicalPartyId: string; readonly realmKey: string; readonly externalOrganizationId: string; readonly alias?: string; readonly displayName: string; readonly status: OrganizationStatus; readonly metadata: Readonly<Record<string, unknown>>; readonly createdAt: string; readonly updatedAt?: string }
export interface TrustIamOrganizationProvider { readonly id: string; readonly tenantId: string; readonly organizationId: string; readonly protocol: "native" | "oidc" | "saml"; readonly providerCode: string; readonly externalProviderId?: string; readonly approvedDomains: readonly string[]; readonly routingContract: Readonly<Record<string, unknown>>; readonly status: OrganizationProviderStatus }
export interface TrustIamApplicationProjection { readonly id: string; readonly tenantId: string; readonly organizationId: string; readonly targetPlane: PlaneKey; readonly targetTenantId: string; readonly desiredVersion: number; readonly desiredHash: string; readonly status: ApplicationProjectionStatus; readonly reconciliationStatus: ProjectionReconciliationStatus; readonly metadata: Readonly<Record<string, unknown>>; readonly effectiveFrom?: string; readonly lastReconciledAt?: string; readonly lastErrorCode?: string }
export interface TrustIamProjectionScope { readonly id: string; readonly tenantId: string; readonly projectionId: string; readonly scopeKind: ProjectionScopeKind; readonly targetId: string; readonly ceilingMode: ProjectionCeilingMode; readonly networkRoleCeiling?: "buyer" | "supplier" | "both"; readonly desiredVersion: number; readonly metadata: Readonly<Record<string, unknown>>; readonly status: "active" | "inactive" }
export interface TrustIamProjectionCommand {
  readonly schema: "athyper.trustiam.projection-command/1";
  readonly commandCode: "trustiam.projection.apply";
  readonly authorityPlane: "studio";
  readonly authorityTenantId: string;
  readonly organizationId: string;
  readonly projectionId: string;
  readonly idempotencyKey: string;
  readonly targetPlane: PlaneKey;
  readonly targetTenantId: string;
  readonly desiredVersion: number;
  readonly desiredHash: string;
  readonly scopes: readonly Readonly<Record<string, unknown>>[];
}
export interface AuthenticatedProjectionCommandTransport {
  publish(command: TrustIamProjectionCommand): Promise<void>;
}

export type TrustIamWriteResult<T> = { readonly kind: "created" | "updated"; readonly value: T } | { readonly kind: "replayed"; readonly value: T } | { readonly kind: "conflict"; readonly reason: "idempotency_reused" | "same_version_different_hash" | "stale_version" | "concurrent_update" };
export interface TrustIamAuthorityRepository<Transaction> {
  createOrganization(input: TrustIamOrganization & CommandMarker, transaction: Transaction): Promise<TrustIamWriteResult<TrustIamOrganization>>;
  updateOrganization(input: { readonly tenantId: string; readonly organizationId: string; readonly displayName: string; readonly alias?: string; readonly metadata: Readonly<Record<string, unknown>>; readonly expectedUpdatedAt?: string } & CommandMarker, transaction: Transaction): Promise<TrustIamWriteResult<TrustIamOrganization>>;
  transitionOrganization(input: { readonly tenantId: string; readonly organizationId: string; readonly from: OrganizationStatus; readonly to: OrganizationStatus; readonly actorId: string; readonly changedAt: string } & CommandMarker, transaction: Transaction): Promise<TrustIamWriteResult<TrustIamOrganization>>;
  linkProvider(input: TrustIamOrganizationProvider & CommandMarker, transaction: Transaction): Promise<TrustIamWriteResult<TrustIamOrganizationProvider>>;
  putProjection(input: TrustIamApplicationProjection & CommandMarker, transaction: Transaction): Promise<TrustIamWriteResult<TrustIamApplicationProjection>>;
  recordProjectionObservation(input: { readonly tenantId:string; readonly projectionId:string; readonly desiredVersion:number; readonly desiredHash:string; readonly reconciliationStatus:ProjectionReconciliationStatus; readonly observedAt:string; readonly errorCode?:string } & CommandMarker, transaction:Transaction):Promise<TrustIamWriteResult<TrustIamApplicationProjection>>;
  replaceScopes(input: { readonly tenantId: string; readonly projectionId: string; readonly desiredVersion: number; readonly scopes: readonly TrustIamProjectionScope[] } & CommandMarker, transaction: Transaction): Promise<TrustIamWriteResult<readonly TrustIamProjectionScope[]>>;
}
export interface TrustIamTransactionCoordinator<Transaction> { run<Result>(actor: { readonly tenantId: string; readonly principalId: string }, work: (transaction: Transaction) => Promise<Result>): Promise<Result> }
interface CommandMarker { readonly idempotencyKeyHash: string; readonly commandFingerprint: string }

export interface TrustIamAuthorityOptions<Transaction> { readonly repository: TrustIamAuthorityRepository<Transaction>; readonly transactions: TrustIamTransactionCoordinator<Transaction>; readonly authorizer: Authorizer; readonly audit: AuditRecorder<Transaction>; readonly outbox: OutboxWriter<Transaction>; readonly now?: () => Date; readonly createId?: () => string }

export class OrganizationService<Transaction> {
  private readonly now: () => Date; private readonly createId: () => string;
  constructor(private readonly options: TrustIamAuthorityOptions<Transaction>) { this.now = options.now ?? (() => new Date()); this.createId = options.createId ?? randomUUID; }
  async create(command: { readonly context: VerifiedRequestContext; readonly idempotencyKey?: string; readonly canonicalPartyId: string; readonly realmKey: string; readonly externalOrganizationId: string; readonly displayName: string; readonly alias?: string; readonly metadata?: Readonly<Record<string, unknown>> }): Promise<TrustIamWriteResult<TrustIamOrganization>> {
    await authorize(this.options.authorizer, command.context, "iam.organization.create"); const marker = commandMarker(command.idempotencyKey, { canonicalPartyId: command.canonicalPartyId, realmKey: normalizeCode(command.realmKey), externalOrganizationId: required(command.externalOrganizationId), displayName: required(command.displayName), alias: command.alias?.trim() || null, metadata: boundedObject(command.metadata ?? {}) });
    const organization: TrustIamOrganization = { id: this.createId(), tenantId: command.context.tenantId, canonicalPartyId: command.canonicalPartyId, realmKey: normalizeCode(command.realmKey), externalOrganizationId: required(command.externalOrganizationId), ...(command.alias?.trim() ? { alias: command.alias.trim() } : {}), displayName: required(command.displayName), status: "draft", metadata: boundedObject(command.metadata ?? {}), createdAt: this.now().toISOString() };
    return this.write(command.context, "created", marker, (transaction) => this.options.repository.createOrganization({ ...organization, ...marker }, transaction));
  }
  async update(command: { readonly context: VerifiedRequestContext; readonly idempotencyKey?: string; readonly organizationId: string; readonly displayName: string; readonly alias?: string; readonly metadata?: Readonly<Record<string, unknown>>; readonly expectedUpdatedAt?: string }): Promise<TrustIamWriteResult<TrustIamOrganization>> {
    await authorize(this.options.authorizer, command.context, "iam.organization.update"); const marker = commandMarker(command.idempotencyKey, { organizationId: command.organizationId, displayName: required(command.displayName), alias: command.alias?.trim() || null, metadata: boundedObject(command.metadata ?? {}), expectedUpdatedAt: command.expectedUpdatedAt ?? null });
    return this.write(command.context, "updated", marker, (transaction) => this.options.repository.updateOrganization({ tenantId: command.context.tenantId, organizationId: command.organizationId, displayName: required(command.displayName), ...(command.alias?.trim() ? { alias: command.alias.trim() } : {}), metadata: boundedObject(command.metadata ?? {}), ...(command.expectedUpdatedAt ? { expectedUpdatedAt: command.expectedUpdatedAt } : {}), ...marker }, transaction));
  }
  async transition(command: { readonly context: VerifiedRequestContext; readonly idempotencyKey?: string; readonly organizationId: string; readonly from: OrganizationStatus; readonly to: OrganizationStatus }): Promise<TrustIamWriteResult<TrustIamOrganization>> {
    await authorize(this.options.authorizer, command.context, "iam.organization.transition"); if (!ORGANIZATION_TRANSITIONS[command.from].includes(command.to)) throw new TypeError(`Invalid organization transition: ${command.from} -> ${command.to}`); const marker = commandMarker(command.idempotencyKey, { organizationId: command.organizationId, from: command.from, to: command.to });
    return this.write(command.context, `status.${command.to}`, marker, (transaction) => this.options.repository.transitionOrganization({ tenantId: command.context.tenantId, organizationId: command.organizationId, from: command.from, to: command.to, actorId: command.context.principalId, changedAt: this.now().toISOString(), ...marker }, transaction));
  }
  async linkProvider(command: { readonly context: VerifiedRequestContext; readonly idempotencyKey?: string; readonly organizationId: string; readonly protocol: TrustIamOrganizationProvider["protocol"]; readonly providerCode: string; readonly externalProviderId?: string; readonly approvedDomains?: readonly string[]; readonly routingContract?: Readonly<Record<string, unknown>> }): Promise<TrustIamWriteResult<TrustIamOrganizationProvider>> {
    await authorize(this.options.authorizer, command.context, "iam.organization.provider.link"); const providerCode = normalizeCode(command.providerCode), domains = normalizeDomains(command.approvedDomains ?? []), routingContract = boundedObject(command.routingContract ?? {}); const marker = commandMarker(command.idempotencyKey, { organizationId: command.organizationId, protocol: command.protocol, providerCode, externalProviderId: command.externalProviderId ?? null, domains, routingContract });
    const provider: TrustIamOrganizationProvider = { id: this.createId(), tenantId: command.context.tenantId, organizationId: command.organizationId, protocol: command.protocol, providerCode, ...(command.externalProviderId ? { externalProviderId: command.externalProviderId } : {}), approvedDomains: domains, routingContract, status: "draft" };
    return this.write(command.context, "provider.linked", marker, (transaction) => this.options.repository.linkProvider({ ...provider, ...marker }, transaction));
  }
  private write(context: VerifiedRequestContext, action: string, marker: CommandMarker, operation: (transaction: Transaction) => Promise<TrustIamWriteResult<TrustIamOrganization | TrustIamOrganizationProvider>>): Promise<any> { return this.options.transactions.run({ tenantId: context.tenantId, principalId: context.principalId }, async (transaction) => { const result = await operation(transaction); if (result.kind === "created" || result.kind === "updated") await evidence(this.options, context, `iam.organization.${action}`, result.value.id, marker.idempotencyKeyHash, transaction); return result; }); }
}

export class OrganizationProjectionService<Transaction> {
  constructor(private readonly options: TrustIamAuthorityOptions<Transaction>, private readonly createId: () => string = randomUUID) {}
  async putDesired(command: { readonly context: VerifiedRequestContext; readonly idempotencyKey?: string; readonly organizationId: string; readonly targetPlane: PlaneKey; readonly targetTenantId: string; readonly desiredVersion: number; readonly desiredHash: string; readonly status?: ApplicationProjectionStatus; readonly effectiveFrom?: string; readonly metadata?: Readonly<Record<string, unknown>> }): Promise<TrustIamWriteResult<TrustIamApplicationProjection>> {
    await authorize(this.options.authorizer, command.context, "iam.projection.write"); assertIamPlane(command.targetPlane); positive(command.desiredVersion); hash(command.desiredHash); const metadata = boundedObject(command.metadata ?? {}); const status = command.status ?? "pending"; const effectiveFrom = command.effectiveFrom ? timestamp(command.effectiveFrom, "effectiveFrom") : undefined; if(status==="active"&&!effectiveFrom)throw new TypeError("Active projection requires effectiveFrom"); const marker = commandMarker(command.idempotencyKey, { organizationId: command.organizationId, targetPlane: command.targetPlane, targetTenantId: command.targetTenantId, desiredVersion: command.desiredVersion, desiredHash: command.desiredHash, status, effectiveFrom:effectiveFrom??null, metadata }); const projection: TrustIamApplicationProjection = { id: this.createId(), tenantId: command.context.tenantId, organizationId: command.organizationId, targetPlane: command.targetPlane, targetTenantId: command.targetTenantId, desiredVersion: command.desiredVersion, desiredHash: command.desiredHash, status, reconciliationStatus: "pending", metadata, ...(effectiveFrom?{effectiveFrom}:{}) };
    return this.options.transactions.run({ tenantId: command.context.tenantId, principalId: command.context.principalId }, async transaction => { const result = await this.options.repository.putProjection({ ...projection, ...marker }, transaction); if (result.kind === "created" || result.kind === "updated") await evidence(this.options, command.context, "iam.projection.desired", result.value.id, marker.idempotencyKeyHash, transaction); return result; });
  }
  async recordObservation(command:{readonly context:VerifiedRequestContext;readonly idempotencyKey?:string;readonly projectionId:string;readonly desiredVersion:number;readonly desiredHash:string;readonly reconciliationStatus:ProjectionReconciliationStatus;readonly errorCode?:string}):Promise<TrustIamWriteResult<TrustIamApplicationProjection>>{
    await authorize(this.options.authorizer,command.context,"iam.projection.reconcile");positive(command.desiredVersion);hash(command.desiredHash);if(command.reconciliationStatus==="failed"&&!command.errorCode?.trim())throw new TypeError("Failed projection reconciliation requires an error code");if(command.reconciliationStatus!=="failed"&&command.errorCode)throw new TypeError("Projection reconciliation error code is valid only for failed observations");const marker=commandMarker(command.idempotencyKey,{projectionId:command.projectionId,desiredVersion:command.desiredVersion,desiredHash:command.desiredHash,reconciliationStatus:command.reconciliationStatus,errorCode:command.errorCode?.trim()??null});
    return this.options.transactions.run({tenantId:command.context.tenantId,principalId:command.context.principalId},async transaction=>{const result=await this.options.repository.recordProjectionObservation({tenantId:command.context.tenantId,projectionId:command.projectionId,desiredVersion:command.desiredVersion,desiredHash:command.desiredHash,reconciliationStatus:command.reconciliationStatus,observedAt:(this.options.now??(()=>new Date()))().toISOString(),...(command.errorCode?{errorCode:required(command.errorCode)}:{}),...marker},transaction);if(result.kind==="updated")await evidence(this.options,command.context,"iam.projection.reconciled",result.value.id,marker.idempotencyKeyHash,transaction);return result;});
  }
}

export class ProjectionScopeService<Transaction> {
  constructor(private readonly options: TrustIamAuthorityOptions<Transaction>, private readonly createId: () => string = randomUUID, private readonly maxScopes = 256) {}
  async replace(command: { readonly context: VerifiedRequestContext; readonly idempotencyKey?: string; readonly projectionId: string; readonly desiredVersion: number; readonly scopes: readonly Omit<TrustIamProjectionScope, "id" | "tenantId" | "projectionId" | "desiredVersion" | "status">[] }): Promise<TrustIamWriteResult<readonly TrustIamProjectionScope[]>> {
    await authorize(this.options.authorizer, command.context, "iam.projection.scope.write"); positive(command.desiredVersion); if (!command.scopes.length || command.scopes.length > this.maxScopes) throw new TypeError(`Projection scopes must contain between 1 and ${this.maxScopes} entries`); const seen = new Set<string>(); const scopes = command.scopes.map(scope => { const coordinate = `${scope.scopeKind}:${scope.targetId}`; if (seen.has(coordinate)) throw new TypeError(`Duplicate projection scope ${coordinate}`); seen.add(coordinate); if (scope.scopeKind !== "network_account" && scope.networkRoleCeiling) throw new TypeError("Network role ceiling is valid only for network_account scopes"); return { ...scope, id: this.createId(), tenantId: command.context.tenantId, projectionId: command.projectionId, desiredVersion: command.desiredVersion, metadata: boundedObject(scope.metadata), status: "active" as const }; }); const marker = commandMarker(command.idempotencyKey, { projectionId: command.projectionId, desiredVersion: command.desiredVersion, scopes: scopes.map(({ id: _id, ...scope }) => scope) });
    return this.options.transactions.run({ tenantId: command.context.tenantId, principalId: command.context.principalId }, async transaction => { const result = await this.options.repository.replaceScopes({ tenantId: command.context.tenantId, projectionId: command.projectionId, desiredVersion: command.desiredVersion, scopes, ...marker }, transaction); if (result.kind === "created" || result.kind === "updated") await evidence(this.options, command.context, "iam.projection.scopes.replaced", command.projectionId, marker.idempotencyKeyHash, transaction); return result; });
  }
  compile(projection: TrustIamApplicationProjection, scopes: readonly TrustIamProjectionScope[]): TrustIamProjectionCommand {
    assertIamPlane(projection.targetPlane); positive(projection.desiredVersion); hash(projection.desiredHash);
    if (!scopes.length || scopes.length > this.maxScopes) throw new TypeError(`Projection scopes must contain between 1 and ${this.maxScopes} entries`);
    const seen = new Set<string>();
    for (const scope of scopes) {
      if (scope.tenantId !== projection.tenantId || scope.projectionId !== projection.id) throw new TypeError("Projection scope authority mismatch");
      if (scope.desiredVersion !== projection.desiredVersion) throw new TypeError("Projection scope desired version mismatch");
      if (scope.status !== "active") throw new TypeError("Inactive projection scopes cannot be compiled");
      const coordinate = `${scope.scopeKind}:${scope.targetId}`;
      if (seen.has(coordinate)) throw new TypeError(`Duplicate projection scope ${coordinate}`);
      seen.add(coordinate);
    }
    const ordered = [...scopes].sort((a,b) => `${a.scopeKind}:${a.targetId}`.localeCompare(`${b.scopeKind}:${b.targetId}`));
    return Object.freeze({ schema: "athyper.trustiam.projection-command/1", commandCode: "trustiam.projection.apply", authorityPlane: "studio", authorityTenantId: projection.tenantId, organizationId: projection.organizationId, projectionId: projection.id, idempotencyKey: `trustiam:${projection.id}:v${projection.desiredVersion}`, targetPlane: projection.targetPlane, targetTenantId: projection.targetTenantId, desiredVersion: projection.desiredVersion, desiredHash: projection.desiredHash, scopes: Object.freeze(ordered.map(({ scopeKind,targetId,ceilingMode,networkRoleCeiling,metadata }) => Object.freeze({ scopeKind,targetId,ceilingMode,...(networkRoleCeiling?{networkRoleCeiling}:{}),metadata }))) });
  }
  async publish(projection: TrustIamApplicationProjection, scopes: readonly TrustIamProjectionScope[], transport: AuthenticatedProjectionCommandTransport): Promise<TrustIamProjectionCommand> {
    const command = this.compile(projection, scopes);
    await transport.publish(command);
    return command;
  }
}

const ORGANIZATION_TRANSITIONS: Record<OrganizationStatus, readonly OrganizationStatus[]> = { draft:["provisioning","retired"],provisioning:["active","suspended","retiring"],active:["suspended","retiring"],suspended:["active","retiring"],retiring:["retired"],retired:[] };
async function authorize(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string) { const decision = await authorizer.authorize({ context, permissionCode }); if (!decision.allowed) throw new TrustIamAuthorityError("FORBIDDEN", permissionCode); }
async function evidence<Transaction>(options: TrustIamAuthorityOptions<Transaction>, context: VerifiedRequestContext, eventCode: string, entityId: string, eventKey: string, transaction: Transaction) { await options.outbox.append({ tenantId: context.tenantId, topic: "iam.authority", eventType: eventCode, eventKey, entityType: eventCode.includes("projection") ? "trustiam.application_projection" : "trustiam.organization", entityId, aggregateType: "trustiam.organization", aggregateId: entityId, actorId: context.principalId, correlationId: context.correlationId, payload: { id: entityId } }, transaction); await options.audit.record({ eventCode, action: "write", outcome: "success", actor: { kind:"user",principalId:context.principalId }, tenantId:context.tenantId, entityType:eventCode.includes("projection")?"trustiam.application_projection":"trustiam.organization", entityId, requestId:context.requestId, ...(context.correlationId?{correlationId:context.correlationId}:{}), metadata:{ commandFingerprint:eventKey } }, transaction); }
function commandMarker(key: string | undefined, value: unknown): CommandMarker { const parsed = parseIdempotencyKey(key); if (!parsed.ok) throw new TrustIamAuthorityError("IDEMPOTENCY_INVALID", parsed.reason); return { idempotencyKeyHash: digest(parsed.value), commandFingerprint: fingerprintCommand(value) }; }
function boundedObject(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> { if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError("TrustIAM metadata must be a bounded object");const encoded=JSON.stringify(value);if(encoded===undefined||Buffer.byteLength(encoded,"utf8")>32768)throw new TypeError("TrustIAM metadata must be a bounded object"); return value; }
function timestamp(value:string,name:string){const parsed=new Date(value);if(Number.isNaN(parsed.getTime()))throw new TypeError(`${name} must be an ISO timestamp`);return parsed.toISOString();}
function normalizeCode(value:string){const result=value.trim().normalize("NFKC").toLowerCase();if(!/^[a-z][a-z0-9_.-]{1,62}$/.test(result))throw new TypeError("Invalid TrustIAM code");return result;} function required(value:string){const result=value.trim();if(!result)throw new TypeError("Required TrustIAM value is empty");return result;} function normalizeDomains(values:readonly string[]){return Object.freeze([...new Set(values.map(v=>v.trim().toLowerCase()).filter(Boolean))].sort());} function positive(value:number){if(!Number.isSafeInteger(value)||value<1)throw new TypeError("Desired version must be positive");} function hash(value:string){if(!/^[0-9a-f]{64}$/.test(value))throw new TypeError("Desired hash must be lowercase SHA-256");} function digest(value:string){return createHash("sha256").update(value).digest("hex");}
export class TrustIamAuthorityError extends Error { constructor(readonly code:"FORBIDDEN"|"IDEMPOTENCY_INVALID",message:string){super(message);this.name="TrustIamAuthorityError";} }
