import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

import type { JsonValue } from "@athyper/server-contract-policy";
export type { JsonValue } from "@athyper/server-contract-policy";
export type EffectiveStatus = "draft" | "active" | "suspended" | "retired";
export interface EffectiveWindow {
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
}
export interface Versioned {
  readonly id: string;
  readonly version: number;
}
export interface CacheInvalidator {
  invalidate(input: {
    readonly namespace:
      | "features"
      | "parameters"
      | "lookups"
      | "rounding"
      | "entitlements"
      | "connectors";
    readonly tenantId?: string;
    readonly keys?: readonly string[];
  }): Promise<void>;
}

export interface FeatureFlagDefinition extends EffectiveWindow {
  readonly cohortStrategy: "tenant_sha256_v1" | "principal_fnv1a_v2";
  readonly cohortRevision: number;
  readonly kind?: "release_gate" | "kill_switch" | "experiment";
  readonly id: string;
  readonly code: string;
  readonly defaultEnabled: boolean;
  readonly rolloutPct?: number;
  readonly status: "active" | "retired";
}
export interface FeatureFlagOverride extends Versioned, EffectiveWindow {
  readonly tenantId: string;
  readonly featureFlagId: string;
  readonly enabled: boolean;
  readonly reason: string;
  readonly status: "active" | "expired";
}
export interface FeatureFlagRepository {
  readEvaluation?(
    tenantId: string,
    code: string,
    at: string,
  ): Promise<
    | {
        readonly definition: FeatureFlagDefinition;
        readonly override?: FeatureFlagOverride;
      }
    | undefined
  >;
  getDefinition(code: string): Promise<FeatureFlagDefinition | undefined>;
  listDefinitions(): Promise<readonly FeatureFlagDefinition[]>;
  getOverride(
    tenantId: string,
    featureFlagId: string,
    at?: string,
  ): Promise<FeatureFlagOverride | undefined>;
  saveOverride(
    input: Omit<FeatureFlagOverride, "id" | "version" | "status"> & {
      readonly id?: string;
      readonly expectedVersion: number;
    },
    actorId: string,
  ): Promise<FeatureFlagOverride>;
  expireOverride(
    tenantId: string,
    id: string,
    expectedVersion: number,
    actorId: string,
  ): Promise<FeatureFlagOverride>;
}

export type ParameterValueType =
  "boolean" | "integer" | "number" | "string" | "enum" | "duration" | "json";
export type ParameterReloadMode =
  "immediate" | "next_request" | "next_login" | "restart" | "external_provider";
export interface ParameterDefinition {
  readonly revision: number;
  readonly id: string;
  readonly code: string;
  readonly valueType: ParameterValueType;
  readonly defaultValue: JsonValue;
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly allowedValues?: readonly JsonValue[];
  readonly tenantCanOverride: boolean;
  readonly reloadMode: ParameterReloadMode;
  readonly cacheTtlSeconds: number;
  readonly status: "active" | "retired";
}
export interface TenantParameterValue extends Versioned, EffectiveWindow {
  readonly tenantId: string;
  readonly parameterDefinitionId: string;
  readonly value: JsonValue;
  readonly reason?: string;
  readonly status: "active" | "expired";
}
/** Select active values at the supplied instant using [from, until). Writes must atomically enforce ownership, OCC, overlap/lifecycle rules, audit and outbox. */
export interface ParameterRepository {
  readEffective?(
    tenantId: string,
    code: string,
    at: string,
  ): Promise<
    | {
        readonly definition: ParameterDefinition;
        readonly value?: TenantParameterValue;
      }
    | undefined
  >;
  getDefinition(code: string): Promise<ParameterDefinition | undefined>;
  listDefinitions(): Promise<readonly ParameterDefinition[]>;
  getValue(
    tenantId: string,
    definitionId: string,
    at?: string,
  ): Promise<TenantParameterValue | undefined>;
  saveValue(
    input: Omit<TenantParameterValue, "id" | "version" | "status"> & {
      readonly id?: string;
      readonly expectedVersion: number;
    },
    actorId: string,
  ): Promise<TenantParameterValue>;
  expireValue(
    tenantId: string,
    id: string,
    expectedVersion: number,
    actorId: string,
  ): Promise<TenantParameterValue>;
}

export interface LookupValue {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly tenantId?: string;
  readonly sortOrder: number;
  readonly metadata: Readonly<Record<string, JsonValue>>;
  readonly status: "active" | "retired";
}
export interface LookupDomainRevision extends Versioned {
  readonly code: string;
  readonly name: string;
  readonly sourceSchema: string;
  readonly extensible: boolean;
  readonly values: readonly LookupValue[];
  readonly status: "active" | "retired";
}
export interface LookupDesiredState {
  readonly desiredStateId: string;
  readonly targetPlane: "studio" | "neon" | "mesh";
  readonly sourceRevision: number;
  readonly domain: LookupDomainRevision;
}
/** Repositories must enforce tenant scope on current and historical reads.
 * Publication owns immutable revisions, receipt/payload idempotency, monotonic source revisions,
 * and preservation of tenant extensions. Retirement repeats ownership, extensibility, OCC and
 * reference-use checks atomically with the write, audit and outbox; service prechecks are not locks.
 */
export interface LookupRepository {
  getDomain(
    code: string,
    version?: number,
    tenantId?: string,
  ): Promise<LookupDomainRevision | undefined>;
  listDomains(tenantId?: string): Promise<readonly LookupDomainRevision[]>;
  publishDesiredState(
    input: LookupDesiredState,
    actorId: string,
    tenantId?: string,
  ): Promise<LookupDomainRevision>;
  isValueReferenced(
    domainCode: string,
    valueCode: string,
    tenantId?: string,
  ): Promise<boolean>;
  retireValue(
    input: {
      readonly domainCode: string;
      readonly valueCode: string;
      readonly tenantId: string;
      readonly expectedVersion: number;
    },
    actorId: string,
  ): Promise<LookupDomainRevision>;
}

export type RoundingMethod =
  "ROUND_HALF_UP" | "ROUND_HALF_EVEN" | "ROUND_UP" | "ROUND_DOWN" | "TRUNCATE";
export interface RoundingContext {
  readonly companyCodeId?: string;
  readonly currencyCode?: string;
  readonly slot?: string;
}
export interface RoundingAggregate extends Versioned {
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly method: RoundingMethod;
  readonly precisionDigits?: number;
  readonly roundingIncrement?: string;
  readonly contexts: readonly RoundingContext[];
  readonly status: EffectiveStatus;
}
export interface RoundingRepository {
  getCurrencyDefaults(
    tenantId: string,
    currencyCode: string,
  ): Promise<
    | { readonly minorUnits: number; readonly roundingIncrement?: string }
    | undefined
  >;
  list(tenantId: string): Promise<readonly RoundingAggregate[]>;
  get(tenantId: string, id: string): Promise<RoundingAggregate | undefined>;
  save(
    input: Omit<RoundingAggregate, "version"> & {
      readonly expectedVersion?: number;
    },
    actorId: string,
  ): Promise<RoundingAggregate>;
  retire(
    tenantId: string,
    id: string,
    expectedVersion: number | undefined,
    actorId: string,
  ): Promise<RoundingAggregate>;
}
export interface RoundingSimulation {
  readonly input: string;
  readonly output: string;
  readonly ruleId: string;
  readonly ruleCode: string;
  readonly specificity: number;
}

export interface BankValidationFixture {
  readonly input: BankValidationInput;
  readonly valid: boolean;
}
export interface BankValidationInput {
  readonly direction?: "inbound" | "outbound";
  readonly countryCode: string;
  readonly currencyCode?: string;
  readonly railCode: string;
  readonly accountIdentifier?: string;
  readonly bankIdentifier?: string;
  readonly bic?: string;
  readonly branchCode?: string;
}
export interface BankValidationRule extends Versioned {
  readonly direction?: "inbound" | "outbound" | "both";
  readonly name?: string;
  readonly accountIdentifierType?: string;
  readonly bankIdentifierType?: string;
  readonly code: string;
  readonly countryCode: string;
  readonly currencyCode?: string;
  readonly railCode: string;
  readonly priority: number;
  readonly accountRequired: boolean;
  readonly bankRequired: boolean;
  readonly bicAllowed: boolean;
  readonly bicRequired: boolean;
  readonly branchRequired: boolean;
  readonly accountPattern?: string;
  readonly bankPattern?: string;
  readonly branchPattern?: string;
  readonly checksumValidated: boolean;
  readonly fixtures: readonly BankValidationFixture[];
  readonly status: "draft" | "active" | "retired";
}
/** Candidate reads must filter active applicability before mapping unsupported native checks.
 * Never omit an applicable unsupported rule to fall back to a weaker candidate. */
export interface BankValidationRepository {
  listApplicable(
    input: Pick<
      BankValidationInput,
      "countryCode" | "railCode" | "currencyCode" | "direction"
    >,
  ): Promise<readonly BankValidationRule[]>;
  list(): Promise<readonly BankValidationRule[]>;
  get(id: string): Promise<BankValidationRule | undefined>;
  publish(
    rule: BankValidationRule,
    actorId: string,
    tenantId?: string,
  ): Promise<BankValidationRule>;
}
export interface BankValidationResult {
  readonly valid: boolean;
  readonly ruleId?: string;
  readonly issues: readonly string[];
}

/** Count/bytes limits are nonnegative JSON safe integers; zero is no capacity, plan null is unlimited. */
export interface EntitlementPlan {
  readonly code: string;
  readonly version: number;
  readonly modules: readonly string[];
  readonly limits: Readonly<Record<string, number | null>>;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
}
export interface TenantEntitlementOverride extends Versioned, EffectiveWindow {
  readonly tenantId: string;
  readonly planCode: string;
  readonly moduleCode?: string;
  readonly limitCode?: string;
  readonly limitValue?: number;
  readonly reason: string;
  readonly status: "active" | "expired";
}
/** Writes must atomically enforce tenant scope, expected versions, and lifecycle.
 * Version 0 creates a new override; expired overrides cannot be reactivated by save.
 * getPlan returns the revision effective at the supplied instant. */
export interface EntitlementRepository {
  listPlans(): Promise<readonly EntitlementPlan[]>;
  getPlan(code: string, at: string): Promise<EntitlementPlan | undefined>;
  listModules(): Promise<readonly string[]>;
  getOverride(
    tenantId: string,
    id: string,
  ): Promise<TenantEntitlementOverride | undefined>;
  saveOverride(
    input: Omit<TenantEntitlementOverride, "version" | "status"> & {
      readonly expectedVersion: number;
    },
    actorId: string,
  ): Promise<TenantEntitlementOverride>;
  expireOverride(
    tenantId: string,
    id: string,
    expectedVersion: number,
    actorId: string,
  ): Promise<TenantEntitlementOverride>;
}

export interface ConnectorDraft extends Versioned {
  readonly tenantId: string;
  readonly connectorTypeId: string;
  readonly code: string;
  readonly name: string;
  readonly baseUrl?: string;
  readonly secretReference?: string;
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly endpoints: readonly ConnectorEndpointDraft[];
  readonly status: "draft" | "active" | "suspended" | "deprecated";
}
export interface ConnectorEndpointDraft {
  readonly code: string;
  readonly path: string;
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly kind: string;
  readonly requestSchema?: Readonly<Record<string, JsonValue>>;
}
/** Save and transition must atomically compare expectedVersion in the tenant scope.
 * Version 0 creates a new draft; existing drafts alone may be saved. Transitions
 * must enforce the lifecycle against the locked/current row before committing. */
export interface ConnectorRepository {
  get(tenantId: string, id: string): Promise<ConnectorDraft | undefined>;
  save(
    input: Omit<ConnectorDraft, "version"> & {
      readonly expectedVersion: number;
    },
    actorId: string,
  ): Promise<ConnectorDraft>;
  transition(
    tenantId: string,
    id: string,
    status: ConnectorDraft["status"],
    expectedVersion: number,
    actorId: string,
  ): Promise<ConnectorDraft>;
}
/** Workers must resolve connectors in this exact plane and tenant and recheck
 * lifecycle and outbound-network policy at execution time. */
export interface ConnectorHealthJobs {
  enqueue(input: {
    readonly planeKey: VerifiedRequestContext["planeKey"];
    readonly tenantId: string;
    readonly connectorId: string;
    readonly requestedBy: string;
  }): Promise<string>;
}

export interface ControlServiceCommand<T> {
  readonly context: VerifiedRequestContext;
  readonly payload: T;
  readonly expectedVersion?: number;
}
