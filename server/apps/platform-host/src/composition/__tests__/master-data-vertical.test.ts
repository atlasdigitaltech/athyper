import { Kysely, DummyDriver, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import type { EffectivePermissionSnapshot } from "@athyper/server-contract-auth";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { contactVerificationSigningBytes, type ProviderVerificationKey } from "@athyper/server-service-master-data";
import { createServer } from "node:http";
import type { VerifiedToken } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createInMemoryAuditSink } from "@athyper/server-platform-audit";
import { createHttpApplication } from "@athyper/server-runtime-http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerPlatform } from "../register-platform.js";
import { registerServices, type ServiceRegistrationDependencies } from "../register-services.js";

const databases: Kysely<Record<string, never>>[] = [];
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map(db => db.destroy()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  })));
});
const id = "11111111-1111-4111-8111-111111111111";
const principal = "22222222-2222-4222-8222-222222222222";
const owner = { entityCode: "business_partner", ownerTypeId: id, ownerId: id };
const evidence = { provider: "test", evidenceId: "evidence", issuedAt: "2020-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", payloadHash: "hash", signature: "signature", keyId: "key" };
const endpoints = [
  ["POST", `contacts/${id}/deactivate`, undefined, 204],
  ["POST", `addresses/${id}/deactivate`, undefined, 204],
  ["PATCH", `contacts/${id}/verification`, { verified: true, evidence }, 200],
  ["POST", `owners/business_partner/${id}/${id}/contacts`, { channelType: "email", value: "A@example.com" }, 200],
  ["POST", `owners/business_partner/${id}/${id}/addresses`, { address: { city: "KL" } }, 200],
  ["GET", `owners/business_partner/${id}/${id}/profile`, undefined, 200],
] as const;
async function fixture(configured: boolean, permitted = true, verifierConfigured = true, trustedKeys: readonly ProviderVerificationKey[] = []) {
  const container = createContainer();
  const permissions = ["read", "update", "verify_contact", "write_contact_sensitive", "write_address_sensitive", "read_contact_sensitive", "read_address_sensitive"].map(code => `neon.relationship.business_partner.${code}`);
  const snapshot = { planeKey: "neon", tenantId: id, principalId: principal, profileHash: "test",
    allowed: permitted ? permissions : [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [],
    evidence: permissions.map(permissionCode => ({permissionCode,effect:"allow",proof:"role",scopeKind:"operating_organization",targetId:id,scopeTargetId:id,propagationMode:"exact"})),
    operationBindings: ["read","update"].map(operationKey => ({entityCode:"business_partner",operationKey,permissionCode:`neon.relationship.business_partner.${operationKey}`,decisionMode:"authorize",requiredScopeKinds:["operating_organization"]})),
  } as unknown as EffectivePermissionSnapshot;
  const token: VerifiedToken = { issuer: "https://iam.example/realms/athyper", subject: principal, audience: ["athyper-api"], claims: {
    iss: "https://iam.example/realms/athyper", sub: principal, aud: "athyper-api", tenant_id: id, principal_id: principal, auth_epoch: 1,
    azp: "neon-web", permissions: permitted ? permissions : [], resource_access: { "neon-web": { roles: ["AUTHORIZED"] } },
  } };
  const config = loadConfig();
  registerPlatform(container, { ...config, env: "production", iam: { ...config.iam, defaultRealmKey: "athyper", claimContextMode: "on" } }, {
    tokenVerifier: { verify: async (value) => { if (value !== "signed-token") throw new Error("invalid"); return token; } },
    resolveIdentityContext: async () => ({ tenantId: id, principalId: principal, authEpoch: 1, permissions: snapshot }),
    auditSink: createInMemoryAuditSink(),
  });
  const contact = { id, tenantId: id, owner, channelType: "email", value: "a@example.com", purpose: "default", isPrimary: false, isVerified: false, effectiveFrom: "2020-01-01T00:00:00Z", status: "active" };
  const address = { id, tenantId: id, addressId: id, owner, address: { city: "KL" }, purpose: "default", isPrimary: false, effectiveFrom: "2020-01-01T00:00:00Z" };
  const repository = {
    ownerExists: vi.fn(async () => true), findContactDuplicate: vi.fn(async () => null), createContact: vi.fn(async () => contact),
    getContactForVerification: vi.fn(async () => contact),
    setContactVerification: vi.fn(async () => contact), deactivateContact: vi.fn(async () => true),
    findAddressDuplicate: vi.fn(async () => null), createAddress: vi.fn(async () => ({ id, address: address.address })),
    createAddressLink: vi.fn(async () => address), deactivateAddressLink: vi.fn(async () => true),
    listContacts: vi.fn(async () => [contact]), listAddresses: vi.fn(async () => [address]),
  };
  const verify = vi.fn(async () => true);
  const append = vi.fn(async () => undefined);
  const db = new Kysely<Record<string, never>>({dialect:{createAdapter:()=>new PostgresAdapter(),createDriver:()=>new DummyDriver(),createIntrospector:d=>new PostgresIntrospector(d),createQueryCompiler:()=>new PostgresQueryCompiler()},
    plugins:[{transformQuery:a=>a.node,transformResult:async a=>({...a.result,rows:[{id,owner_id:id,ownerId:id,ownerTypeId:id}]})}]});
  databases.push(db);
  const run = vi.fn(async (_plane, _actor, work) => db.transaction().execute(work));
  const descriptor = { entityCode: "business_partner", planeKey: "neon", storage:{schema:"master",object:"business_partner",tenantField:"tenant_id",idField:"id"}, operations:{read:{permissionCode:permissions[0]},update:{permissionCode:permissions[1]}} } as unknown as EntityRuntimeDescriptor;
  registerServices(container, configured ? {
    metadata: { getEntityDescriptor: async () => descriptor },
    transactions: { run }, outbox: { append },
    masterData: { repository, ...(verifierConfigured ? { evidenceVerifier: { verify } } : {}) },
  } as unknown as ServiceRegistrationDependencies : {}, { ...config, masterDataVerificationKeys: trustedKeys });
  const app = createHttpApplication({ configure(application) {
    for (const register of container.platform.httpRegistrars) register(application);
  } });
  const server = createServer(app); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addressInfo = server.address() as { port: number };
  return { container, repository, verify, append, run, request: (endpoint: readonly [string, string, unknown, number], authenticated = true) => {
    const [method, path, body] = endpoint;
    return fetch(`http://127.0.0.1:${addressInfo.port}/api/master/${path}`, {
      method, headers: { "content-type": "application/json", "x-plane": "neon", ...(authenticated ? { authorization: "Bearer signed-token" } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } };
}

describe("master data host registration", () => {
  it("mounts all six routes with the real service factory and verified IAM context", async () => {
    const f = await fixture(true);
    expect(f.container.services.masterData).toBeDefined();
    for (const endpoint of endpoints) {
      const response = await f.request(endpoint);
      expect(response.status, await response.text()).toBe(endpoint[3]);
    }
    expect(f.repository.createContact).toHaveBeenCalledWith(expect.objectContaining({ tenantId: id, owner, value: "a@example.com" }), expect.anything());
    expect(f.repository.listContacts).toHaveBeenCalledWith(id, owner, expect.any(String), expect.anything());
    expect(f.run).toHaveBeenCalledWith("neon", expect.objectContaining({ tenantId: id, principalId: principal }), expect.any(Function), undefined);
    expect(f.verify).toHaveBeenCalledWith(evidence, { planeKey: "neon", tenantId: id, contactId: id, channelType: "email", value: "a@example.com", verified: true });
    expect(f.append).toHaveBeenCalledTimes(5);
  });
  it("authenticates every mounted route before calling dependencies", async () => {
    const f = await fixture(true);
    for (const endpoint of endpoints) expect((await f.request(endpoint, false)).status).toBe(401);
    expect(f.run).not.toHaveBeenCalled(); expect(f.verify).not.toHaveBeenCalled();
  });
  it("keeps persistence operations available when the verification provider is absent", async () => {
    const f = await fixture(true, true, false);
    for (const endpoint of endpoints) {
      const response = await f.request(endpoint);
      expect(response.status).toBe(endpoint[0] === "PATCH" ? 503 : endpoint[3]);
      if (endpoint[0] === "PATCH") expect(await response.json()).toMatchObject({ code: "MASTER_DATA_VERIFIER_UNAVAILABLE" });
    }
    expect(f.repository.setContactVerification).not.toHaveBeenCalled();
    expect(f.repository.createContact).toHaveBeenCalled();
  });
  it("uses the configured production verifier and rejects contact-value tampering", async () => {
    const pair = generateKeyPairSync("ed25519");
    const keys = [{ provider: "provider", keyId: "key", publicKeyPem: pair.publicKey.export({type:"spki",format:"pem"}).toString(), planeKeys:["neon"], tenantIds:[id], notBefore:"2020-01-01T00:00:00.000Z", notAfter:"2099-01-01T00:00:00.000Z" }];
    const f = await fixture(true,true,false,keys);
    const issuedAt = new Date().toISOString(), expiresAt = new Date(Date.now()+300000).toISOString();
    const fields = {provider:"provider",keyId:"key",evidenceId:"test-evidence",issuedAt,expiresAt};
    const target = {planeKey:"neon",tenantId:id,contactId:id,channelType:"email" as const,value:"a@example.com",verified:true};
    const bytes = contactVerificationSigningBytes(fields,target);
    const proof = {...fields,payloadHash:createHash("sha256").update(bytes).digest("hex"),signature:sign(null,bytes,pair.privateKey).toString("base64url")};
    const endpoint = ["PATCH",`contacts/${id}/verification`,{verified:true,evidence:proof},200] as const;
    expect((await f.request(endpoint)).status).toBe(200);
    f.repository.setContactVerification.mockClear();
    f.repository.getContactForVerification.mockResolvedValue({id,tenantId:id,owner,channelType:"email",value:"changed@example.com",purpose:"default",isPrimary:false,isVerified:false,effectiveFrom:issuedAt,status:"active"});
    expect((await f.request(endpoint)).status).toBe(422);
    expect(f.repository.setContactVerification).not.toHaveBeenCalled();
  });
  it("preserves permission denial on every configured route", async () => {
    const f = await fixture(true, false);
    for (const endpoint of endpoints) expect((await f.request(endpoint)).status).toBe(403);
    expect(f.run).toHaveBeenCalled(); expect(f.verify).not.toHaveBeenCalled();
    expect(f.repository.createContact).not.toHaveBeenCalled();
    expect(f.repository.deactivateContact).not.toHaveBeenCalled();
    expect(f.repository.listContacts).not.toHaveBeenCalled();
  });
  it("returns authenticated 503 responses instead of 404 when adapters are absent", async () => {
    const f = await fixture(false);
    for (const endpoint of endpoints) {
      expect((await f.request(endpoint, false)).status).toBe(401);
      const response = await f.request(endpoint);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: "MASTER_DATA_UNAVAILABLE" });
    }
  });
});
