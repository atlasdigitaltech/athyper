/**
 * ExternalShareToken — Value object representing a signed JWT-scoped access token.
 *
 * This model encapsulates the token generation and verification logic.
 * The raw token is a base64url-encoded random string, stored as SHA-256 hash.
 */

export interface ExternalShareTokenPayload {
    /** Token ID (UUID) */
    jti: string;
    /** Issuing tenant ID */
    iss: string;
    /** Target email */
    sub: string;
    /** Entity type */
    ent: string;
    /** Entity ID */
    eid: string;
    /** Permission level */
    perm: "view" | "edit";
    /** Issued at (Unix timestamp) */
    iat: number;
    /** Expires at (Unix timestamp) */
    exp: number;
}

/**
 * Encode a token payload into a simple URL-safe string.
 * Note: This is NOT a full JWT — it's a compact representation
 * for embedding in share links. The actual authentication is
 * done by verifying the token hash against the database.
 */
export function encodeShareTokenPayload(payload: ExternalShareTokenPayload): string {
    const json = JSON.stringify(payload);
    return Buffer.from(json).toString("base64url");
}

/**
 * Decode a share token payload from a URL-safe string.
 */
export function decodeShareTokenPayload(encoded: string): ExternalShareTokenPayload | undefined {
    try {
        const json = Buffer.from(encoded, "base64url").toString("utf-8");
        return JSON.parse(json) as ExternalShareTokenPayload;
    } catch {
        return undefined;
    }
}
