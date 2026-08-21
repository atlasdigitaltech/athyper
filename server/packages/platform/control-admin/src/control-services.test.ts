import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { BankValidationRule, ConnectorDraft, FeatureFlagRepository, RoundingAggregate } from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { describe, expect, it, vi } from "vitest";
import { createBankValidationService, createConnectorControlService, createFeatureFlagService, createLookupService, createRoundingService, validateParameterValue, verifyBankRules } from "./control-services.js";

const context = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "neon" } as VerifiedRequestContext;
const allow: Authorizer = { async authorize() { return { allowed: true }; } };
const cache = () => ({ invalidate: vi.fn(async () => undefined) });

describe("C2 control services", () => {
  it("selects catalog reads and tenant override writes from the request plane", async () => {
    const studio = featureRepository(false), neon = featureRepository(true);
    const service = createFeatureFlagService({ authorizer: allow, repositories: createExactPlaneRepositoryProvider({ studio, neon }), cache: cache(), now: () => new Date("2026-06-01T00:00:00Z") });
    await expect(service.evaluate(context, "ui.new")).resolves.toMatchObject({ enabled: true });
    await expect(service.evaluate({ ...context, planeKey: "studio" }, "ui.new")).resolves.toMatchObject({ enabled: false });
    await service.saveOverride({ context, code: "ui.new", enabled: false, reason: "neon only", effectiveFrom: "2026-01-01T00:00:00Z" });
    expect(neon.saveOverride).toHaveBeenCalledOnce();
    expect(studio.saveOverride).not.toHaveBeenCalled();
  });

  it("fails closed when the requested plane has no control repository", async () => {
    const service = createFeatureFlagService({ authorizer: allow, repositories: createExactPlaneRepositoryProvider({ studio: featureRepository(false) }, { unavailableCode: "CONTROL_ADMIN_EXACT_PLANE_REPOSITORY_UNAVAILABLE" }), cache: cache() });
    await expect(service.evaluate(context, "ui.new")).rejects.toMatchObject({ code: "CONTROL_ADMIN_EXACT_PLANE_REPOSITORY_UNAVAILABLE", planeKey: "neon" });
  });

  it("keeps platform catalog publication Studio-owned", async () => {
    const studio = { list: vi.fn(async () => []), get: vi.fn(), publish: vi.fn(async (rule: BankValidationRule) => rule) };
    const service = createBankValidationService({ authorizer: allow, repositories: createExactPlaneRepositoryProvider({ studio }) });
    const rule: BankValidationRule = { id: "bank-1", version: 1, code: "DE.SEPA", countryCode: "DE", currencyCode: "EUR", railCode: "sepa", priority: 10, accountRequired: true, bankRequired: false, bicAllowed: true, bicRequired: false, branchRequired: false, accountPattern: "^DE[0-9]{20}$", checksumValidated: true, fixtures: [], status: "draft" };
    await expect(service.publish(context, rule)).rejects.toMatchObject({ code: "CONTROL_ADMIN_PERMISSION_DENIED" });
    await expect(service.publish({ ...context, planeKey: "studio" }, rule)).resolves.toBe(rule);
    expect(studio.publish).toHaveBeenCalledOnce();
  });

  it("keeps global lookup retirement in Studio while allowing exact-tenant values locally", async () => {
    const retireValue = vi.fn(async () => lookupDomain());
    const repository = { getDomain: vi.fn(async () => lookupDomain()), listDomains: vi.fn(async () => []), publishDesiredState: vi.fn(), isValueReferenced: vi.fn(async () => false), retireValue };
    const service = createLookupService({ authorizer: allow, repositories: provider(repository), cache: cache() });
    await expect(service.retireValue(context, { domainCode: "reason", valueCode: "global" })).rejects.toMatchObject({ code: "CONTROL_ADMIN_PERMISSION_DENIED" });
    await expect(service.retireValue(context, { domainCode: "reason", valueCode: "tenant", tenantId: context.tenantId })).resolves.toMatchObject({ code: "reason" });
    expect(retireValue).toHaveBeenCalledOnce();
  });

  it("validates parameter types, bounds, allowed values, and durations", () => {
    const numeric = { id: "p1", code: "finance.threshold", valueType: "integer" as const, defaultValue: 2, minValue: 1, maxValue: 5, allowedValues: [1, 2, 3], tenantCanOverride: true, reloadMode: "immediate" as const, cacheTtlSeconds: 0, status: "active" as const };
    expect(() => validateParameterValue(numeric, 3)).not.toThrow();
    expect(() => validateParameterValue(numeric, 4)).toThrowError(expect.objectContaining({ code: "CONTROL_ADMIN_INVALID_VALUE" }));
    expect(() => validateParameterValue({ ...numeric, valueType: "duration", allowedValues: undefined }, "PT15M")).not.toThrow();
  });

  it("uses an effective feature override and invalidates only after a successful write", async () => {
    const repository = { getDefinition: vi.fn(async () => ({ id: "flag-1", code: "ui.new", defaultEnabled: false, effectiveFrom: "2026-01-01T00:00:00Z", status: "active" as const })), listDefinitions: vi.fn(async () => []), getOverride: vi.fn(async () => ({ id: "override-1", version: 1, tenantId: "tenant-1", featureFlagId: "flag-1", enabled: true, reason: "rollout", effectiveFrom: "2026-01-01T00:00:00Z", status: "active" as const })), saveOverride: vi.fn(async (value) => ({ ...value, id: "override-1", version: 1, status: "active" as const })), expireOverride: vi.fn() } satisfies FeatureFlagRepository;
    const invalidator = cache(), service = createFeatureFlagService({ authorizer: allow, repositories: provider(repository), cache: invalidator, now: () => new Date("2026-06-01T00:00:00Z") });
    await expect(service.evaluate(context, "ui.new")).resolves.toMatchObject({ enabled: true, source: "tenant_override" });
    await service.saveOverride({ context, code: "ui.new", enabled: true, reason: "pilot", effectiveFrom: "2026-01-01T00:00:00Z" });
    expect(invalidator.invalidate).toHaveBeenCalledWith({ namespace: "features", tenantId: "tenant-1", keys: ["ui.new"] });
  });

  it("selects the most-specific rounding context and rejects ambiguous overlap", async () => {
    const rules: RoundingAggregate[] = [rule("default", [{}]), rule("usd", [{ currencyCode: "USD" }], "0.05")];
    const service = createRoundingService({ authorizer: allow, repositories: provider({ list: async () => rules, get: async () => undefined, save: async (value) => ({ ...value, version: 1 }), retire: async () => rules[0]! }), cache: cache() });
    await expect(service.simulate(context, { amount: "10.03", currencyCode: "USD" })).resolves.toMatchObject({ output: "10.05", ruleCode: "usd", specificity: 2 });
    rules.push(rule("usd-two", [{ currencyCode: "USD" }]));
    await expect(service.simulate(context, { amount: "10.03", currencyCode: "USD" })).rejects.toMatchObject({ code: "CONTROL_ADMIN_ROUNDING_OVERLAP" });
  });

  it("simulates decimal ties without binary floating-point drift", async () => {
    const exact = { ...rule("even", [{}]), method: "ROUND_HALF_EVEN" as const };
    const service = createRoundingService({ authorizer: allow, repositories: provider({ list: async () => [exact], get: async () => exact, save: async (value) => ({ ...value, version: 2 }), retire: async () => exact }), cache: cache() });
    await expect(service.simulate(context, { amount: "1.025" })).resolves.toMatchObject({ output: "1.02" });
    await expect(service.simulate(context, { amount: "1.035" })).resolves.toMatchObject({ output: "1.04" });
    await expect(service.simulate(context, { amount: "-1.025" })).resolves.toMatchObject({ output: "-1.02" });
  });

  it("verifies bank fixtures and IBAN checksums", () => {
    const rule: BankValidationRule = { id: "bank-1", version: 1, code: "DE.SEPA", countryCode: "DE", currencyCode: "EUR", railCode: "sepa", priority: 10, accountRequired: true, bankRequired: false, bicAllowed: true, bicRequired: false, branchRequired: false, accountPattern: "^DE[0-9]{20}$", checksumValidated: true, fixtures: [], status: "active" };
    expect(verifyBankRules([rule], { countryCode: "DE", currencyCode: "EUR", railCode: "sepa", accountIdentifier: "DE89370400440532013000" })).toMatchObject({ valid: true, ruleId: "bank-1" });
    expect(verifyBankRules([rule], { countryCode: "DE", currencyCode: "EUR", railCode: "sepa", accountIdentifier: "DE00370400440532013000" })).toMatchObject({ valid: false, issues: expect.arrayContaining(["CHECKSUM_INVALID"]) });
  });

  it("enforces connector lifecycle, endpoint compatibility, and secret references", async () => {
    let current = connector(); const repository = { get: async () => current, save: async (value: Omit<ConnectorDraft, "version">) => ({ ...value, version: 1 }), transition: async (_tenant: string, _id: string, status: ConnectorDraft["status"]) => (current = { ...current, status, version: current.version + 1 }) };
    const jobs = { enqueue: vi.fn(async () => "job-1") }, service = createConnectorControlService({ authorizer: allow, repositories: provider(repository), cache: cache(), healthJobs: jobs });
    await expect(service.activate(context, current.id, 1)).resolves.toMatchObject({ status: "active" });
    await expect(service.saveDraft(context, { ...connector(), config: { apiToken: "plaintext" } })).rejects.toMatchObject({ code: "CONTROL_ADMIN_CONNECTOR_INVALID" });
    await expect(service.saveDraft(context, { ...connector(), endpoints: [{ code: "escape", path: "https://evil.test", method: "GET", kind: "health" }] })).rejects.toMatchObject({ code: "CONTROL_ADMIN_CONNECTOR_INVALID" });
    await expect(service.requestHealthCheck(context, current.id)).resolves.toBe("job-1");
  });
});

function rule(code: string, contexts: RoundingAggregate["contexts"], increment = "0.01"): RoundingAggregate { return { id: code, version: 1, tenantId: "tenant-1", code, name: code, method: "ROUND_HALF_UP", precisionDigits: 2, roundingIncrement: increment, contexts, status: "active" }; }
function connector(): ConnectorDraft { return { id: "connector-1", version: 1, tenantId: "tenant-1", connectorTypeId: "type-1", code: "PAYMENTS", name: "Payments", baseUrl: "https://connector.test", secretReference: "vault://payments", config: { timeout: 10 }, endpoints: [{ code: "health", path: "/health", method: "GET", kind: "health" }], status: "draft" }; }
function provider<T>(repository: T) { return createExactPlaneRepositoryProvider({ neon: repository }); }
function featureRepository(defaultEnabled: boolean) { return { getDefinition: vi.fn(async () => ({ id: "flag-1", code: "ui.new", defaultEnabled, effectiveFrom: "2026-01-01T00:00:00Z", status: "active" as const })), listDefinitions: vi.fn(async () => []), getOverride: vi.fn(async () => undefined), saveOverride: vi.fn(async (value) => ({ ...value, id: "override-1", version: 1, status: "active" as const })), expireOverride: vi.fn() } satisfies FeatureFlagRepository; }
function lookupDomain() { return { id: "domain-1", version: 1, code: "reason", name: "Reason", sourceSchema: "control", extensible: true, values: [], status: "active" as const }; }
