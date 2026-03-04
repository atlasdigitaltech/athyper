// framework/runtime/src/services/platform/foundation/iam/tenant-iam-profile.ts
//
// Defines and enforces tenant-level IAM security profiles.
// Ensures no tenant can silently downgrade below platform minimums.

// ─── Types ───────────────────────────────────────────────────────

export interface PasswordPolicy {
    minLength: number;
    history: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireDigit: boolean;
    requireSpecial: boolean;
}

export interface TenantIAMProfile {
    mfaRequired: boolean;
    allowedMfaTypes: ("totp" | "webauthn" | "sms" | "email")[];
    maxLoginFailures: number;
    lockoutDurationMinutes: number;
    passwordPolicy: PasswordPolicy;
}

// ─── Platform Minimums ───────────────────────────────────────────

/**
 * These are non-negotiable floor values.
 * No tenant profile may specify values weaker than these.
 */
export const PLATFORM_MINIMUMS: TenantIAMProfile = {
    mfaRequired: false, // platform default; tenants can *enable* but not disable if a higher policy requires it
    allowedMfaTypes: ["totp"],
    maxLoginFailures: 10,
    lockoutDurationMinutes: 5,
    passwordPolicy: {
        minLength: 8,
        history: 1,
        requireUppercase: true,
        requireLowercase: true,
        requireDigit: true,
        requireSpecial: false,
    },
};

// ─── Defaults ────────────────────────────────────────────────────

export const DEFAULT_IAM_PROFILE: TenantIAMProfile = {
    mfaRequired: false,
    allowedMfaTypes: ["totp", "webauthn"],
    maxLoginFailures: 5,
    lockoutDurationMinutes: 15,
    passwordPolicy: {
        minLength: 12,
        history: 5,
        requireUppercase: true,
        requireLowercase: true,
        requireDigit: true,
        requireSpecial: true,
    },
};

// ─── Validation ──────────────────────────────────────────────────

export class TenantIAMProfileViolation extends Error {
    constructor(
        public readonly field: string,
        public readonly reason: string,
        public readonly tenantValue: unknown,
        public readonly minimumValue: unknown,
    ) {
        super(`IAM profile violation: ${field} — ${reason} (got ${JSON.stringify(tenantValue)}, minimum ${JSON.stringify(minimumValue)})`);
        this.name = "TenantIAMProfileViolation";
    }
}

/**
 * Validates that a tenant IAM profile does not violate platform minimums.
 * Throws TenantIAMProfileViolation on first violation found.
 */
export function validateTenantIAMProfile(profile: TenantIAMProfile): void {
    const mins = PLATFORM_MINIMUMS;

    if (profile.maxLoginFailures > mins.maxLoginFailures) {
        throw new TenantIAMProfileViolation(
            "maxLoginFailures",
            "cannot exceed platform maximum (higher value = weaker security)",
            profile.maxLoginFailures,
            mins.maxLoginFailures,
        );
    }

    if (profile.lockoutDurationMinutes < mins.lockoutDurationMinutes) {
        throw new TenantIAMProfileViolation(
            "lockoutDurationMinutes",
            "cannot be less than platform minimum",
            profile.lockoutDurationMinutes,
            mins.lockoutDurationMinutes,
        );
    }

    const pp = profile.passwordPolicy;
    const mp = mins.passwordPolicy;

    if (pp.minLength < mp.minLength) {
        throw new TenantIAMProfileViolation("passwordPolicy.minLength", "below platform minimum", pp.minLength, mp.minLength);
    }
    if (pp.history < mp.history) {
        throw new TenantIAMProfileViolation("passwordPolicy.history", "below platform minimum", pp.history, mp.history);
    }
    if (mp.requireUppercase && !pp.requireUppercase) {
        throw new TenantIAMProfileViolation("passwordPolicy.requireUppercase", "platform requires uppercase", pp.requireUppercase, mp.requireUppercase);
    }
    if (mp.requireLowercase && !pp.requireLowercase) {
        throw new TenantIAMProfileViolation("passwordPolicy.requireLowercase", "platform requires lowercase", pp.requireLowercase, mp.requireLowercase);
    }
    if (mp.requireDigit && !pp.requireDigit) {
        throw new TenantIAMProfileViolation("passwordPolicy.requireDigit", "platform requires digit", pp.requireDigit, mp.requireDigit);
    }
    if (mp.requireSpecial && !pp.requireSpecial) {
        throw new TenantIAMProfileViolation("passwordPolicy.requireSpecial", "platform requires special character", pp.requireSpecial, mp.requireSpecial);
    }

    // Ensure allowedMfaTypes is not empty if MFA is required
    if (profile.mfaRequired && profile.allowedMfaTypes.length === 0) {
        throw new TenantIAMProfileViolation("allowedMfaTypes", "MFA is required but no types are allowed", profile.allowedMfaTypes, ["totp"]);
    }
}

// ─── Merge / Load ────────────────────────────────────────────────

/**
 * Merges a partial tenant profile with defaults, ensuring platform minimums are respected.
 */
export function mergeTenantIAMDefaults(partial: Partial<TenantIAMProfile>, defaults: TenantIAMProfile = DEFAULT_IAM_PROFILE): TenantIAMProfile {
    const merged: TenantIAMProfile = {
        mfaRequired: partial.mfaRequired ?? defaults.mfaRequired,
        allowedMfaTypes: partial.allowedMfaTypes ?? defaults.allowedMfaTypes,
        maxLoginFailures: partial.maxLoginFailures ?? defaults.maxLoginFailures,
        lockoutDurationMinutes: partial.lockoutDurationMinutes ?? defaults.lockoutDurationMinutes,
        passwordPolicy: {
            minLength: partial.passwordPolicy?.minLength ?? defaults.passwordPolicy.minLength,
            history: partial.passwordPolicy?.history ?? defaults.passwordPolicy.history,
            requireUppercase: partial.passwordPolicy?.requireUppercase ?? defaults.passwordPolicy.requireUppercase,
            requireLowercase: partial.passwordPolicy?.requireLowercase ?? defaults.passwordPolicy.requireLowercase,
            requireDigit: partial.passwordPolicy?.requireDigit ?? defaults.passwordPolicy.requireDigit,
            requireSpecial: partial.passwordPolicy?.requireSpecial ?? defaults.passwordPolicy.requireSpecial,
        },
    };

    // Enforce platform minimums (clamp values)
    merged.maxLoginFailures = Math.min(merged.maxLoginFailures, PLATFORM_MINIMUMS.maxLoginFailures);
    merged.lockoutDurationMinutes = Math.max(merged.lockoutDurationMinutes, PLATFORM_MINIMUMS.lockoutDurationMinutes);
    merged.passwordPolicy.minLength = Math.max(merged.passwordPolicy.minLength, PLATFORM_MINIMUMS.passwordPolicy.minLength);
    merged.passwordPolicy.history = Math.max(merged.passwordPolicy.history, PLATFORM_MINIMUMS.passwordPolicy.history);

    if (PLATFORM_MINIMUMS.passwordPolicy.requireUppercase) merged.passwordPolicy.requireUppercase = true;
    if (PLATFORM_MINIMUMS.passwordPolicy.requireLowercase) merged.passwordPolicy.requireLowercase = true;
    if (PLATFORM_MINIMUMS.passwordPolicy.requireDigit) merged.passwordPolicy.requireDigit = true;
    if (PLATFORM_MINIMUMS.passwordPolicy.requireSpecial) merged.passwordPolicy.requireSpecial = true;

    if (merged.mfaRequired && merged.allowedMfaTypes.length === 0) {
        merged.allowedMfaTypes = [...PLATFORM_MINIMUMS.allowedMfaTypes];
    }

    return merged;
}

/**
 * Load a tenant's IAM profile from the database.
 * Reads from core.tenant_profile.iam_profile JSONB column.
 */
export async function loadTenantIAMProfile(
    db: { query(sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }> },
    tenantId: string,
): Promise<TenantIAMProfile> {
    const result = await db.query(
        `SELECT iam_profile FROM core.tenant_profile WHERE tenant_id = $1`,
        [tenantId],
    );

    const raw = result.rows[0]?.iam_profile as Partial<TenantIAMProfile> | undefined;
    return mergeTenantIAMDefaults(raw ?? {});
}
