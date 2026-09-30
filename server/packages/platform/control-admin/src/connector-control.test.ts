import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ConnectorDraft, ConnectorRepository } from "@athyper/server-contract-control-admin";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { describe, expect, it, vi } from "vitest";
import { createConnectorControlService } from "./connector-control.js";

const context = { tenantId: "tenant-1", principalId: "principal-1", planeKey: "neon" } as VerifiedRequestContext;
const draft: ConnectorDraft = { id: "connector-1", tenantId: context.tenantId, version: 1, connectorTypeId: "type-1", code: "PAYMENTS", name: "Payments", baseUrl: "https://connector.test", secretReference: "vault://payments/key", config: { timeout: 10 }, endpoints: [{ code: "health", path: "/health", method: "GET", kind: "health" }], status: "draft" };
function fixture(current: ConnectorDraft | undefined = draft, authorizer: Authorizer = { authorize: async () => ({ allowed: true }) }) {
  const repository = {
    get: vi.fn<ConnectorRepository["get"]>(async () => current),
    save: vi.fn<ConnectorRepository["save"]>(async value => ({ ...value, version: value.expectedVersion + 1 })),
    transition: vi.fn<ConnectorRepository["transition"]>(async (_tenant, _id, status, expectedVersion) => ({ ...current!, status, version: expectedVersion + 1 })),
  };
  const cache = { invalidate: vi.fn(async () => undefined) }, healthJobs = { enqueue: vi.fn(async () => "job-1") };
  const service = createConnectorControlService({ authorizer, repositories: createExactPlaneRepositoryProvider({ neon: repository }), cache, healthJobs });
  return { service, repository, cache, healthJobs };
}

describe("connector lifecycle and isolation", () => {
  it.each(["active", "suspended", "deprecated"] as const)("cannot reset a %s connector through draft saving", async status => {
    const { service, repository, cache } = fixture({ ...draft, status });
    await expect(service.saveDraft(context, draft, 1)).rejects.toMatchObject({ statusCode: 409, code: "CONTROL_ADMIN_LIFECYCLE_INVALID" });
    expect(repository.save).not.toHaveBeenCalled(); expect(cache.invalidate).not.toHaveBeenCalled();
  });
  it("creates only with version zero and invalidates both codes when renaming a draft", async () => {
    const { service, repository, cache } = fixture();
    repository.get.mockResolvedValueOnce(undefined);
    await expect(service.saveDraft(context, draft, 0)).resolves.toMatchObject({ version: 1, tenantId: context.tenantId });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 0, tenantId: context.tenantId }), context.principalId);
    await service.saveDraft(context, { ...draft, code: "RENAMED" }, 1);
    expect(cache.invalidate).toHaveBeenLastCalledWith({ namespace: "connectors", tenantId: context.tenantId, keys: ["PAYMENTS", "RENAMED"] });
  });
  it.each([undefined, null, true, "1", -1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("rejects invalid version %s for draft saves", async expectedVersion => {
    const { service, repository } = fixture();
    await expect(service.saveDraft(context, draft, expectedVersion as number)).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.save).not.toHaveBeenCalled();
  });
  it("rejects stale versions and wrong create/update intent", async () => {
    const { service, repository } = fixture();
    await expect(service.saveDraft(context, draft, 0)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.activate(context, draft.id, 2)).rejects.toMatchObject({ statusCode: 409 });
    repository.get.mockResolvedValue(undefined);
    await expect(service.saveDraft(context, draft, 1)).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.save).not.toHaveBeenCalled(); expect(repository.transition).not.toHaveBeenCalled();
  });
  for (const status of ["draft", "active", "suspended", "deprecated"] as const) {
    for (const action of ["activate", "suspend", "deprecate"] as const) {
      const allowed = action === "activate" ? status === "draft" || status === "suspended" : action === "suspend" ? status === "active" : status !== "deprecated";
      it(`${allowed ? "allows" : "rejects"} ${status} -> ${action}`, async () => {
        const { service, repository } = fixture({ ...draft, status });
        if (allowed) {
          const target = action === "activate" ? "active" : action === "suspend" ? "suspended" : "deprecated";
          await expect(service[action](context, draft.id, 1)).resolves.toMatchObject({ status: target });
          expect(repository.transition).toHaveBeenCalledExactlyOnceWith(context.tenantId, draft.id, target, 1, context.principalId);
        } else {
          await expect(service[action](context, draft.id, 1)).rejects.toMatchObject({ statusCode: 409 });
          expect(repository.transition).not.toHaveBeenCalled();
        }
      });
    }
  }
  it.each([{ baseUrl: undefined }, { endpoints: [] }])("requires a usable configuration for activation and health checks: %j", async fields => {
    const { service, repository, healthJobs } = fixture({ ...draft, ...fields });
    await expect(service.activate(context, draft.id, 1)).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.requestHealthCheck(context, draft.id)).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.transition).not.toHaveBeenCalled(); expect(healthJobs.enqueue).not.toHaveBeenCalled();
  });
  it("does not invalidate cache after a failed persistence write", async () => {
    const { service, repository, cache } = fixture();
    repository.save.mockRejectedValue(new Error("write failed"));
    await expect(service.saveDraft(context, draft, 1)).rejects.toThrow("write failed");
    expect(cache.invalidate).not.toHaveBeenCalled();
  });
  it("does not use rows returned for another tenant or resource", async () => {
    const { service, repository, healthJobs } = fixture({ ...draft, tenantId: "other" });
    await expect(service.saveDraft(context, draft, 1)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.activate(context, draft.id, 1)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.requestHealthCheck(context, draft.id)).rejects.toMatchObject({ statusCode: 404 });
    repository.get.mockResolvedValue({ ...draft, id: "other" });
    await expect(service.activate(context, draft.id, 1)).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.save).not.toHaveBeenCalled(); expect(repository.transition).not.toHaveBeenCalled(); expect(healthJobs.enqueue).not.toHaveBeenCalled();
  });
  it("queues with verified tenant, plane, principal, and connector id", async () => {
    const { service, healthJobs } = fixture();
    await expect(service.requestHealthCheck(context, draft.id)).resolves.toBe("job-1");
    expect(healthJobs.enqueue).toHaveBeenCalledExactlyOnceWith({ planeKey: "neon", tenantId: "tenant-1", connectorId: "connector-1", requestedBy: "principal-1" });
  });
  it("refuses missing and deprecated connectors and empty queue receipts", async () => {
    const { service, repository, healthJobs } = fixture({ ...draft, status: "deprecated" });
    await expect(service.requestHealthCheck(context, draft.id)).rejects.toMatchObject({ statusCode: 404 });
    repository.get.mockResolvedValueOnce(undefined);
    await expect(service.requestHealthCheck(context, draft.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(healthJobs.enqueue).not.toHaveBeenCalled();
    repository.get.mockResolvedValue(draft); healthJobs.enqueue.mockResolvedValue(" ");
    await expect(service.requestHealthCheck(context, draft.id)).rejects.toMatchObject({ statusCode: 503 });
  });
  it("fails closed for missing planes and denied permissions", async () => {
    const { service, repository } = fixture();
    await expect(service.activate({ ...context, planeKey: "mesh" }, draft.id, 1)).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.get).not.toHaveBeenCalled();
    const denied = fixture(draft, { authorize: async () => ({ allowed: false, reason: "denied" }) });
    await expect(denied.service.saveDraft(context, draft, 1)).rejects.toMatchObject({ statusCode: 403 });
    await expect(denied.service.validate(context, draft)).rejects.toMatchObject({ statusCode: 403 });
    await expect(denied.service.activate(context, draft.id, 1)).rejects.toMatchObject({ statusCode: 403 });
    await expect(denied.service.requestHealthCheck(context, draft.id)).rejects.toMatchObject({ statusCode: 403 });
    expect(denied.repository.get).not.toHaveBeenCalled(); expect(denied.healthJobs.enqueue).not.toHaveBeenCalled();
  });
});

describe("connector validation", () => {
  it.each(["/\\evil.test/x", "//evil.test/x", "https://evil.test/x", "/%5cevil.test/x", "/%255cevil.test/x", "/a/../secret", "/a/%2e%2e/secret", "/health#ignored", "/health\n", "/health?api_key=plaintext", "/health?%74oken=plaintext", "/health%ZZ"])("rejects unsafe endpoint %s", async path => {
    const { service } = fixture();
    await expect(service.validate(context, { ...draft, endpoints: [{ ...draft.endpoints[0]!, path }] })).rejects.toMatchObject({ statusCode: 400, code: "CONTROL_ADMIN_CONNECTOR_INVALID" });
  });
  it.each(["http://connector.test", "https://user:pass@connector.test", "https://connector.test?token=secret", "https://connector.test#fragment", "https://connector.test\\@evil.test", " https://connector.test"])("rejects unsafe base URL %s", async baseUrl => {
    await expect(fixture().service.validate(context, { ...draft, baseUrl })).rejects.toMatchObject({ statusCode: 400 });
  });
  it.each(["plaintext", "vault://", "file:///tmp/key", "vault://user:pass@keys", "vault://keys?token=secret", "vault://keys#fragment"])("rejects unsafe secret reference %s", async secretReference => {
    await expect(fixture().service.validate(context, { ...draft, secretReference })).rejects.toMatchObject({ statusCode: 400 });
  });
  it.each([{ apiToken: "plaintext" }, { nested: [{ password: "plaintext" }] }, { headers: { Authorization: "Bearer secret" } }, { private_key: "key" }, { credentials: { user: "user" } }])("rejects inline credentials %j", async config => {
    await expect(fixture().service.validate(context, { ...draft, config: config as unknown as ConnectorDraft["config"] })).rejects.toMatchObject({ statusCode: 400 });
  });
  it.each([{ name: " " }, { connectorTypeId: " " }, { config: [] }, { endpoints: null }, { endpoints: [draft.endpoints[0], draft.endpoints[0]] }, { endpoints: [{ ...draft.endpoints[0], code: "health " }] }, { endpoints: [{ ...draft.endpoints[0], method: "TRACE" }] }])("rejects malformed service input %j", async fields => {
    await expect(fixture().service.validate(context, { ...draft, ...fields } as ConnectorDraft)).rejects.toMatchObject({ statusCode: 400 });
  });
  it("accepts valid draft and active configurations without persistence", async () => {
    const { service, repository } = fixture();
    await expect(service.validate(context, { ...draft, status: "active", secretReference: "https://keyvault.test/secrets/payments", endpoints: [{ ...draft.endpoints[0]!, path: "/v1/health?region=us" }] })).resolves.toEqual({ valid: true });
    await expect(service.validate(context, { ...draft, baseUrl: undefined, endpoints: [] })).resolves.toEqual({ valid: true });
    expect(repository.get).not.toHaveBeenCalled(); expect(repository.save).not.toHaveBeenCalled();
  });
});

it.each([new Date(),new Map(),new Array(2),{[Symbol('hidden')]:'secret'},Object.defineProperty({},'hidden',{get(){throw Error('getter executed');},enumerable:true})])('rejects non-JSON connector config without evaluating accessors',async config=>{
 const f=fixture();await expect(f.service.validate(context,{...draft,config:config as never})).rejects.toMatchObject({statusCode:400});expect(f.repository.save).not.toHaveBeenCalled();
});
