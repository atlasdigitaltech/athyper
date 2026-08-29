import { createHash } from "node:crypto";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneKey } from "@athyper/server-foundation/context";

export type IamOrganizationPurpose = "tenant_employer" | "supplier_portal" | "customer_portal";
export type IdentityRelationship = "employer" | "contact";
export type IdentityDesiredStatus = "invited" | "active" | "suspended" | "deprovisioned";
export type IdentitySagaFailureClass = "transient" | "permanent" | "stale";

export interface DesiredOrganizationProjection {
  readonly organizationId: string;
  readonly canonicalPartyId: string;
  readonly purpose: IamOrganizationPurpose;
  readonly realmKey: string;
  readonly externalOrganizationId: string;
  readonly displayName: string;
  readonly desiredVersion: number;
  readonly desiredHash: string;
}

export interface DesiredOrganizationMembership {
  readonly organizationId: string;
  readonly relationship: IdentityRelationship;
  /** Employment or BP-contact coordinate. It is correlation evidence, not a provider grant. */
  readonly sourceRef: string;
}

export interface LocalRoleAssignment {
  readonly roleCode: string;
  readonly scopeKind: string;
  readonly scopeTargetId: string;
}

export interface DesiredApplicationAccess {
  readonly plane: PlaneKey;
  readonly targetTenantId: string;
  readonly roles: readonly LocalRoleAssignment[];
}

export interface DesiredIdentityProjection {
  readonly identityId: string;
  readonly authorityTenantId: string;
  readonly personId: string;
  readonly identifier: string;
  readonly displayName: string;
  readonly realmKey: string;
  readonly desiredVersion: number;
  readonly desiredHash: string;
  readonly status: IdentityDesiredStatus;
  readonly membership: DesiredOrganizationMembership;
  readonly applications: readonly DesiredApplicationAccess[];
}

export interface IdentitySagaWork extends DesiredIdentityProjection {
  readonly attemptId: string;
  readonly attemptNo: number;
  readonly fencingToken: number;
  readonly claimTokenHash: string;
}

export interface IdentitySagaCoordinate {
  readonly attemptId: string;
  readonly identityId: string;
  readonly desiredVersion: number;
  readonly desiredHash: string;
  readonly fencingToken: number;
  readonly claimTokenHash: string;
}

export interface IdentitySagaRepository {
  claim(input: { readonly workerId: string; readonly claimTokenHash: string; readonly claimedAt: string; readonly leaseExpiresAt: string }): Promise<IdentitySagaWork | undefined>;
  current(work: IdentitySagaWork): Promise<boolean>;
  start(coordinate: IdentitySagaCoordinate, startedAt: string): Promise<boolean>;
  succeed(coordinate: IdentitySagaCoordinate, input: { readonly observedAt: string; readonly providerSubject?: string; readonly receipt: Readonly<Record<string, unknown>> }): Promise<boolean>;
  fail(coordinate: IdentitySagaCoordinate, input: { readonly failedAt: string; readonly classification: IdentitySagaFailureClass; readonly errorCode: string; readonly nextAttemptAt?: string; readonly deadLetter: boolean; readonly receipt: Readonly<Record<string, unknown>> }): Promise<boolean>;
  replay(input: { readonly authorityTenantId: string; readonly deadLetterAttemptId: string; readonly requestedBy: string; readonly approvedBy: string; readonly requestedAt: string }): Promise<boolean>;
}

export interface IdentityProviderAdapter {
  inviteOrCreate(input: { readonly realmKey: string; readonly identifier: string; readonly displayName: string; readonly invite: boolean; readonly idempotencyKey: string }): Promise<{ readonly providerSubject: string }>;
  ensureMembership(input: { readonly providerSubject: string; readonly externalOrganizationId: string; readonly relationship: IdentityRelationship; readonly idempotencyKey: string }): Promise<void>;
  ensureApplication(input: { readonly providerSubject: string; readonly plane: PlaneKey; readonly targetTenantId: string; readonly idempotencyKey: string }): Promise<void>;
  suspend(input: { readonly providerSubject: string; readonly idempotencyKey: string }): Promise<void>;
  deprovision(input: { readonly providerSubject: string; readonly idempotencyKey: string }): Promise<void>;
}

export interface PlaneLocalIdentityAuthority {
  /** Resolves only the locally persisted binding. Provider attributes are deliberately absent. */
  providerSubject(identityId: string): Promise<string | undefined>;
  converge(input: {
    readonly identityId: string;
    readonly personId: string;
    readonly identifier: string;
    readonly displayName: string;
    readonly providerSubject: string;
    readonly realmKey: string;
    readonly desiredVersion: number;
    readonly desiredHash: string;
    readonly membership: DesiredOrganizationMembership;
    readonly applications: readonly DesiredApplicationAccess[];
  }): Promise<void>;
  /** Revokes admission, bindings and assignments only; person, employment and BP stores are outside this port. */
  revokeAccess(input: { readonly identityId: string; readonly personId: string; readonly desiredVersion: number; readonly desiredHash: string; readonly applications: readonly DesiredApplicationAccess[]; readonly reason: "suspended" | "deprovisioned" }): Promise<void>;
}

export interface IdentitySagaAlerts {
  metric(labels: { readonly classification: IdentitySagaFailureClass; readonly outcome: "retry" | "dead_letter" }): void;
  deadLetter(input: { readonly authorityTenantId: string; readonly identityId: string; readonly attemptId: string; readonly errorCode: string }): Promise<void>;
}

export class IdentitySagaWorker {
  private readonly now: () => Date;
  private readonly maxAttempts: number;

  constructor(private readonly options: {
    readonly workerId: string;
    readonly repository: IdentitySagaRepository;
    readonly provider: IdentityProviderAdapter;
    readonly local: PlaneLocalIdentityAuthority;
    readonly organizations: { get(organizationId: string): Promise<DesiredOrganizationProjection | undefined> };
    readonly alerts: IdentitySagaAlerts;
    readonly now?: () => Date;
    readonly maxAttempts?: number;
    readonly leaseMs?: number;
  }) {
    this.now = options.now ?? (() => new Date());
    this.maxAttempts = options.maxAttempts ?? 5;
  }

  async runOne(claimToken: string): Promise<"idle" | "succeeded" | "retry" | "dead_letter" | "stale"> {
    const claimedAt = this.now();
    const claimTokenHash = sha256(claimToken);
    const work = await this.options.repository.claim({
      workerId: this.options.workerId,
      claimTokenHash,
      claimedAt: claimedAt.toISOString(),
      leaseExpiresAt: new Date(claimedAt.getTime() + (this.options.leaseMs ?? 60_000)).toISOString(),
    });
    if (!work) return "idle";
    const coordinate = coordinates(work);
    try {
      validateWork(work, claimTokenHash);
      if (!await this.options.repository.current(work)) throw coded("IDENTITY_DESIRED_STATE_STALE");
      if (!await this.options.repository.start(coordinate, this.now().toISOString())) throw coded("IDENTITY_ATTEMPT_FENCE_REJECTED");
      const organization = await this.options.organizations.get(work.membership.organizationId);
      validateRelationship(work, organization);

      let providerSubject = await this.options.local.providerSubject(work.identityId);
      if (work.status === "invited" || work.status === "active") {
        providerSubject ??= (await this.options.provider.inviteOrCreate({
          realmKey: work.realmKey,
          identifier: work.identifier,
          displayName: work.displayName,
          invite: work.status === "invited",
          idempotencyKey: providerKey(work, "identity"),
        })).providerSubject;
        await this.options.provider.ensureMembership({
          providerSubject,
          externalOrganizationId: organization!.externalOrganizationId,
          relationship: work.membership.relationship,
          idempotencyKey: providerKey(work, "membership", work.membership.organizationId),
        });
        for (const application of work.applications) {
          await this.options.provider.ensureApplication({ providerSubject, plane: application.plane, targetTenantId: application.targetTenantId, idempotencyKey: providerKey(work, "application", `${application.plane}:${application.targetTenantId}`) });
        }
        if (!await this.options.repository.current(work)) throw coded("IDENTITY_DESIRED_STATE_STALE");
        await this.options.local.converge({ identityId: work.identityId, personId: work.personId, identifier: work.identifier, displayName: work.displayName, providerSubject, realmKey: work.realmKey, desiredVersion: work.desiredVersion, desiredHash: work.desiredHash, membership: work.membership, applications: work.applications });
      } else {
        // Plane-local admission is closed first. Provider outage must not preserve business access.
        await this.options.local.revokeAccess({ identityId: work.identityId, personId: work.personId, desiredVersion: work.desiredVersion, desiredHash: work.desiredHash, applications: work.applications, reason: work.status });
        if (providerSubject) {
          if (work.status === "suspended") await this.options.provider.suspend({ providerSubject, idempotencyKey: providerKey(work, "suspend") });
          else await this.options.provider.deprovision({ providerSubject, idempotencyKey: providerKey(work, "deprovision") });
        }
      }
      if (!await this.options.repository.succeed(coordinate, { observedAt: this.now().toISOString(), ...(providerSubject ? { providerSubject } : {}), receipt: { desiredVersion: work.desiredVersion, desiredHash: work.desiredHash, status: work.status } })) throw coded("IDENTITY_ATTEMPT_FENCE_REJECTED");
      return "succeeded";
    } catch (error) {
      const classification = classifyIdentitySagaFailure(error);
      const deadLetter = classification !== "transient" || work.attemptNo >= this.maxAttempts;
      const nextAttemptAt = deadLetter ? undefined : new Date(this.now().getTime() + identityRetryDelay(work.attemptNo)).toISOString();
      const errorCode = safeErrorCode(error);
      const recorded = await this.options.repository.fail(coordinate, { failedAt: this.now().toISOString(), classification, errorCode, ...(nextAttemptAt ? { nextAttemptAt } : {}), deadLetter, receipt: { desiredVersion: work.desiredVersion, desiredHash: work.desiredHash, status: work.status } });
      if (!recorded) throw coded("IDENTITY_ATTEMPT_FENCE_REJECTED");
      this.options.alerts.metric({ classification, outcome: deadLetter ? "dead_letter" : "retry" });
      if (deadLetter) await this.options.alerts.deadLetter({ authorityTenantId: work.authorityTenantId, identityId: work.identityId, attemptId: work.attemptId, errorCode });
      return classification === "stale" ? "stale" : deadLetter ? "dead_letter" : "retry";
    }
  }
}

export class IdentityReplayService {
  constructor(private readonly repository: IdentitySagaRepository, private readonly authorizer: Authorizer, private readonly now: () => Date = () => new Date()) {}

  async request(input: { readonly context: VerifiedRequestContext; readonly deadLetterAttemptId: string; readonly approvedBy: string }): Promise<boolean> {
    const decision = await this.authorizer.authorize({ context: input.context, permissionCode: "iam.identity.replay", resource: { tenantId: input.context.tenantId, attemptId: input.deadLetterAttemptId } });
    if (!decision.allowed) throw new Error(`IAM_REPLAY_FORBIDDEN:${decision.reason}`);
    if (input.context.assurance !== "elevated") throw new Error("IAM_REPLAY_MFA_REQUIRED");
    if (input.approvedBy === input.context.principalId) throw new Error("IAM_REPLAY_SOD_REQUIRED");
    return this.repository.replay({ authorityTenantId: input.context.tenantId, deadLetterAttemptId: input.deadLetterAttemptId, requestedBy: input.context.principalId, approvedBy: input.approvedBy, requestedAt: this.now().toISOString() });
  }
}

export interface ProviderIdentityCallback {
  readonly eventId: string;
  readonly identityId: string;
  readonly desiredVersion: number;
  readonly desiredHash: string;
  readonly providerSequence: number;
  readonly providerSubject: string;
  readonly status: IdentityDesiredStatus;
}

export interface ProviderCallbackRepository {
  accept(callback: ProviderIdentityCallback): Promise<"accepted" | "duplicate">;
  observeIfCurrent(callback: ProviderIdentityCallback): Promise<"applied" | "stale" | "out_of_order">;
}

export class ProviderIdentityCallbackConsumer {
  constructor(private readonly repository: ProviderCallbackRepository) {}
  async consume(callback: ProviderIdentityCallback): Promise<"applied" | "duplicate" | "stale" | "out_of_order"> {
    validateCallback(callback);
    if (await this.repository.accept(callback) === "duplicate") return "duplicate";
    return this.repository.observeIfCurrent(callback);
  }
}

export interface ProviderIdentityObservation {
  readonly identityId: string;
  readonly providerSubject?: string;
  readonly status?: IdentityDesiredStatus;
  readonly organizationIds: readonly string[];
  readonly applications: readonly string[];
  readonly desiredVersion?: number;
  readonly desiredHash?: string;
}

export interface IdentityProjectionDrift {
  readonly identityId: string;
  readonly kind: "missing" | "extra" | "mismatched";
  readonly coordinate: string;
}

export function diffIdentityProjection(desired: readonly DesiredIdentityProjection[], observed: readonly ProviderIdentityObservation[]): readonly IdentityProjectionDrift[] {
  const wanted = new Map(desired.map(item => [item.identityId, item]));
  const actual = new Map(observed.map(item => [item.identityId, item]));
  const drift: IdentityProjectionDrift[] = [];
  for (const item of desired) {
    const found = actual.get(item.identityId);
    if (!found) { drift.push({ identityId: item.identityId, kind: "missing", coordinate: "identity" }); continue; }
    if (found.desiredVersion !== item.desiredVersion || found.desiredHash !== item.desiredHash || found.status !== item.status) drift.push({ identityId: item.identityId, kind: "mismatched", coordinate: "state" });
    if (!found.organizationIds.includes(item.membership.organizationId)) drift.push({ identityId: item.identityId, kind: "missing", coordinate: `organization:${item.membership.organizationId}` });
    for (const application of item.applications) {
      const coordinate = `${application.plane}:${application.targetTenantId}`;
      if (!found.applications.includes(coordinate)) drift.push({ identityId: item.identityId, kind: "missing", coordinate: `application:${coordinate}` });
    }
  }
  for (const item of observed) if (!wanted.has(item.identityId)) drift.push({ identityId: item.identityId, kind: "extra", coordinate: "identity" });
  return drift;
}

export interface PeriodicIdentityReconciliationRepository {
  listDesired(): Promise<readonly DesiredIdentityProjection[]>;
  recordExact(input: { readonly identityId: string; readonly desiredVersion: number; readonly desiredHash: string; readonly status: "in_sync" | "drifted"; readonly drift: readonly IdentityProjectionDrift[]; readonly observedAt: string }): Promise<"applied" | "stale">;
  recordExtra(input: { readonly identityId: string; readonly observedAt: string }): Promise<void>;
}

export class PeriodicIdentityReconciliationJob {
  constructor(private readonly options: { readonly repository: PeriodicIdentityReconciliationRepository; readonly provider: { inventory(): Promise<readonly ProviderIdentityObservation[]> }; readonly now?: () => Date }) {}
  async run(): Promise<{ readonly inSync: number; readonly drifted: number; readonly stale: number; readonly extra: number }> {
    const desired = await this.options.repository.listDesired();
    const observed = await this.options.provider.inventory();
    const allDrift = diffIdentityProjection(desired, observed), observedAt = (this.options.now ?? (() => new Date()))().toISOString();
    const wantedIds = new Set(desired.map(item => item.identityId));
    let inSync = 0, drifted = 0, stale = 0, extra = 0;
    for (const item of desired) {
      const drift = allDrift.filter(entry => entry.identityId === item.identityId);
      const result = await this.options.repository.recordExact({ identityId: item.identityId, desiredVersion: item.desiredVersion, desiredHash: item.desiredHash, status: drift.length ? "drifted" : "in_sync", drift, observedAt });
      if (result === "stale") stale++; else if (drift.length) drifted++; else inSync++;
    }
    for (const item of observed) if (!wantedIds.has(item.identityId)) { await this.options.repository.recordExtra({ identityId: item.identityId, observedAt }); extra++; }
    return { inSync, drifted, stale, extra };
  }
}

export function providerKey(work: Pick<DesiredIdentityProjection, "identityId" | "desiredVersion" | "desiredHash">, operation: string, coordinate = "self"): string {
  return `athyper:${operation}:${sha256(`${work.identityId}:${work.desiredVersion}:${work.desiredHash}:${coordinate}`).slice(0, 40)}`;
}

export function classifyIdentitySagaFailure(error: unknown): IdentitySagaFailureClass {
  const code = safeErrorCode(error).toUpperCase();
  if (code.includes("STALE") || code.includes("FENCE") || code.includes("VERSION") || code.includes("HASH")) return "stale";
  if (code.includes("INVALID") || code.includes("RELATIONSHIP") || code.includes("MISMATCH") || code.includes("CONFLICT") || ["23503", "23505", "23514", "22023"].includes(code)) return "permanent";
  return "transient";
}

export function identityRetryDelay(attemptNo: number): number {
  return [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000][Math.min(Math.max(attemptNo - 1, 0), 3)]!;
}

function validateRelationship(work: DesiredIdentityProjection, organization: DesiredOrganizationProjection | undefined): asserts organization is DesiredOrganizationProjection {
  if (!organization) throw coded("IDENTITY_ORGANIZATION_MISSING");
  const expected: IdentityRelationship = organization.purpose === "tenant_employer" ? "employer" : "contact";
  if (work.membership.relationship !== expected) throw coded("IDENTITY_ORGANIZATION_RELATIONSHIP_INVALID");
  if (work.membership.relationship === "employer" && !work.membership.sourceRef.startsWith("employment:")) throw coded("IDENTITY_EMPLOYMENT_REFERENCE_INVALID");
  if (work.membership.relationship === "contact" && !work.membership.sourceRef.startsWith("business_partner_contact:")) throw coded("IDENTITY_CONTACT_REFERENCE_INVALID");
}
function validateWork(work: IdentitySagaWork, claimTokenHash: string): void {
  if (work.claimTokenHash !== claimTokenHash || work.fencingToken < 1 || work.desiredVersion < 1 || !/^[a-f0-9]{64}$/.test(work.desiredHash)) throw coded("IDENTITY_WORK_INVALID");
  if (!work.applications.length && (work.status === "invited" || work.status === "active")) throw coded("IDENTITY_APPLICATIONS_INVALID");
}
function validateCallback(callback: ProviderIdentityCallback): void {
  if (!callback.eventId || !callback.identityId || !callback.providerSubject || callback.desiredVersion < 1 || callback.providerSequence < 1 || !/^[a-f0-9]{64}$/.test(callback.desiredHash)) throw coded("IDENTITY_CALLBACK_INVALID");
}
function coordinates(work: IdentitySagaWork): IdentitySagaCoordinate { return { attemptId: work.attemptId, identityId: work.identityId, desiredVersion: work.desiredVersion, desiredHash: work.desiredHash, fencingToken: work.fencingToken, claimTokenHash: work.claimTokenHash }; }
function safeErrorCode(error: unknown): string { if (error && typeof error === "object" && "code" in error) return String((error as { code: unknown }).code).slice(0, 160); return error instanceof Error ? error.message.slice(0, 160) : "IDENTITY_SAGA_FAILED"; }
function coded(code: string): Error { return Object.assign(new Error(code), { code }); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
