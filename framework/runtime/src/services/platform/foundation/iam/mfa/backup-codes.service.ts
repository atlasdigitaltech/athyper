/**
 * Backup Codes Service
 *
 * Generates and verifies one-time use recovery codes for MFA.
 * Codes are stored as bcrypt hashes for security.
 */

import { randomBytes, timingSafeEqual } from "crypto";

import type { IBackupCodesService, BackupCodesResult } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Default number of backup codes to generate
 */
const DEFAULT_CODE_COUNT = 10;

/**
 * Code format: XXXX-XXXX (8 alphanumeric characters with hyphen)
 */
const CODE_LENGTH = 8;
const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes ambiguous: I, O, 0, 1

/**
 * bcrypt cost factor for hashing backup codes
 */
const _BCRYPT_ROUNDS = 10;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a random code from charset
 */
function generateCode(length: number): string {
  const bytes = randomBytes(length);
  let code = "";

  for (let i = 0; i < length; i++) {
    code += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
  }

  return code;
}

/**
 * Format code with hyphen (XXXX-XXXX)
 */
function formatCode(code: string): string {
  if (code.length === 8) {
    return `${code.substring(0, 4)}-${code.substring(4)}`;
  }
  return code;
}

/**
 * Normalize code for verification (remove hyphens, uppercase)
 */
function normalizeCode(code: string): string {
  return code.replace(/-/g, "").toUpperCase().trim();
}

/**
 * Simple bcrypt-like hash using PBKDF2
 * (For production, use actual bcrypt library)
 */
async function hashCode(code: string): Promise<string> {
  const { pbkdf2 } = await import("crypto");
  const salt = randomBytes(16);

  return new Promise((resolve, reject) => {
    pbkdf2(code, salt, 100000, 32, "sha256", (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`$pbkdf2$${salt.toString("hex")}$${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Verify code against hash
 */
async function verifyCodeHash(code: string, hash: string): Promise<boolean> {
  const { pbkdf2 } = await import("crypto");

  if (!hash.startsWith("$pbkdf2$")) {
    return false;
  }

  const parts = hash.split("$");
  if (parts.length !== 4) {
    return false;
  }

  const salt = Buffer.from(parts[2], "hex");
  const storedKey = Buffer.from(parts[3], "hex");

  return new Promise((resolve, reject) => {
    pbkdf2(code, salt, 100000, 32, "sha256", (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        try {
          resolve(timingSafeEqual(derivedKey, storedKey));
        } catch {
          resolve(false);
        }
      }
    });
  });
}

// ============================================================================
// Backup Codes Service Implementation
// ============================================================================

export class BackupCodesService implements IBackupCodesService {
  private readonly codeCount: number;

  constructor(codeCount: number = DEFAULT_CODE_COUNT) {
    this.codeCount = codeCount;
  }

  /**
   * Generate a set of backup codes
   *
   * @param count - Number of codes to generate (default: 10)
   * @returns Plain text codes (display once, then hash for storage)
   */
  generate(count?: number): BackupCodesResult {
    const numCodes = count ?? this.codeCount;
    const codes: string[] = [];

    for (let i = 0; i < numCodes; i++) {
      const code = generateCode(CODE_LENGTH);
      codes.push(formatCode(code));
    }

    return {
      codes,
      count: numCodes,
      createdAt: new Date(),
    };
  }

  /**
   * Hash a backup code for secure storage
   *
   * @param code - Plain text code
   * @returns Hashed code
   */
  async hash(code: string): Promise<string> {
    const normalized = normalizeCode(code);
    return hashCode(normalized);
  }

  /**
   * Verify a backup code against stored hash
   *
   * @param code - Plain text code entered by user
   * @param codeHash - Stored hash
   * @returns True if code matches
   */
  async verify(code: string, codeHash: string): Promise<boolean> {
    const normalized = normalizeCode(code);
    return verifyCodeHash(normalized, codeHash);
  }

  /**
   * Check if a string looks like a backup code
   * (Used to differentiate from TOTP codes)
   */
  isBackupCodeFormat(code: string): boolean {
    const normalized = normalizeCode(code);
    // Backup codes are 8 characters, TOTP codes are 6 digits
    return normalized.length === 8 && /^[A-Z0-9]+$/.test(normalized);
  }

  /**
   * Validate code format
   */
  validateFormat(code: string): { valid: boolean; error?: string } {
    const normalized = normalizeCode(code);

    if (normalized.length !== CODE_LENGTH) {
      return { valid: false, error: `Code must be ${CODE_LENGTH} characters` };
    }

    if (!/^[A-Z0-9]+$/.test(normalized)) {
      return { valid: false, error: "Code contains invalid characters" };
    }

    return { valid: true };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a backup codes service instance
 */
export function createBackupCodesService(codeCount?: number): BackupCodesService {
  return new BackupCodesService(codeCount);
}

// ============================================================================
// Exports
// ============================================================================

export { normalizeCode, formatCode };
