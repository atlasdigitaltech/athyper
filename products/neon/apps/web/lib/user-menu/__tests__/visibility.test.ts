import { describe, expect, it } from "vitest";

import {
    computeVisibility,
    deriveCapabilities,
    CAP,
    type MenuVisibilityInput,
} from "../visibility";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<MenuVisibilityInput> = {}): MenuVisibilityInput {
    return {
        personas: [],
        isPlatformAdmin: false,
        platformRoles: [],
        featureFlags: {},
        modules: [],
        environment: "production",
        ...overrides,
    };
}

// ─── deriveCapabilities ──────────────────────────────────────────────────────

describe("deriveCapabilities", () => {
    it("grants nothing to a plain viewer", () => {
        const caps = deriveCapabilities(makeInput({ personas: ["viewer"] }));
        expect(caps.size).toBe(0);
    });

    it("grants all tenant caps to tenant_admin", () => {
        const caps = deriveCapabilities(makeInput({ personas: ["tenant_admin"] }));
        expect(caps.has(CAP.TENANT_PROFILE_READ)).toBe(true);
        expect(caps.has(CAP.SUBSCRIPTION_READ)).toBe(true);
        expect(caps.has(CAP.TENANT_SWITCH)).toBe(true);
        expect(caps.has(CAP.DIAGNOSTICS_READ)).toBe(true);
        expect(caps.has(CAP.LEGAL_PROFILE_READ)).toBe(true);
    });

    it("grants legal profile to finance_admin", () => {
        const caps = deriveCapabilities(makeInput({ personas: ["finance_admin"] }));
        expect(caps.has(CAP.LEGAL_PROFILE_READ)).toBe(true);
        // But not tenant profile
        expect(caps.has(CAP.TENANT_PROFILE_READ)).toBe(false);
    });

    it("grants legal profile to compliance_officer", () => {
        const caps = deriveCapabilities(makeInput({ personas: ["compliance_officer"] }));
        expect(caps.has(CAP.LEGAL_PROFILE_READ)).toBe(true);
    });

    it("grants everything to platform admin", () => {
        const caps = deriveCapabilities(makeInput({ isPlatformAdmin: true }));
        expect(caps.has(CAP.TENANT_PROFILE_READ)).toBe(true);
        expect(caps.has(CAP.SUBSCRIPTION_READ)).toBe(true);
        expect(caps.has(CAP.TENANT_SWITCH)).toBe(true);
        expect(caps.has(CAP.DIAGNOSTICS_READ)).toBe(true);
        expect(caps.has(CAP.LEGAL_PROFILE_READ)).toBe(true);
        expect(caps.has(CAP.VIEWPORT_DEV)).toBe(true);
    });

    it("grants viewport in local environment", () => {
        const caps = deriveCapabilities(makeInput({ environment: "local" }));
        expect(caps.has(CAP.VIEWPORT_DEV)).toBe(true);
    });

    it("grants viewport in development environment", () => {
        const caps = deriveCapabilities(makeInput({ environment: "development" }));
        expect(caps.has(CAP.VIEWPORT_DEV)).toBe(true);
    });

    it("does not grant viewport in production for regular users", () => {
        const caps = deriveCapabilities(makeInput({ personas: ["viewer"], environment: "production" }));
        expect(caps.has(CAP.VIEWPORT_DEV)).toBe(false);
    });
});

// ─── computeVisibility ───────────────────────────────────────────────────────

describe("computeVisibility", () => {
    it("returns all false for a plain viewer in production", () => {
        const result = computeVisibility(makeInput({ personas: ["viewer"] }));
        expect(result).toEqual({
            tenantProfile: false,
            legalProfile: false,
            subscription: false,
            switchTenant: false,
            diagnostics: false,
            savedSuppliers: false,
            viewport: false,
        });
    });

    it("returns full access for tenant_admin", () => {
        const result = computeVisibility(makeInput({ personas: ["tenant_admin"] }));
        expect(result.tenantProfile).toBe(true);
        expect(result.legalProfile).toBe(true);
        expect(result.subscription).toBe(true);
        expect(result.switchTenant).toBe(true);
        expect(result.diagnostics).toBe(true);
    });

    it("gates savedSuppliers behind feature flag", () => {
        const without = computeVisibility(makeInput({ personas: ["tenant_admin"] }));
        expect(without.savedSuppliers).toBe(false);

        const withFlag = computeVisibility(
            makeInput({
                personas: ["tenant_admin"],
                featureFlags: { PROCUREMENT_MODULE_ENABLED: true },
            }),
        );
        expect(withFlag.savedSuppliers).toBe(true);
    });

    it("does not grant savedSuppliers when flag is false", () => {
        const result = computeVisibility(
            makeInput({
                personas: ["tenant_admin"],
                featureFlags: { PROCUREMENT_MODULE_ENABLED: false },
            }),
        );
        expect(result.savedSuppliers).toBe(false);
    });

    it("grants viewport in local env for any user", () => {
        const result = computeVisibility(makeInput({ personas: ["viewer"], environment: "local" }));
        expect(result.viewport).toBe(true);
    });

    it("grants all access for platform admin", () => {
        const result = computeVisibility(makeInput({ isPlatformAdmin: true }));
        expect(result.tenantProfile).toBe(true);
        expect(result.legalProfile).toBe(true);
        expect(result.subscription).toBe(true);
        expect(result.switchTenant).toBe(true);
        expect(result.diagnostics).toBe(true);
        expect(result.viewport).toBe(true);
    });

    it("requester persona gets no management access", () => {
        const result = computeVisibility(makeInput({ personas: ["requester"] }));
        expect(result.tenantProfile).toBe(false);
        expect(result.legalProfile).toBe(false);
        expect(result.subscription).toBe(false);
        expect(result.diagnostics).toBe(false);
    });
});
