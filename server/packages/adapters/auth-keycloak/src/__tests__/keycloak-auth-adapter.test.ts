import * as jose from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createKeycloakAuthAdapter } from "../keycloak-auth-adapter.js";
import { KeycloakJwksManager } from "../keycloak-jwks-manager.js";

const joseMocks = vi.hoisted(() => ({
  remoteKeySet: vi.fn(),
}));

vi.mock("jose", async () => {
  const actual = await vi.importActual<typeof jose>("jose");
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(() => joseMocks.remoteKeySet),
    jwtVerify: vi.fn(),
  };
});

const ISSUER = "https://iam.athyper.test/realms/athyper";

describe("Keycloak auth adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("implements the Auth contract and normalizes verified claims", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: {
        iss: ISSUER,
        sub: "user-42",
        aud: "athyper-api",
        iat: 100,
        exp: 200,
      },
      protectedHeader: { alg: "RS256" },
    } as never);
    const adapter = createKeycloakAuthAdapter(config());

    await expect(adapter.verify("signed-token")).resolves.toEqual({
      claims: {
        iss: ISSUER,
        sub: "user-42",
        aud: "athyper-api",
        iat: 100,
        exp: 200,
      },
      issuer: ISSUER,
      subject: "user-42",
      audience: ["athyper-api"],
      issuedAt: 100,
      expiresAt: 200,
    });
    expect(jose.jwtVerify).toHaveBeenCalledWith(
      "signed-token",
      expect.any(Function),
      {
        issuer: ISSUER,
        audience: "athyper-api",
        algorithms: ["RS256"],
        clockTolerance: 30,
      },
    );
  });

  it("preserves multiple audiences", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: { iss: ISSUER, sub: "user-1", aud: ["api", "account"] },
      protectedHeader: { alg: "RS256" },
    } as never);

    await expect(createKeycloakAuthAdapter(config()).verify("token")).resolves.toMatchObject({
      audience: ["api", "account"],
    });
  });

  it("fails closed when required identity claims are missing", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: { iss: ISSUER, aud: "athyper-api" },
      protectedHeader: { alg: "RS256" },
    } as never);

    await expect(createKeycloakAuthAdapter(config()).verify("token")).rejects.toThrow(
      '"sub" claim',
    );
  });

  it("fails closed for unknown realms", async () => {
    const adapter = createKeycloakAuthAdapter(config());

    await expect(adapter.verify("token", "unknown")).rejects.toThrow(
      "Unknown Keycloak realm",
    );
    expect(jose.jwtVerify).not.toHaveBeenCalled();
  });

  it("uses realm-specific issuer and audience", async () => {
    const partnerIssuer = "https://iam.athyper.test/realms/partner";
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: { iss: partnerIssuer, sub: "partner-1", aud: "mesh-api" },
      protectedHeader: { alg: "RS256" },
    } as never);
    const adapter = createKeycloakAuthAdapter({
      ...config(),
      additionalRealms: {
        partner: { issuerUrl: `${partnerIssuer}/`, audience: "mesh-api" },
      },
    });

    await adapter.verify("partner-token", "partner");

    expect(adapter.getIssuerUrl("partner")).toBe(partnerIssuer);
    expect(jose.jwtVerify).toHaveBeenCalledWith(
      "partner-token",
      expect.any(Function),
      expect.objectContaining({ issuer: partnerIssuer, audience: "mesh-api" }),
    );
  });

  it("can fetch keys privately while preserving the public issuer", () => {
    const privateJwks = "http://iam:8080/realms/athyper/protocol/openid-connect/certs";
    const adapter = createKeycloakAuthAdapter({
      defaultRealm: {
        issuerUrl: ISSUER,
        audience: "athyper-api",
        jwksUrl: privateJwks,
      },
    });

    expect(adapter.getIssuerUrl()).toBe(ISSUER);
    expect(jose.createRemoteJWKSet).toHaveBeenCalledWith(new URL(privateJwks), {
      cooldownDuration: 600_000,
    });
  });

  it("rejects unsafe or incomplete configuration", () => {
    expect(() =>
      createKeycloakAuthAdapter({
        defaultRealm: { issuerUrl: "not-a-url", audience: "api" },
      }),
    ).toThrow("Invalid Keycloak issuer URL");
    expect(() =>
      createKeycloakAuthAdapter({
        defaultRealm: { issuerUrl: ISSUER, audience: " " },
      }),
    ).toThrow("audience");
    expect(() => createKeycloakAuthAdapter({ ...config(), algorithms: [] })).toThrow(
      "algorithm",
    );
  });
});

describe("Keycloak JWKS health", () => {
  it("records successful endpoint warm-up", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [{ kid: "one" }, { kid: "two" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const manager = new KeycloakJwksManager(ISSUER, { fetcher, now: () => 100 });

    await manager.warmUp();

    expect(fetcher).toHaveBeenCalledWith(
      new URL(`${ISSUER}/protocol/openid-connect/certs`),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(manager.getHealth()).toEqual({
      healthy: true,
      lastSuccessAt: 100,
      lastFailureAt: null,
      lastFailureReason: null,
      keyCount: 2,
    });
  });

  it("records warm-up failure without making construction fail", async () => {
    const warn = vi.fn();
    const manager = new KeycloakJwksManager(ISSUER, {
      fetcher: vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
      now: () => 200,
      logger: { info: vi.fn(), warn, error: vi.fn() },
    });

    await expect(manager.warmUp()).resolves.toBeUndefined();

    expect(manager.getHealth()).toMatchObject({
      healthy: false,
      lastFailureAt: 200,
      lastFailureReason: "JWKS endpoint returned HTTP 503",
    });
    expect(warn).toHaveBeenCalledWith(
      "keycloak_jwks_warmup_failed",
      expect.objectContaining({ issuerUrl: ISSUER }),
    );
  });
});

function config() {
  return {
    defaultRealm: {
      issuerUrl: `${ISSUER}/`,
      audience: "athyper-api",
    },
  };
}
