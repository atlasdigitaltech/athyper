import { describe, expect, it, vi } from "vitest";
import { createInfisicalSecretStore, infisicalSecretName, withProtectedValueStore } from "./index.js";

describe("isolated protected-value authority", () => {
  const reference="protected-values/44444444-4444-4444-8444-444444444444/tax:11111111-1111-4111-8111-111111111111";
  it("compensates only a successful creation and checks its version", async () => {
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({secret:{version:1}}))
      .mockResolvedValueOnce(Response.json({secret:{version:1,secretValue:'dGVzdA=='}}))
      .mockResolvedValueOnce(Response.json({}));
    const store=createInfisicalSecretStore({endpoint:'http://localhost',token:'writer',workspaceId:'isolated',environment:'dev',createOnly:true,fetch:fetcher});
    const receipt=await store.create!(reference,new TextEncoder().encode('test'));
    await receipt.discard();await receipt.discard();
    expect(fetcher.mock.calls.map(x=>x[1]?.method??'GET')).toEqual(['POST','GET','DELETE']);
  });
  it("will not compensate a changed version or expose cleanup on a failed creation", async () => {
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({secret:{version:1}}))
      .mockResolvedValueOnce(Response.json({secret:{version:2,secretValue:'dGVzdA=='}}))
      .mockResolvedValueOnce(Response.json({},{status:409}));
    const store=createInfisicalSecretStore({endpoint:'http://localhost',token:'writer',workspaceId:'isolated',environment:'dev',createOnly:true,fetch:fetcher});
    const receipt=await store.create!(reference,new TextEncoder().encode('test'));
    await expect(receipt.discard()).rejects.toThrow('COMPENSATION_VERSION_MISMATCH');
    await expect(store.create!(reference,new TextEncoder().encode('test'))).rejects.toThrow('SECRET_STORE_WRITE_FAILED');
    expect(fetcher.mock.calls.some(x=>x[1]?.method==='DELETE')).toBe(false);
  });
  it("creates immutable values using native POST and never retries an overwrite", async () => {
    const fetcher=vi.fn(async()=>new Response('{}',{status:409}));
    const store=createInfisicalSecretStore({endpoint:'http://localhost',token:'writer',workspaceId:'isolated',environment:'dev',createOnly:true,fetch:fetcher});
    await expect(store.put!(reference,new TextEncoder().encode('synthetic'))).rejects.toThrow('SECRET_STORE_WRITE_FAILED');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({method:'POST'});
  });
  it("routes publication reads separately and rejects non-protected writes", async () => {
    const legacy={resolve:vi.fn(async()=>({bytes:new Uint8Array(),version:'legacy'}))};
    const capture={resolve:vi.fn(async()=>({bytes:new Uint8Array(),version:'new'})),put:vi.fn(async()=>({reference,version:'1'}))};
    const store=withProtectedValueStore(legacy,capture);
    expect((await store.resolve('PUBLICATION_KEY')).version).toBe('legacy');
    expect((await store.resolve(reference)).version).toBe('new');
    await store.put!(reference,new Uint8Array(4));
    await expect(store.put!('PUBLICATION_KEY',new Uint8Array(4))).rejects.toThrow('PROTECTED_VALUE_REFERENCE_INVALID');
    expect(capture.put).toHaveBeenCalledTimes(1);
  });
  it("falls back for legacy not-found only, never for forbidden or unavailable", async () => {
    const legacy={resolve:vi.fn(async()=>({bytes:new Uint8Array(),version:'legacy'}))};
    const capture={resolve:vi.fn().mockRejectedValueOnce({code:'SECRET_NOT_FOUND'}).mockRejectedValueOnce({code:'SECRET_STORE_UNAVAILABLE'})};
    const store=withProtectedValueStore(legacy,capture);
    expect((await store.resolve(reference)).version).toBe('legacy');
    await expect(store.resolve(reference)).rejects.toMatchObject({code:'SECRET_STORE_UNAVAILABLE'});
    expect(legacy.resolve).toHaveBeenCalledTimes(1);
  });
});

describe("Infisical secret store", () => {
  it("resolves opaque key bytes without exposing them in coordinates", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            secret: {
              secretValue: Buffer.from("private-key").toString("base64"),
              secretEncoding: "base64",
              version: 7,
            },
          }),
          { status: 200 },
        ),
    );
    const store = createInfisicalSecretStore({
      endpoint: "http://localhost:8080",
      token: "machine-token",
      workspaceId: "workspace",
      environment: "dev",
      secretPath: "/publication",
      fetch: fetcher,
    });
    const value = await store.resolve("publication/signing/private");
    expect(Buffer.from(value.bytes).toString()).toBe("private-key");
    expect(value.version).toBe("7");
    const [url, request] = fetcher.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe(
      "/api/v3/secrets/raw/" +
        infisicalSecretName("publication/signing/private"),
    );
    expect(request.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer machine-token" }),
    );
  });

  it("rejects plaintext remote endpoints and closed stores", async () => {
    expect(() =>
      createInfisicalSecretStore({
        endpoint: "http://secrets.example",
        token: "x",
        workspaceId: "w",
        environment: "dev",
      }),
    ).toThrow("HTTPS");
    const store = createInfisicalSecretStore({
      endpoint: "http://localhost:8080",
      token: "x",
      workspaceId: "w",
      environment: "dev",
      fetch: vi.fn(),
    });
    store.close?.();
    await expect(store.resolve("key")).rejects.toThrow("SECRET_STORE_CLOSED");
  });
});

describe("Infisical reference compatibility", () => {
  it("keeps existing flat keys and bounds names rejected by the server router", () => {
    expect(infisicalSecretName("PUBLICATION_KEY")).toBe("PUBLICATION_KEY");
    for (const reference of [
      "protected-values/tenant/token",
      "vault:tax:opaque-001",
      "a".repeat(101),
    ]) {
      expect(infisicalSecretName(reference)).toMatch(
        /^athyper_ref_[a-f0-9]{64}$/,
      );
    }
    expect(infisicalSecretName("protected-values/tenant-a/token")).not.toBe(
      infisicalSecretName("protected-values/tenant-b/token"),
    );
  });
  it("uses the same coordinates for writes and reads without sending the opaque reference", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ secret: { secretValue: "dGVzdA==", version: 1 } }),
        ),
    );
    const store = createInfisicalSecretStore({
      endpoint: "http://localhost",
      token: "test",
      workspaceId: "workspace",
      environment: "dev",
      fetch: fetcher,
    });
    const reference = "protected-values/tenant-a/" + "token".repeat(30);
    await store.put!(reference, new TextEncoder().encode("test"));
    await store.resolve(reference);
    const write = new URL(String(fetcher.mock.calls[0]![0]));
    const read = new URL(String(fetcher.mock.calls[1]![0]));
    expect(write.pathname).toBe(read.pathname);
    expect(write.pathname).not.toContain("tenant-a");
    expect(read.searchParams.get("workspaceId")).toBe("workspace");
    expect(read.searchParams.get("secretPath")).toBe("/");
  });
});
