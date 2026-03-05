/**
 * Canonical Money Utilities
 *
 * Deterministic money validation, formatting, rounding, and minor units lookup.
 * This module is the SINGLE SOURCE OF TRUTH for money handling.
 * Used by:
 *   - UI (MoneyRenderer: formatting + input masking)
 *   - API validation (server-side validators)
 *   - Posting engine (rounding before journal entries)
 *
 * Guarantees: edit → save → reload → totals always match.
 */

import type { MoneyConfig } from "./types.js";

// ============================================================================
// Currency Minor Units Lookup
// ============================================================================

/**
 * ISO 4217 minor units (decimal places) for currencies.
 * Only currencies that deviate from the default of 2 are listed.
 */
const MINOR_UNITS: Record<string, number> = {
    // 0 decimal places
    BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0,
    KRW: 0, PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0,
    XAF: 0, XOF: 0, XPF: 0,

    // 3 decimal places
    BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,

    // 4 decimal places (rare)
    CLF: 4, UYW: 4,
};

const DEFAULT_MINOR_UNITS = 2;

/**
 * Returns the number of minor units (decimal places) for a currency.
 * JPY → 0, KWD → 3, USD → 2, EUR → 2, etc.
 */
export function getMinorUnits(currencyCode: string): number {
    return MINOR_UNITS[currencyCode.toUpperCase()] ?? DEFAULT_MINOR_UNITS;
}

// ============================================================================
// Rounding
// ============================================================================

/**
 * Rounds a number using the specified rounding mode and scale.
 *
 * @param value - The numeric value to round
 * @param scale - Number of decimal places
 * @param mode - Rounding mode (default: HALF_UP)
 */
export function roundMoney(
    value: number,
    scale: number,
    mode: MoneyConfig["roundingMode"] = "HALF_UP",
): number {
    const factor = Math.pow(10, scale);
    const shifted = value * factor;

    let rounded: number;
    switch (mode) {
        case "HALF_UP":
            rounded = Math.round(shifted);
            break;
        case "HALF_EVEN": {
            // Banker's rounding: round to nearest even when exactly at .5
            const floored = Math.floor(shifted);
            const diff = shifted - floored;
            if (Math.abs(diff - 0.5) < Number.EPSILON) {
                rounded = floored % 2 === 0 ? floored : floored + 1;
            } else {
                rounded = Math.round(shifted);
            }
            break;
        }
        case "DOWN":
            rounded = value >= 0 ? Math.floor(shifted) : Math.ceil(shifted);
            break;
        case "UP":
            rounded = value >= 0 ? Math.ceil(shifted) : Math.floor(shifted);
            break;
        default:
            rounded = Math.round(shifted);
    }

    return rounded / factor;
}

// ============================================================================
// Scale Resolution
// ============================================================================

/**
 * Resolves the scale (decimal places) for a money field.
 *
 * @param config - Money configuration
 * @param currencyCode - ISO currency code (required when scaleMode=currency)
 */
export function resolveMoneyScale(
    config: Pick<MoneyConfig, "scaleMode" | "fixedScale">,
    currencyCode?: string,
): number {
    if (config.scaleMode === "fixed" && config.fixedScale != null) {
        return config.fixedScale;
    }
    // Default: use currency minor units
    return currencyCode ? getMinorUnits(currencyCode) : DEFAULT_MINOR_UNITS;
}

// ============================================================================
// Validation
// ============================================================================

export interface MoneyValidationResult {
    valid: boolean;
    errors: string[];
    /** The parsed and rounded value (if valid) */
    normalizedValue?: number;
}

/**
 * Validates a money value against its MoneyConfig.
 * Same logic for UI and server-side.
 *
 * Checks:
 *   1. Parseable as a number
 *   2. allowNegative check
 *   3. Rounding + scale enforcement
 *   4. Currency presence per currencyMode (when row data available)
 */
export function validateMoney(
    value: unknown,
    config: MoneyConfig,
    currencyCode?: string,
): MoneyValidationResult {
    const errors: string[] = [];

    // 1. Parse numeric
    if (value == null || value === "") {
        return { valid: true, errors: [] }; // nullable — let required validation handle it
    }

    const num = typeof value === "number" ? value : parseFloat(String(value));
    if (isNaN(num)) {
        return { valid: false, errors: ["Value must be a valid number"] };
    }

    // 2. Negative check
    if (config.allowNegative === false && num < 0) {
        errors.push("Negative amounts are not allowed");
    }

    // 3. Scale + rounding
    const scale = resolveMoneyScale(config, currencyCode);
    const rounded = roundMoney(num, scale, config.roundingMode);

    // Check if value exceeds scale precision (would be silently rounded)
    const scaleFactor = Math.pow(10, scale);
    const inputScaled = Math.round(num * scaleFactor * 1000) / 1000;
    const roundedScaled = Math.round(rounded * scaleFactor * 1000) / 1000;
    if (Math.abs(inputScaled - roundedScaled) > 0.001) {
        errors.push(`Value has more decimal places than allowed (max ${scale})`);
    }

    // 4. Currency presence
    if (config.currencyMode === "rowField" && !currencyCode) {
        errors.push("Currency must be specified for this field");
    }

    return {
        valid: errors.length === 0,
        errors,
        normalizedValue: rounded,
    };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Formats a money value for display.
 * Deterministic: same config + value + currency → same output.
 *
 * @param value - The numeric value
 * @param config - Money configuration
 * @param currencyCode - ISO currency code
 * @param locale - Optional locale (defaults to user locale)
 */
export function formatMoney(
    value: number,
    config: MoneyConfig,
    currencyCode: string,
    locale?: string,
): string {
    const scale = resolveMoneyScale(config, currencyCode);
    const rounded = roundMoney(value, scale, config.roundingMode);

    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: currencyCode,
            minimumFractionDigits: scale,
            maximumFractionDigits: scale,
        }).format(rounded);
    } catch {
        // Fallback for unknown currencies
        return `${currencyCode} ${rounded.toFixed(scale)}`;
    }
}

/**
 * Formats a money value as a plain number string (for input fields).
 * No currency symbol, just the number with correct scale.
 */
export function formatMoneyPlain(
    value: number,
    config: MoneyConfig,
    currencyCode?: string,
): string {
    const scale = resolveMoneyScale(config, currencyCode);
    const rounded = roundMoney(value, scale, config.roundingMode);
    return rounded.toFixed(scale);
}
