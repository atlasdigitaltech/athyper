import { createHash } from "node:crypto";
import { FinanceContractError, type FinanceCommand } from "@athyper/server-contract-finance";

export function canonicalFinanceJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function canonicalFinanceHash(value: unknown): string {
  return createHash("sha256").update(canonicalFinanceJson(value), "utf8").digest("hex");
}

export function verifyFinanceCommand(command: FinanceCommand): void {
  if (!command.commandId.trim() || !command.commandCode.trim() || !command.idempotencyKey.trim()) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Command identity is required");
  if (command.actor.planeKey !== "neon") throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Finance commands must target Neon");
  const expected = canonicalFinanceHash({ commandCode: command.commandCode, tenantId: command.actor.tenantId, principalId: command.actor.principalId, payload: command.payload, expectedVersion: command.expectedVersion });
  if (command.requestFingerprint !== expected) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Request fingerprint does not match canonical command input", { expected });
}

export function assertFinanceDecimal(value: string, field = "amount", options: { readonly precision?: number; readonly scale?: number } = {}): string {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", `${field} must be a canonical decimal string`);
  const precision = options.precision ?? 18;
  const scale = options.scale ?? 4;
  const unsigned = value.startsWith("-") ? value.slice(1) : value;
  const [whole = "", fraction = ""] = unsigned.split(".");
  if (fraction.length > scale || whole.length + fraction.length > precision || whole.length > precision - scale) throw new FinanceContractError("FINANCE_INVALID_COMMAND", `${field} exceeds numeric(${precision},${scale})`);
  return value;
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Canonical finance input cannot contain non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]));
  throw new FinanceContractError("FINANCE_INVALID_COMMAND", `Unsupported canonical value: ${typeof value}`);
}
