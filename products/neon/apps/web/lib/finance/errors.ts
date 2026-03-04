// lib/finance/errors.ts
//
// Typed error class matching the backend { error: { code, message, details? } } contract.
// All finance hooks throw FinanceHttpError for consistent error handling in plugins.

export class FinanceHttpError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    httpStatus: number,
    body: { code: string; message: string; details?: Record<string, unknown> },
  ) {
    super(body.message);
    this.name = "FinanceHttpError";
    this.code = body.code;
    this.httpStatus = httpStatus;
    this.details = body.details;
  }

  get isConflict(): boolean {
    return this.httpStatus === 409;
  }

  get isNotFound(): boolean {
    return this.httpStatus === 404;
  }

  get isValidation(): boolean {
    return this.httpStatus === 400;
  }
}
