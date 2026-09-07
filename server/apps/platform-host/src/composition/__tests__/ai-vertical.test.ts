import { describe, expect, it, vi } from "vitest";
import type { AtlasModelBinding, AtlasModelProvider } from "@athyper/server-contract-ai";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerAtlas, type ServiceRegistrationDependencies } from "../register-services.js";

const binding: AtlasModelBinding = { bindingId: "binding-1", bindingRevision: "1", publicModelId: "atlas-fast", providerId: "openai", upstreamModelId: "gpt-exact", adapterId: "openai-responses", adapterVersion: "1", displayTier: "fast", exposure: "product", status: "available", capabilities: { streaming: true, tools: true, vision: false, structuredOutput: true, maxContextTokens: 1000, maxOutputTokens: 100 }, credentialPolicy: "platform", credentialOwnerId: "platform-openai", providerRegion: "global", dataHandlingProfileId: "no-store", routingPolicyId: "no-fallback-v1", allowedDataClasses: ["internal"], priceVersion: "1", inputPricePerMtokUsd: 1, outputPricePerMtokUsd: 1 };
const provider: AtlasModelProvider = { providerId: "openai", adapterId: "openai-responses", adapterVersion: "1", invoke: async function* () { yield { kind: "cancelled" }; } };
const fakeDatabase = { transaction: vi.fn(), executeQuery: vi.fn() } as never;
const transactions = { run: vi.fn() } as never;
const iam = { authenticate: vi.fn() } as never;

function dependencies(): NonNullable<ServiceRegistrationDependencies["ai"]> {
  const thread = { threadId: "10000000-0000-4000-8000-000000000001", tenantId: "10000000-0000-4000-8000-000000000002", planeKey: "neon" as const, ownerPrincipalId: "10000000-0000-4000-8000-000000000003", title: null, status: "active" as const, participants: [], rowVersion: 1, lastMessageSequence: 0, retention: { policyId: "default", expiresAt: null, purgeAfter: null, legalHold: false }, createdAt: "2026-08-11T00:00:00Z", updatedAt: "2026-08-11T00:00:00Z" };
  return {
    admission: { resolve: async () => ({ admitted: true, reasonCode: "allowed", policyRevision: "1", chatAllowed: true, persistenceAllowed: true, readToolsAllowed: true, mutationToolsAllowed: false, allowedPublicModelIds: ["atlas-fast"], allowedDataClasses: ["internal"], retentionPolicyId: "default" }) },
    threadRepository: { create: async () => thread, list: async () => ({ items: [thread], nextCursor: null }), get: async () => thread, listMessages: async () => ({ items: [], nextCursor: null }), rename: async () => thread, archive: async () => thread, softDelete: async () => true, putParticipant: async () => thread, revokeParticipant: async () => thread },
    threadAuthorizer: { authorize: async () => true }, retention: { resolve: async () => ({ policyId: "default", retentionDays: 30, displayText: "30 days" }) },
    modelPolicy: { evaluate: async () => ({ allowed: true, policyRevision: "1", promptRevision: "1" }) }, bindings: [binding], providers: [provider],
    credentials: { resolve: async () => ({ credentialId: "credential", credentialRevision: "1", ownerId: "platform-openai", secret: "not-read-during-composition" }) },
    runs: { begin: vi.fn(), get: vi.fn(), complete: vi.fn(), fail: vi.fn(), cancel: vi.fn() }, usageLedger: { append: vi.fn() }, prompts: { resolve: async () => ({ revision: "1", systemText: "safe" }) },
    registeredTools: [], toolAuthority: { authorize: async () => ({ allowed: true, policyRevision: "1" }) }, recordGateway: { query: vi.fn() }, confirmations: { verify: async () => true }, commands: { execute: vi.fn() },
    credentialCipher: { encrypt: async () => ({ payload: "ciphertext", keyVersion: 1 }), decrypt: async () => "secret" }, credentialInvalidation: { publish: vi.fn() },
    knowledgeIndex: { index: vi.fn(async () => []), search: vi.fn(async () => []), remove: vi.fn(), health: async () => ({ healthy: true }) }, policyInvalidation: { publish: vi.fn() }, driftAlerts: { publish: vi.fn() },
    knowledgeJobAuthority: { load: vi.fn() },
  };
}

describe("Atlas host composition", () => {
  it("always composes the durable ledger but leaves routes disabled by default", () => {
    const container = createContainer(); const config = loadConfig();
    registerAtlas(container, { ...config, atlas: { enabled: false, persistenceEnabled: false, toolsEnabled: false } }, undefined, { neon: fakeDatabase }, transactions, iam);
    expect(container.platform.ai).toMatchObject({ routesEnabled: false, toolsEnabled: false }); expect(container.platform.httpRegistrars).toHaveLength(1); expect(container.runtimes.health.list()).toContain("atlas.tool-invocation-ledger");
  });
  it("composes durable history independently of provider readiness", () => {
    const container = createContainer(); const config = loadConfig();
    registerAtlas(container, { ...config, atlas: { enabled: true, persistenceEnabled: true, toolsEnabled: false } }, undefined, { neon: fakeDatabase }, transactions, iam);
    expect(container.platform.ai).toMatchObject({ routesEnabled: true, toolsEnabled: false });
    expect(container.platform.ai?.threads).toBeDefined();
    expect(container.platform.ai?.runtime).toBeUndefined();
    expect(container.platform.httpRegistrars).toHaveLength(2);
    expect(container.runtimes.health.list()).toContain("atlas.conversation-persistence");
  });
  it("fails closed when tools are enabled without provider and command dependencies", () => {
    const container = createContainer(); const config = loadConfig();
    expect(() => registerAtlas(container, { ...config, atlas: { enabled: true, persistenceEnabled: true, toolsEnabled: true } }, undefined, { neon: fakeDatabase }, transactions, iam)).toThrow(/full provider and command/);
  });
  it("composes repositories, provider registry, runtime, tools, routes, and readiness together", () => {
    const container = createContainer(); const config = loadConfig();
    registerAtlas(container, { ...config, atlas: { enabled: true, persistenceEnabled: true, toolsEnabled: true } }, dependencies(), { neon: fakeDatabase }, transactions, iam);
    expect(container.platform.ai).toMatchObject({ routesEnabled: true, toolsEnabled: true }); expect(container.platform.ai?.runtime).toBeDefined(); expect(container.platform.ai?.tools).toBeDefined(); expect(container.platform.ai?.operations).toBeDefined(); expect(container.platform.httpRegistrars).toHaveLength(3); expect(container.runtimes.health.list()).toEqual(expect.arrayContaining(["atlas.tool-invocation-ledger", "atlas.runtime-composition", "atlas.a2-operations"]));
  });
});
