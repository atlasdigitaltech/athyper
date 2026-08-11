import { describe, expect, it, vi } from "vitest";
import { createInfisicalSecretStore } from "./index.js";

describe("Infisical secret store", () => {
  it("resolves opaque key bytes without exposing them in coordinates", async () => {
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({secret:{secretValue:Buffer.from("private-key").toString("base64"),secretEncoding:"base64",version:7}}),{status:200}));
    const store=createInfisicalSecretStore({endpoint:"http://localhost:8080",token:"machine-token",workspaceId:"workspace",environment:"dev",secretPath:"/publication",fetch:fetcher});
    const value=await store.resolve("publication/signing/private");
    expect(Buffer.from(value.bytes).toString()).toBe("private-key");
    expect(value.version).toBe("7");
    const [url,request]=fetcher.mock.calls[0]!;
    expect(String(url)).toContain("publication%2Fsigning%2Fprivate");
    expect(request.headers).toEqual(expect.objectContaining({Authorization:"Bearer machine-token"}));
  });

  it("rejects plaintext remote endpoints and closed stores", async () => {
    expect(()=>createInfisicalSecretStore({endpoint:"http://secrets.example",token:"x",workspaceId:"w",environment:"dev"})).toThrow("HTTPS");
    const store=createInfisicalSecretStore({endpoint:"http://localhost:8080",token:"x",workspaceId:"w",environment:"dev",fetch:vi.fn()});
    store.close?.();
    await expect(store.resolve("key")).rejects.toThrow("SECRET_STORE_CLOSED");
  });
});
