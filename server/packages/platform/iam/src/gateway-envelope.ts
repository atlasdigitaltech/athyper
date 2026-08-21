import { createHmac, timingSafeEqual } from "node:crypto";
import { isIamPlane, type IamPlane } from "./iam-contracts.js";

export interface GatewayVerificationEnvelope {
  readonly version: 1;
  readonly planeKey: IamPlane;
  readonly issuer: string;
  readonly audience: string;
  readonly subject: string;
  readonly tokenHash: string;
  readonly verifiedAt: number;
  readonly expiresAt: number;
  readonly nonce: string;
}

export interface SignedGatewayEnvelope {
  readonly payload: string;
  readonly signature: string;
}

export interface GatewayEnvelopeVerificationInput {
  readonly now: number;
  readonly planeKey: IamPlane;
  readonly token: string;
  readonly issuer: string;
  readonly audience: string | readonly string[];
  readonly subject: string;
  /** Atomically records the nonce until expiry and returns false when it was already consumed. */
  readonly consumeNonce: (nonce: string, expiresAt: number) => Promise<boolean>;
  readonly clockSkewSeconds?: number;
  readonly maxTtlSeconds?: number;
}

const DEFAULT_MAX_TTL_SECONDS = 30;
const DEFAULT_CLOCK_SKEW_SECONDS = 5;

export function signGatewayEnvelope(envelope: GatewayVerificationEnvelope, secret: Uint8Array): SignedGatewayEnvelope {
  validateEnvelope(envelope, envelope.verifiedAt, 0, DEFAULT_MAX_TTL_SECONDS);
  if (secret.byteLength < 32) throw new TypeError("Gateway envelope secret must be at least 256 bits");
  const payload = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  return Object.freeze({ payload, signature: signature(payload, secret) });
}

export async function verifyGatewayEnvelope(signed: SignedGatewayEnvelope, secret: Uint8Array, input: GatewayEnvelopeVerificationInput): Promise<GatewayVerificationEnvelope> {
  if (secret.byteLength < 32) throw new TypeError("Gateway envelope secret must be at least 256 bits");
  const expected = Buffer.from(signature(signed.payload, secret), "base64url");
  const actual = Buffer.from(signed.signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Gateway envelope signature is invalid");
  let envelope: GatewayVerificationEnvelope;
  try { envelope = JSON.parse(Buffer.from(signed.payload, "base64url").toString("utf8")) as GatewayVerificationEnvelope; }
  catch { throw new Error("Gateway envelope payload is invalid"); }
  validateEnvelope(envelope, input.now, input.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS, input.maxTtlSeconds ?? DEFAULT_MAX_TTL_SECONDS);
  if (envelope.planeKey !== input.planeKey) throw new Error("Gateway envelope plane mismatch");
  if (envelope.tokenHash !== tokenHash(input.token)) throw new Error("Gateway envelope token mismatch");
  if (envelope.issuer !== input.issuer) throw new Error("Gateway envelope issuer mismatch");
  const audiences = typeof input.audience === "string" ? [input.audience] : input.audience;
  if (!audiences.includes(envelope.audience)) throw new Error("Gateway envelope audience mismatch");
  if (envelope.subject !== input.subject) throw new Error("Gateway envelope subject mismatch");
  if (!await input.consumeNonce(envelope.nonce, envelope.expiresAt)) throw new Error("Gateway envelope replay detected");
  return Object.freeze(envelope);
}

export function tokenHash(token: string): string {
  return createHmac("sha256", "athyper-gateway-token-binding-v1").update(token).digest("hex");
}

function signature(payload: string, secret: Uint8Array): string {
  return createHmac("sha256", secret).update(`v1.${payload}`).digest("base64url");
}
function validateEnvelope(value: GatewayVerificationEnvelope, now: number, clockSkewSeconds: number, maxTtlSeconds: number): void {
  if (!value || typeof value !== "object" || value.version !== 1 || !isIamPlane(value.planeKey)
    || !nonEmpty(value.issuer, 2048) || !nonEmpty(value.audience, 256) || !nonEmpty(value.subject, 512)
    || !nonEmpty(value.nonce, 256) || !/^[a-f0-9]{64}$/.test(value.tokenHash)) throw new Error("Gateway envelope claims are invalid");
  if (!Number.isSafeInteger(clockSkewSeconds) || clockSkewSeconds < 0 || clockSkewSeconds > 60
    || !Number.isSafeInteger(maxTtlSeconds) || maxTtlSeconds < 1 || maxTtlSeconds > 300) throw new TypeError("Gateway envelope verification policy is invalid");
  if (!Number.isSafeInteger(value.verifiedAt) || !Number.isSafeInteger(value.expiresAt)
    || value.expiresAt <= value.verifiedAt || value.expiresAt - value.verifiedAt > maxTtlSeconds
    || value.verifiedAt > now + clockSkewSeconds || value.expiresAt < now - clockSkewSeconds) throw new Error("Gateway envelope has expired or has invalid timing");
}

function nonEmpty(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength;
}
