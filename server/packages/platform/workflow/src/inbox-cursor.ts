import { parseBusinessDate, parseInstant } from "@athyper/platform-temporal";
import { WorkflowError } from "./errors.js";

export function encodeInboxCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url");
}

export function decodeInboxCursor(value: string): { createdAt: string; id: string } {
  try {
    if (value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const { createdAt, id } = parsed as Record<string, unknown>;
    if (typeof createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(createdAt)
      || !Number.isFinite(parseInstant(createdAt)) || !Number.isFinite(parseBusinessDate(createdAt.slice(0, 10)))
      || typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error();
    return { createdAt, id };
  } catch {
    throw new WorkflowError(400, "INVALID_CURSOR", "Invalid workflow inbox cursor");
  }
}
