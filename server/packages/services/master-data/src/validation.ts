import { MasterDataError } from "./errors.js";

/** Require an unambiguous instant and reject calendar rollover accepted by Date.parse. */
export function optionalTimestamp(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const match = typeof value === "string"
    ? /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.exec(value)
    : null;
  if (!match || !Number.isFinite(Date.parse(value as string))) invalid();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]!) invalid();
  return value as string;
}

function invalid(): never {
  throw new MasterDataError(400, "INVALID_MASTER_DATA_REQUEST", "Valid ISO timestamp with timezone required");
}
