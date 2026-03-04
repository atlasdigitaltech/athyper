// Auth adapter test — exercises createAuthAdapter interface, JWT verification
// contract, and realm management. Since we cannot spin up a real JWKS server,
// we mock jose.jwtVerify and jose.createRemoteJWKSet to isolate adapter logic.

import * as jose from "jose";

import { createAuthAdapter, type AuthAdapterConfig } from "../keycloak/auth-adapter.js";

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock("jose", async () => {
    const actual = await vi.importActual<typeof jose>("jose");
    return {
        ...actual,
        createRemoteJWKSet: vi.fn().mockReturnValue(vi.fn()),
        jwtVerify: vi.fn(),
    };
});

// ─── Helpers ────────────────────────────────────────────────────

function baseConfig(overrides?: Partial<AuthAdapterConfig>): AuthAdapterConfig {
    return {
        issuerUrl: "https://idp.athyper.test/realms/main",
        clientId: "athyper-web",
        clientSecret: "test-secret",
        ...overrides,
    };
}

async function createExpiredJwt(privateKey: jose.KeyLike): Promise<string> {
    return new jose.SignJWT({ sub: "user-1" })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer("https://idp.athyper.test/realms/main")
        .setAudience("athyper-web")
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // expired 1 h ago
        .sign(privateKey);
}

// ─── Tests ──────────────────────────────────────────────────────

describe("AuthAdapter", () => {
    let testKeyPair: { publicKey: jose.KeyLike; privateKey: jose.KeyLike };

    beforeAll(async () => {
        testKeyPair = await jose.generateKeyPair("RS256");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ── verifyToken ─────────────────────────────────────────────

    it("verifyToken rejects expired JWT", async () => {
        const expiredToken = await createExpiredJwt(testKeyPair.privateKey);

        // Make the mocked jwtVerify throw an expiration error, simulating jose behaviour
        vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
            new jose.errors.JWTExpired('"exp" claim timestamp check failed', {}, "exp", "check_failed"),
        );

        const adapter = createAuthAdapter(baseConfig());

        await expect(adapter.verifyToken(expiredToken)).rejects.toThrow(
            jose.errors.JWTExpired,
        );
    });

    it("verifyToken rejects invalid signature", async () => {
        // Generate a DIFFERENT key pair so the signature won't match
        const otherKeyPair = await jose.generateKeyPair("RS256");

        const tokenFromWrongKey = await new jose.SignJWT({ sub: "user-1" })
            .setProtectedHeader({ alg: "RS256" })
            .setIssuer("https://idp.athyper.test/realms/main")
            .setAudience("athyper-web")
            .setExpirationTime("2h")
            .sign(otherKeyPair.privateKey);

        vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
            new jose.errors.JWSSignatureVerificationFailed(),
        );

        const adapter = createAuthAdapter(baseConfig());

        await expect(adapter.verifyToken(tokenFromWrongKey)).rejects.toThrow(
            jose.errors.JWSSignatureVerificationFailed,
        );
    });

    it("verifyToken resolves valid claims on success", async () => {
        const expectedClaims = {
            sub: "user-42",
            iss: "https://idp.athyper.test/realms/main",
            aud: "athyper-web",
            exp: Math.floor(Date.now() / 1000) + 3600,
        };

        vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
            payload: expectedClaims,
            protectedHeader: { alg: "RS256" },
            key: testKeyPair.publicKey,
        } as any);

        const adapter = createAuthAdapter(baseConfig());
        const claims = await adapter.verifyToken("valid-token-string");

        expect(claims).toEqual(expectedClaims);
        expect(claims.sub).toBe("user-42");
    });

    // ── getIssuerUrl ────────────────────────────────────────────

    it("getIssuerUrl returns configured URL", () => {
        const adapter = createAuthAdapter(baseConfig());

        expect(adapter.getIssuerUrl()).toBe("https://idp.athyper.test/realms/main");
    });

    it("getIssuerUrl normalises trailing slashes", () => {
        const adapter = createAuthAdapter(
            baseConfig({ issuerUrl: "https://idp.athyper.test/realms/main///" }),
        );

        expect(adapter.getIssuerUrl()).toBe("https://idp.athyper.test/realms/main");
    });

    // ── getJwksHealth ───────────────────────────────────────────

    it("getJwksHealth returns status for all realms", () => {
        const adapter = createAuthAdapter(
            baseConfig({
                additionalRealms: {
                    partner: {
                        issuerUrl: "https://idp.athyper.test/realms/partner",
                        clientId: "athyper-partner",
                    },
                },
            }),
        );

        const health = adapter.getJwksHealth();

        // Should have the default realm plus the additional realm
        expect(health).toHaveProperty("default");
        expect(health).toHaveProperty("partner");
        expect(health.default).toMatchObject({
            healthy: expect.any(Boolean),
            lastFetchAt: expect.any(Object), // null initially
            keyCount: expect.any(Number),
        });
        expect(health.partner).toMatchObject({
            healthy: expect.any(Boolean),
            keyCount: expect.any(Number),
        });
    });

    it("getJwksHealth returns status for specific realm", () => {
        const adapter = createAuthAdapter(
            baseConfig({
                additionalRealms: {
                    partner: {
                        issuerUrl: "https://idp.athyper.test/realms/partner",
                        clientId: "athyper-partner",
                    },
                },
            }),
        );

        const health = adapter.getJwksHealth("partner");

        expect(Object.keys(health)).toEqual(["partner"]);
        expect(health.partner.healthy).toBe(true); // no failures yet
    });

    // ── getVerifier ─────────────────────────────────────────────

    it("getVerifier returns realm-scoped verifier", async () => {
        const adapter = createAuthAdapter(
            baseConfig({
                additionalRealms: {
                    partner: {
                        issuerUrl: "https://idp.athyper.test/realms/partner",
                        clientId: "athyper-partner",
                    },
                },
            }),
        );

        const verifier = await adapter.getVerifier("partner");

        expect(verifier).toBeDefined();
        expect(typeof verifier.verifyJwt).toBe("function");
    });

    it("getVerifier falls back to default for unknown realm", async () => {
        const adapter = createAuthAdapter(baseConfig());

        const verifier = await adapter.getVerifier("nonexistent");

        expect(verifier).toBeDefined();
        expect(typeof verifier.verifyJwt).toBe("function");
    });

    it("getVerifier verifyJwt delegates to jose.jwtVerify with realm config", async () => {
        vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
            payload: { sub: "partner-user-1" },
            protectedHeader: { alg: "RS256" },
            key: testKeyPair.publicKey,
        } as any);

        const adapter = createAuthAdapter(
            baseConfig({
                additionalRealms: {
                    partner: {
                        issuerUrl: "https://idp.athyper.test/realms/partner",
                        clientId: "athyper-partner",
                    },
                },
            }),
        );

        const verifier = await adapter.getVerifier("partner");
        const result = await verifier.verifyJwt("partner-token");

        expect(result.claims).toEqual({ sub: "partner-user-1" });
        expect(jose.jwtVerify).toHaveBeenCalledWith(
            "partner-token",
            expect.any(Function),
            expect.objectContaining({
                issuer: "https://idp.athyper.test/realms/partner",
                audience: "athyper-partner",
            }),
        );
    });
});
