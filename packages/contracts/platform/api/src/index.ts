export interface ApiProblem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly instance?: string;
  readonly errors?: unknown;
}

export function parseApiProblem(value: unknown): ApiProblem {
  const record = object(value, "API problem");
  const status = integer(record.status, "status");
  if (status < 400 || status > 599) throw new TypeError("status must be an HTTP error status");
  const errors = record.errors;
  const detail = optionalText(record.detail, "detail");
  const requestId = optionalText(record.requestId, "requestId");
  const correlationId = optionalText(record.correlationId, "correlationId");
  const instance = optionalText(record.instance, "instance");
  return Object.freeze({
    type: text(record.type, "type"), title: text(record.title, "title"), status,
    code: problemCode(record.code, "code"), ...(detail ? { detail } : {}),
    ...(requestId ? { requestId } : {}), ...(correlationId ? { correlationId } : {}),
    ...(instance ? { instance } : {}), ...(errors !== undefined ? { errors } : {}),
  });
}

function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`); return value as Record<string, unknown>; }
function text(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be non-empty`); return value.trim(); }
function optionalText(value: unknown, name: string): string | undefined { return value === undefined ? undefined : text(value, name); }
function integer(value: unknown, name: string): number { if (typeof value !== "number" || !Number.isInteger(value)) throw new TypeError(`${name} must be an integer`); return value; }
function problemCode(value: unknown, name: string): string { const result = text(value, name); if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(result)) throw new TypeError(`${name} must be a canonical problem code`); return result; }
