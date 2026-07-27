import { createHmac, timingSafeEqual } from "node:crypto";

export interface KeysetCursorPayloadV1 {
  readonly v: 1;
  readonly entity: string;
  readonly descriptorHash: string;
  readonly sort: readonly string[];
  readonly values: readonly unknown[];
}

export class InvalidKeysetCursorError extends Error {
  readonly code = "INVALID_KEYSET_CURSOR";
  readonly status = 422;
  constructor(message = "The keyset cursor is invalid or no longer matches this entity descriptor.") {
    super(message);
    this.name = "InvalidKeysetCursorError";
  }
}

export function encodeKeysetCursor(payload: KeysetCursorPayloadV1, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}

export function decodeKeysetCursor(cursor: string, secret: string): KeysetCursorPayloadV1 {
  const [body, supplied, extra] = cursor.split(".");
  if (!body || !supplied || extra) throw new InvalidKeysetCursorError();
  const expected = signature(body, secret);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new InvalidKeysetCursorError();
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<KeysetCursorPayloadV1>;
    if (parsed.v !== 1 || typeof parsed.entity !== "string" || typeof parsed.descriptorHash !== "string"
      || !Array.isArray(parsed.sort) || !Array.isArray(parsed.values)) throw new Error("shape");
    return parsed as KeysetCursorPayloadV1;
  } catch {
    throw new InvalidKeysetCursorError();
  }
}

function signature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}
