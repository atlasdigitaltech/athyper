import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "dew1";
const LEGACY_KEY_ID = "legacy";
const DEFAULT_TTL_MS = 15 * 60_000;
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface DocumentEditWorkspaceScope {
  tenantId: string;
  principalId: string;
  entityCode: string;
  recordId: string;
  permissionStamp: string;
  planHash: string;
  profile: "edit" | "view" | "approve" | "create";
  expiresAt: number;
}

export type DocumentEditWorkspaceTokenInspection =
  | { valid: true; scope: DocumentEditWorkspaceScope; keyId: string }
  | { valid: false; reason: "malformed" | "unknown_key" | "bad_signature" | "expired" };

/**
 * Mint a key-ID-bearing token. A legacy single secret remains supported as
 * key ID `legacy`; a JSON key ring enables rotation without invalidating
 * tokens minted by the previous active key.
 */
export function mintDocumentEditWorkspaceToken(
  input: Omit<DocumentEditWorkspaceScope, "expiresAt"> & { ttlMs?: number },
): string | null {
  if (!input.planHash.trim() || !input.permissionStamp.trim()) return null;
  const signingKey = activeWorkspaceSigningKey();
  if (!signingKey) return null;
  const payload: DocumentEditWorkspaceScope = {
    tenantId: input.tenantId,
    principalId: input.principalId,
    entityCode: input.entityCode,
    recordId: input.recordId,
    permissionStamp: input.permissionStamp,
    planHash: input.planHash,
    profile: input.profile,
    expiresAt: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signedValue = `${signingKey.keyId}.${encoded}`;
  return `${TOKEN_VERSION}.${signedValue}.${sign(signedValue, signingKey.secret)}`;
}

export function inspectDocumentEditWorkspaceToken(token: string): DocumentEditWorkspaceTokenInspection {
  const parts = token.split(".");
  if (parts[0] !== TOKEN_VERSION) return { valid: false, reason: "malformed" };

  const keys = workspaceTokenKeys();
  if (parts.length === 4) {
    const [, keyId, encoded, supplied] = parts;
    if (!keyId || !KEY_ID_RE.test(keyId) || !encoded || !supplied) return { valid: false, reason: "malformed" };
    const secret = keys.get(keyId);
    if (!secret) return { valid: false, reason: "unknown_key" };
    const signedValue = `${keyId}.${encoded}`;
    if (!signatureMatches(signedValue, supplied, secret)) return { valid: false, reason: "bad_signature" };
    return inspectPayload(encoded, keyId);
  }

  // Compatibility for pre-rotation dew1.<payload>.<signature> tokens. Try all
  // configured verification keys without ever logging or returning the token.
  if (parts.length === 3) {
    const [, encoded, supplied] = parts;
    if (!encoded || !supplied) return { valid: false, reason: "malformed" };
    for (const [keyId, secret] of keys) {
      if (signatureMatches(encoded, supplied, secret)) return inspectPayload(encoded, keyId);
    }
    return { valid: false, reason: "bad_signature" };
  }

  return { valid: false, reason: "malformed" };
}

function inspectPayload(encoded: string, keyId: string): DocumentEditWorkspaceTokenInspection {
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
    if (!isScope(payload)) return { valid: false, reason: "malformed" };
    if (payload.expiresAt <= Date.now()) return { valid: false, reason: "expired" };
    return { valid: true, scope: payload, keyId };
  } catch {
    return { valid: false, reason: "malformed" };
  }
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function signatureMatches(value: string, supplied: string, secret: string): boolean {
  const expected = sign(value, secret);
  return expected.length === supplied.length
    && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function activeWorkspaceSigningKey(): { keyId: string; secret: string } | null {
  const keys = workspaceTokenKeys();
  const requested = process.env.DOCUMENT_EDIT_WORKSPACE_TOKEN_ACTIVE_KID?.trim();
  if (requested) {
    const secret = keys.get(requested);
    return secret ? { keyId: requested, secret } : null;
  }
  if (keys.size !== 1) return null;
  const entry = keys.entries().next().value as [string, string] | undefined;
  return entry ? { keyId: entry[0], secret: entry[1] } : null;
}

function workspaceTokenKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const configured = process.env.DOCUMENT_EDIT_WORKSPACE_TOKEN_KEYS?.trim();
  if (configured) {
    try {
      const parsed = JSON.parse(configured) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [keyId, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (KEY_ID_RE.test(keyId) && typeof value === "string" && value.length >= 32) keys.set(keyId, value);
        }
      }
    } catch {
      // Invalid key-ring configuration fails closed unless the legacy secret
      // below is independently configured.
    }
  }
  const legacySecret = process.env.DOCUMENT_EDIT_WORKSPACE_TOKEN_SECRET;
  if (legacySecret && legacySecret.length >= 32 && !keys.has(LEGACY_KEY_ID)) {
    keys.set(LEGACY_KEY_ID, legacySecret);
  }
  return keys;
}

function isScope(value: unknown): value is DocumentEditWorkspaceScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const scope = value as Record<string, unknown>;
  return ["tenantId", "principalId", "entityCode", "recordId", "permissionStamp", "planHash"].every(
    (key) => typeof scope[key] === "string" && Boolean((scope[key] as string).trim()),
  ) && ["edit", "view", "approve", "create"].includes(String(scope["profile"]))
    && typeof scope["expiresAt"] === "number"
    && Number.isFinite(scope["expiresAt"]);
}
