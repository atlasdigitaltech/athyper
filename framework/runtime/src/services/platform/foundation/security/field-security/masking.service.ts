/**
 * Masking Service
 *
 * Applies various masking strategies to field values for read access control.
 */

import { createHash } from "crypto";

import type { MaskConfig, MaskStrategy } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MASK_CHAR = "*";
const DEFAULT_VISIBLE_CHARS = 4;
const DEFAULT_HASH_ALGORITHM = "sha256";
const DEFAULT_HASH_LENGTH = 16;
const DEFAULT_REDACT_TEXT = "[REDACTED]";

// ============================================================================
// Masking Service
// ============================================================================

/**
 * Service for applying masking strategies to field values.
 */
export class MaskingService {
  /**
   * Apply masking strategy to a value
   *
   * @param value The value to mask
   * @param strategy The masking strategy to apply
   * @param config Optional strategy-specific configuration
   * @returns The masked value, or undefined if strategy is 'remove'
   */
  mask(value: unknown, strategy: MaskStrategy, config?: MaskConfig): unknown {
    // Null/undefined pass through as-is
    if (value === null || value === undefined) {
      return value;
    }

    switch (strategy) {
      case "null":
        return this.maskNull();

      case "remove":
        return this.maskRemove();

      case "redact":
        return this.maskRedact(value, config);

      case "hash":
        return this.maskHash(value, config);

      case "partial":
        return this.maskPartial(value, config);

      default:
        // Unknown strategy - return original
        return value;
    }
  }

  /**
   * Batch mask multiple values with the same strategy
   */
  maskMany(
    values: unknown[],
    strategy: MaskStrategy,
    config?: MaskConfig
  ): unknown[] {
    return values.map((v) => this.mask(v, strategy, config));
  }

  /**
   * Check if a strategy removes the field entirely
   */
  isRemoveStrategy(strategy: MaskStrategy): boolean {
    return strategy === "remove";
  }

  /**
   * Get display name for a masking strategy
   */
  getStrategyDisplayName(strategy: MaskStrategy): string {
    switch (strategy) {
      case "null":
        return "Null";
      case "remove":
        return "Remove";
      case "redact":
        return "Redact";
      case "hash":
        return "Hash";
      case "partial":
        return "Partial Mask";
      default:
        return strategy;
    }
  }

  // ============================================================================
  // Masking Strategy Implementations
  // ============================================================================

  /**
   * Null strategy: Returns null
   */
  private maskNull(): null {
    return null;
  }

  /**
   * Remove strategy: Returns undefined (signals field should be excluded)
   */
  private maskRemove(): undefined {
    return undefined;
  }

  /**
   * Redact strategy: Returns a placeholder string
   */
  private maskRedact(value: unknown, config?: MaskConfig): string {
    return config?.replacement ?? DEFAULT_REDACT_TEXT;
  }

  /**
   * Hash strategy: Returns a one-way hash of the value
   */
  private maskHash(value: unknown, config?: MaskConfig): string {
    const stringValue = this.toString(value);
    const algorithm = config?.algorithm ?? DEFAULT_HASH_ALGORITHM;
    const salt = config?.salt ?? "";
    const hashLength = config?.hashLength ?? DEFAULT_HASH_LENGTH;

    const hash = createHash(algorithm)
      .update(salt + stringValue)
      .digest("hex");

    // Truncate to configured length
    return hash.substring(0, hashLength);
  }

  /**
   * Partial strategy: Shows some characters, masks the rest
   */
  private maskPartial(value: unknown, config?: MaskConfig): string {
    const stringValue = this.toString(value);
    const visibleChars = config?.visibleChars ?? DEFAULT_VISIBLE_CHARS;
    const position = config?.position ?? "end";
    const maskChar = config?.maskChar ?? DEFAULT_MASK_CHAR;

    // If value is shorter than visible chars, mask entirely
    if (stringValue.length <= visibleChars) {
      return maskChar.repeat(stringValue.length);
    }

    const masked = maskChar.repeat(stringValue.length - visibleChars);

    if (position === "start") {
      // Show first N characters: "1234****"
      return stringValue.substring(0, visibleChars) + masked;
    } else {
      // Show last N characters: "****1234"
      return masked + stringValue.substring(stringValue.length - visibleChars);
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Convert any value to string for masking
   */
  private toString(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return "[object]";
      }
    }

    return String(value);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Default masking service instance
 */
export const defaultMaskingService = new MaskingService();
