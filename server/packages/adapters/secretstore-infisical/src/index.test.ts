import { describe, expect, it, vi } from "vitest";
import { createInfisicalSecretStore, infisicalSecretName } from "./index.js";

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
