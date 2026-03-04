// framework/runtime/src/services/business/engines/event-store/domain/hash-chain.ts

/**
 * SHA-256 payload hashing and hash chain verification.
 * Ensures tamper evidence for the event store (v2.1 immutability requirement).
 */

/**
 * Compute SHA-256 hash of canonical JSON payload.
 * Uses sorted keys for deterministic output.
 */
export async function hashPayload(payload: unknown): Promise<string> {
  const canonical = canonicalizeJson(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hashBuffer);
}

/**
 * Verify that a payload matches its expected hash.
 */
export async function verifyHash(
  payload: unknown,
  expectedHash: string,
): Promise<boolean> {
  const actualHash = await hashPayload(payload);
  return timingSafeEqual(actualHash, expectedHash);
}

/**
 * Compute chain hash: H(previous_hash || current_payload_hash).
 * Used for sequential integrity verification within a partition.
 */
export async function computeChainHash(
  previousHash: string | null,
  currentPayloadHash: string,
): Promise<string> {
  const input = previousHash
    ? `${previousHash}:${currentPayloadHash}`
    : currentPayloadHash;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hashBuffer);
}

/**
 * Verify a chain of payload hashes is unbroken.
 * Returns the index of the first broken link, or -1 if valid.
 */
export async function verifyChain(
  payloadHashes: string[],
  chainHashes: string[],
): Promise<{ valid: boolean; brokenAt: number }> {
  if (payloadHashes.length !== chainHashes.length) {
    return { valid: false, brokenAt: 0 };
  }

  let previousHash: string | null = null;
  for (let i = 0; i < payloadHashes.length; i++) {
    const expectedChainHash = await computeChainHash(
      previousHash,
      payloadHashes[i]!,
    );
    if (expectedChainHash !== chainHashes[i]) {
      return { valid: false, brokenAt: i };
    }
    previousHash = chainHashes[i]!;
  }

  return { valid: true, brokenAt: -1 };
}

// --- Internal helpers ---

function canonicalizeJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((sorted, k) => {
          sorted[k] = (val as Record<string, unknown>)[k];
          return sorted;
        }, {});
    }
    return val;
  });
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Timing-safe string comparison to prevent timing attacks on hash verification.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
