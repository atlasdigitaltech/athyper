/**
 * TOTP Service
 *
 * Time-based One-Time Password implementation following RFC 6238.
 * Uses HMAC-SHA1 by default (compatible with Google Authenticator, Authy, etc.)
 */

import { createHmac, randomBytes } from "crypto";

import type { ITotpService, TotpConfig, TotpSetupData, TotpVerifyResult } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: TotpConfig = {
  issuer: "athyper",
  digits: 6,
  period: 30,
  algorithm: "SHA1",
  window: 1,
};

// Base32 alphabet (RFC 4648)
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Encode bytes to base32
 */
function encodeBase32(buffer: Buffer): string {
  let result = "";
  let bits = 0;
  let value = 0;

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return result;
}

/**
 * Decode base32 to bytes
 */
function decodeBase32(encoded: string): Buffer {
  const normalized = encoded.toUpperCase().replace(/=+$/, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue; // Skip invalid characters

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Convert number to 8-byte buffer (big-endian)
 */
function intToBuffer(num: number): Buffer {
  const buffer = Buffer.alloc(8);
  let remaining = num;

  for (let i = 7; i >= 0; i--) {
    buffer[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }

  return buffer;
}

/**
 * Generate HMAC hash
 */
function hmac(secret: Buffer, counter: Buffer, algorithm: string): Buffer {
  const algo = algorithm.toLowerCase().replace("-", "");
  return createHmac(algo, secret).update(counter).digest();
}

/**
 * Extract OTP from HMAC result (dynamic truncation)
 */
function truncate(hash: Buffer, digits: number): string {
  const offset = hash[hash.length - 1] & 0x0f;

  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
}

// ============================================================================
// TOTP Service Implementation
// ============================================================================

export class TotpService implements ITotpService {
  private readonly config: TotpConfig;

  constructor(config?: Partial<TotpConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a cryptographically secure random secret
   *
   * @returns Base32-encoded secret (20 bytes = 160 bits)
   */
  generateSecret(): string {
    // Generate 20 random bytes (160 bits, standard for TOTP)
    const bytes = randomBytes(20);
    return encodeBase32(bytes);
  }

  /**
   * Generate setup data for authenticator app enrollment
   *
   * @param secret - Base32-encoded secret
   * @param accountName - User's account identifier (email or username)
   * @param issuer - Optional issuer override
   * @returns Setup data including otpauth URL and QR code
   */
  async generateSetupData(
    secret: string,
    accountName: string,
    issuer?: string
  ): Promise<TotpSetupData> {
    const effectiveIssuer = issuer ?? this.config.issuer;

    // Build otpauth URL (RFC 6238 / Google Authenticator format)
    const params = new URLSearchParams({
      secret: secret,
      issuer: effectiveIssuer,
      algorithm: this.config.algorithm,
      digits: this.config.digits.toString(),
      period: this.config.period.toString(),
    });

    const encodedIssuer = encodeURIComponent(effectiveIssuer);
    const encodedAccount = encodeURIComponent(accountName);
    const otpauthUrl = `otpauth://totp/${encodedIssuer}:${encodedAccount}?${params.toString()}`;

    // Generate QR code as data URL
    // Using a simple SVG-based QR code generation (no external dependencies)
    const qrCodeDataUrl = await this.generateQrCodeDataUrl(otpauthUrl);

    return {
      secret,
      otpauthUrl,
      qrCodeDataUrl,
      issuer: effectiveIssuer,
      accountName,
    };
  }

  /**
   * Verify a TOTP code
   *
   * @param secret - Base32-encoded secret
   * @param code - 6-digit code from authenticator
   * @returns Verification result with time delta if valid
   */
  verify(secret: string, code: string): TotpVerifyResult {
    // Normalize code (remove spaces, ensure string)
    const normalizedCode = code.replace(/\s/g, "").trim();

    // Validate code format
    if (!/^\d{6}$/.test(normalizedCode)) {
      return { valid: false };
    }

    const secretBuffer = decodeBase32(secret);
    const now = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(now / this.config.period);

    // Check current and adjacent time windows
    for (let delta = -this.config.window; delta <= this.config.window; delta++) {
      const counter = intToBuffer(timeStep + delta);
      const hash = hmac(secretBuffer, counter, this.config.algorithm);
      const expectedCode = truncate(hash, this.config.digits);

      if (expectedCode === normalizedCode) {
        return { valid: true, delta };
      }
    }

    return { valid: false };
  }

  /**
   * Generate current TOTP code (for testing/debugging)
   *
   * @param secret - Base32-encoded secret
   * @returns Current 6-digit code
   */
  generate(secret: string): string {
    const secretBuffer = decodeBase32(secret);
    const now = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(now / this.config.period);
    const counter = intToBuffer(timeStep);
    const hash = hmac(secretBuffer, counter, this.config.algorithm);
    return truncate(hash, this.config.digits);
  }

  /**
   * Get seconds remaining until current code expires
   */
  getSecondsRemaining(): number {
    const now = Math.floor(Date.now() / 1000);
    return this.config.period - (now % this.config.period);
  }

  /**
   * Generate QR code as SVG data URL
   *
   * This is a simplified QR code generator. For production,
   * consider using a library like 'qrcode' for better compatibility.
   */
  private async generateQrCodeDataUrl(_data: string): Promise<string> {
    // For a production implementation, use a proper QR code library
    // This placeholder returns a simple SVG with instructions

    // Simple QR placeholder - in production, use 'qrcode' package:
    // import QRCode from 'qrcode';
    // return QRCode.toDataURL(data);

    // For now, return a placeholder indicating manual entry is needed
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <rect width="200" height="200" fill="#fff"/>
        <rect x="10" y="10" width="180" height="180" fill="#f0f0f0" rx="10"/>
        <text x="100" y="90" text-anchor="middle" font-family="sans-serif" font-size="12">
          QR Code
        </text>
        <text x="100" y="110" text-anchor="middle" font-family="sans-serif" font-size="10">
          Use manual entry
        </text>
        <text x="100" y="130" text-anchor="middle" font-family="sans-serif" font-size="8" fill="#666">
          or install qrcode package
        </text>
      </svg>
    `.trim();

    const base64 = Buffer.from(svg).toString("base64");
    return `data:image/svg+xml;base64,${base64}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a TOTP service instance
 */
export function createTotpService(config?: Partial<TotpConfig>): TotpService {
  return new TotpService(config);
}

// ============================================================================
// Exports
// ============================================================================

export { encodeBase32, decodeBase32 };
