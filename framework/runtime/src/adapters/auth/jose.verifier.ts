import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import type { AuthVerifier } from "./auth.types";

export type JoseVerifierOptions = {
    issuerUrl: string;
    clientId: string;
    allowedAlgs?: string[];
    clockToleranceSec?: number;
};

type AuthErrorCode = "AUTH_AUDIENCE_MISMATCH";

class AuthError extends Error {
    readonly code: AuthErrorCode;

    constructor(code: AuthErrorCode, message: string) {
        super(message);
        this.name = "AuthError";
        this.code = code;
    }
}

export function createJoseVerifier(opts: JoseVerifierOptions): AuthVerifier {
    const issuer = opts.issuerUrl.replace(/\/+$/, "");
    const jwksUrl = new URL(`${issuer}/protocol/openid-connect/certs`);
    const JWKS = createRemoteJWKSet(jwksUrl);

    const allowed = opts.allowedAlgs ?? ["RS256"];
    const tolerance = opts.clockToleranceSec ?? 5;

    return {
        async verifyJwt(token: string) {
            const { payload } = await jwtVerify(token, JWKS, {
                issuer,
                algorithms: allowed,
                clockTolerance: tolerance,
            });

            assertAudienceOrAzp(payload, opts.clientId);

            return { claims: payload as unknown as Record<string, unknown> };
        },
    };
}

function assertAudienceOrAzp(payload: JWTPayload, clientId: string) {
    const aud = payload.aud;
    const azp = payload.azp;

    const audOk =
        typeof aud === "string"
            ? aud === clientId
            : Array.isArray(aud)
                ? aud.includes(clientId)
                : false;

    const azpOk = typeof azp === "string" ? azp === clientId : false;

    if (!audOk && !azpOk) {
        const gotAud = Array.isArray(aud) ? aud.join(",") : String(aud ?? "");
        const gotAzp = String(azp ?? "");
        throw new AuthError(
            "AUTH_AUDIENCE_MISMATCH",
            `[auth] token audience mismatch (expected=${clientId}, aud=${gotAud}, azp=${gotAzp})`,
        );
    }
}