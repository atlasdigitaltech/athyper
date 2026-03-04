/**
 * Audit Redaction Pipeline
 *
 * Sanitizes audit events before persistence to prevent accidental
 * capture of secrets, tokens, and PII. Uses the platform MaskingService
 * for masking strategies.
 */

import { getTaxonomyEntry } from "./event-taxonomy.js";

import type { MaskingService } from "../../foundation/security/field-security/masking.service.js";
import type { AuditEvent } from "../../workflow-engine/audit/types.js";

// ============================================================================
// Constants
// ============================================================================

/** Current redaction rules version — increment when rules change */
export const REDACTION_VERSION = 1;

/** Keys that must never appear in audit event details */
const DENYLIST_KEYS = new Set([
  "password",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "authorization",
  "cookie",
  "api_key",
  "apiKey",
  "private_key",
  "privateKey",
  "client_secret",
  "clientSecret",
  "credentials",
  "ssn",
  "national_id",
  "bank_account",
  "credit_card",
]);

/** PII patterns to detect and mask in string values */
const PII_PATTERNS: Array<{
  name: string;
  regex: RegExp;
  replacement: (match: string) => string;
}> = [
  {
    name: "email",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: (match: string) => {
      const [local, domain] = match.split("@");
      if (!local || !domain) return "[REDACTED_EMAIL]";
      const visible = Math.min(2, local.length);
      return local.substring(0, visible) + "***@" + domain;
    },
  },
  {
    name: "phone",
    regex: /\+?\d{10,15}/g,
    replacement: (match: string) => {
      if (match.length <= 4) return match;
      return "*".repeat(match.length - 4) + match.slice(-4);
    },
  },
  {
    name: "iban",
    regex: /[A-Z]{2}\d{2}[A-Z0-9]{4,30}/g,
    replacement: (match: string) => {
      if (match.length <= 6) return match;
      return (
        match.substring(0, 4) + "*".repeat(match.length - 8) + match.slice(-4)
      );
    },
  },
];

// ============================================================================
// Types
// ============================================================================

export interface RedactionResult {
  /** The redacted event (immutable — original is not modified) */
  event: Omit<AuditEvent, "id">;

  /** Whether any redaction was applied */
  wasRedacted: boolean;

  /** Redaction rules version used */
  redactionVersion: number;
}

// ============================================================================
// Redaction Pipeline
// ============================================================================

export class AuditRedactionPipeline {
  constructor(private readonly masking: MaskingService) {}

  /**
   * Redact an audit event before persistence.
   * Returns a new event object — the original is never mutated.
   */
  redact(event: Omit<AuditEvent, "id">): RedactionResult {
    let wasRedacted = false;

    // Deep-clone the event to avoid mutation
    const redacted = structuredClone(event) as Omit<AuditEvent, "id"> & {
      is_redacted?: boolean;
      redaction_version?: number;
    };

    // 1. Sanitize `details` JSONB — strip denylist keys, mask PII
    if (redacted.details) {
      const result = this.sanitizeObject(
        redacted.details as Record<string, unknown>,
      );
      redacted.details = result.obj;
      if (result.changed) wasRedacted = true;
    }

    // 2. Sanitize `comment` field for PII patterns
    if (redacted.comment) {
      const result = this.maskPiiInString(redacted.comment);
      if (result !== redacted.comment) {
        redacted.comment = result;
        wasRedacted = true;
      }
    }

    // 3. Apply taxonomy-specific redaction rules
    const taxonomy = getTaxonomyEntry(redacted.eventType);
    if (taxonomy) {
      for (const fieldPath of taxonomy.redactionRules) {
        if (fieldPath === "ip_address" && redacted.ipAddress) {
          redacted.ipAddress = this.masking.mask(
            redacted.ipAddress,
            "partial",
            {
              visibleChars: 6,
              position: "start",
            },
          ) as string;
          wasRedacted = true;
        }
        if (fieldPath === "user_agent" && redacted.userAgent) {
          // Truncate user agent to browser family only
          redacted.userAgent = redacted.userAgent.split("/")[0] ?? "[REDACTED]";
          wasRedacted = true;
        }
      }
    }

    // 4. Sanitize actor email if present
    if (redacted.actor?.email) {
      const masked = this.maskPiiInString(redacted.actor.email);
      if (masked !== redacted.actor.email) {
        (redacted.actor as unknown as Record<string, unknown>).email = masked;
        wasRedacted = true;
      }
    }

    return {
      event: redacted,
      wasRedacted,
      redactionVersion: REDACTION_VERSION,
    };
  }

  /**
   * Recursively sanitize an object: remove denylist keys, mask PII in strings.
   */
  private sanitizeObject(obj: Record<string, unknown>): {
    obj: Record<string, unknown>;
    changed: boolean;
  } {
    let changed = false;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Strip denylist keys entirely
      if (DENYLIST_KEYS.has(key.toLowerCase())) {
        changed = true;
        result[key] = "[REDACTED]";
        continue;
      }

      if (typeof value === "string") {
        const masked = this.maskPiiInString(value);
        if (masked !== value) changed = true;
        result[key] = masked;
      } else if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        const nested = this.sanitizeObject(value as Record<string, unknown>);
        if (nested.changed) changed = true;
        result[key] = nested.obj;
      } else if (Array.isArray(value)) {
        const arr = value.map((item) => {
          if (typeof item === "string") {
            const masked = this.maskPiiInString(item);
            if (masked !== item) changed = true;
            return masked;
          }
          if (item !== null && typeof item === "object") {
            const nested = this.sanitizeObject(item as Record<string, unknown>);
            if (nested.changed) changed = true;
            return nested.obj;
          }
          return item;
        });
        result[key] = arr;
      } else {
        result[key] = value;
      }
    }

    return { obj: result, changed };
  }

  /**
   * Apply PII pattern masking to a string value.
   */
  private maskPiiInString(value: string): string {
    let result = value;
    for (const pattern of PII_PATTERNS) {
      result = result.replace(pattern.regex, pattern.replacement);
    }
    return result;
  }
}

/**
 * Factory to create a redaction pipeline with the default masking service.
 */
export function createRedactionPipeline(
  masking: MaskingService,
): AuditRedactionPipeline {
  return new AuditRedactionPipeline(masking);
}
