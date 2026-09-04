import { describe, expect, it, vi } from "vitest";
import { KeycloakIdentityProviderAdapter } from "../keycloak-identity-provider.js";

const subject = "11111111-1111-4111-8111-111111111111",
  organization = "22222222-2222-4222-8222-222222222222",
  tenant = "33333333-3333-4333-8333-333333333333",
  key = `athyper:identity:${"a".repeat(40)}`;
function adapter(responses: Response[]) {
  const bytes = new TextEncoder().encode("client-secret"),
    fetcher = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        responses.shift() ?? new Response(null, { status: 500 }),
    );
  return {
    adapter: new KeycloakIdentityProviderAdapter({
      baseUrl: "https://iam.example.test",
      adminRealm: "master",
      clientId: "athyper-iam-saga",
      credentialReference: "secret/keycloak-admin",
      secrets: { resolve: vi.fn(async () => ({ bytes, version: "v1" })) },
      fetcher: fetcher as typeof fetch,
    }),
    fetcher,
    bytes,
  };
}

describe("Keycloak identity provider adapter", () => {
  it("resolves an opaque credential, creates once, joins the organization and disables without deleting", async () => {
    const value = adapter([
      Response.json({ access_token: "token", expires_in: 300 }),
      Response.json([]),
      new Response(null, {
        status: 201,
        headers: {
          location: `https://iam.example.test/admin/realms/neon/users/${subject}`,
        },
      }),
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
    ]);
    await expect(
      value.adapter.inviteOrCreate({
        realmKey: "neon",
        identifier: "worker@example.test",
        displayName: "Worker",
        invite: true,
        idempotencyKey: key,
      }),
    ).resolves.toEqual({ providerSubject: subject });
    await value.adapter.ensureMembership({
      realmKey: "neon",
      providerSubject: subject,
      externalOrganizationId: organization,
      relationship: "external_worker",
      idempotencyKey: `athyper:membership:${"b".repeat(40)}`,
    });
    await value.adapter.deprovision({
      realmKey: "neon",
      providerSubject: subject,
      idempotencyKey: `athyper:deprovision:${"c".repeat(40)}`,
    });
    expect(value.fetcher).toHaveBeenCalledTimes(5);
    expect(value.fetcher.mock.calls.map((call) => String(call[0]))).not.toEqual(
      expect.arrayContaining([expect.stringContaining("client-secret")]),
    );
    expect(new TextDecoder().decode(value.bytes)).toBe("client-secret");
    expect(String(value.fetcher.mock.calls.at(-1)?.[1]?.body)).toBe(
      '{"enabled":false}',
    );
  });
  it("keeps application grants plane-local and classifies provider outages", async () => {
    const value = adapter([
      Response.json({ access_token: "token", expires_in: 300 }),
      new Response(null, { status: 503 }),
    ]);
    await expect(
      value.adapter.ensureApplication({
        providerSubject: subject,
        plane: "mesh",
        targetTenantId: tenant,
        idempotencyKey: `athyper:application:${"d".repeat(40)}`,
      }),
    ).resolves.toBeUndefined();
    await expect(
      value.adapter.suspend({
        realmKey: "neon",
        providerSubject: subject,
        idempotencyKey: `athyper:suspend:${"e".repeat(40)}`,
      }),
    ).rejects.toMatchObject({ code: "KEYCLOAK_PROVIDER_UNAVAILABLE" });
  });
  it("rejects non-local cleartext administration endpoints", () =>
    expect(
      () =>
        new KeycloakIdentityProviderAdapter({
          baseUrl: "http://iam.example.test",
          adminRealm: "master",
          clientId: "client",
          credentialReference: "secret/ref",
          secrets: {
            resolve: async () => ({ bytes: new Uint8Array(), version: "v1" }),
          },
        }),
    ).toThrow("HTTPS_REQUIRED"));
});
