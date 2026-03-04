// CSRF double-submit validation tests.
// Tests the CSRF utility logic inline (same logic as products/neon/apps/web/lib/csrf.ts).

import { randomUUID } from "node:crypto";

// ─── Inline CSRF utilities (mirrors products/neon/apps/web/lib/csrf.ts) ───

function generateCsrfToken(): string {
    return randomUUID();
}

function validateCsrf(headerToken: string | null | undefined, cookieToken: string | null | undefined): boolean {
    if (!headerToken || !cookieToken) return false;
    if (headerToken.length === 0 || cookieToken.length === 0) return false;
    return headerToken === cookieToken;
}

// ─── Tests ──────────────────────────────────────────────────────

describe("CSRF utilities", () => {
    // ── generateCsrfToken ─────────────────────────────────────────

    it("generates a non-empty string", () => {
        const token = generateCsrfToken();
        expect(token).toBeDefined();
        expect(typeof token).toBe("string");
        expect(token.length).toBeGreaterThan(0);
    });

    it("generates unique tokens", () => {
        const tokens = new Set(Array.from({ length: 50 }, () => generateCsrfToken()));
        expect(tokens.size).toBe(50);
    });

    it("generates UUID-formatted tokens", () => {
        const token = generateCsrfToken();
        // UUID v4 format: 8-4-4-4-12 hex chars
        expect(token).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
    });

    // ── validateCsrf ──────────────────────────────────────────────

    describe("validateCsrf", () => {
        it("returns true when header and cookie match", () => {
            const token = "valid-csrf-token-123";
            expect(validateCsrf(token, token)).toBe(true);
        });

        it("returns false when header and cookie differ", () => {
            expect(validateCsrf("token-a", "token-b")).toBe(false);
        });

        it("returns false when header is null", () => {
            expect(validateCsrf(null, "cookie-token")).toBe(false);
        });

        it("returns false when cookie is null", () => {
            expect(validateCsrf("header-token", null)).toBe(false);
        });

        it("returns false when both are null", () => {
            expect(validateCsrf(null, null)).toBe(false);
        });

        it("returns false when header is undefined", () => {
            expect(validateCsrf(undefined, "cookie-token")).toBe(false);
        });

        it("returns false when cookie is undefined", () => {
            expect(validateCsrf("header-token", undefined)).toBe(false);
        });

        it("returns false when header is empty string", () => {
            expect(validateCsrf("", "cookie-token")).toBe(false);
        });

        it("returns false when cookie is empty string", () => {
            expect(validateCsrf("header-token", "")).toBe(false);
        });

        it("returns false when both are empty strings", () => {
            expect(validateCsrf("", "")).toBe(false);
        });

        it("is case-sensitive", () => {
            expect(validateCsrf("ABC-123", "abc-123")).toBe(false);
        });

        it("rejects partial match (prefix attack)", () => {
            expect(validateCsrf("token-abc", "token-abcdef")).toBe(false);
        });

        it("rejects partial match (suffix attack)", () => {
            expect(validateCsrf("xtoken-abc", "token-abc")).toBe(false);
        });
    });
});
