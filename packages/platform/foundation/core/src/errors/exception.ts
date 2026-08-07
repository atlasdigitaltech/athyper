import type { PlatformErrorCode } from './codes.js';
import type { PlatformError } from './types.js';

export class PlatformException<C extends string = PlatformErrorCode> extends Error {
  readonly code: C;
  readonly details?: Record<string, unknown>;

  constructor(error: PlatformError<C>) {
    super(error.message);
    this.name = 'PlatformException';
    this.code = error.code;
    this.details = error.details;
    if (Error.captureStackTrace) Error.captureStackTrace(this, PlatformException);
  }

  toPlatformError(): PlatformError<C> {
    return { code: this.code, message: this.message, details: this.details };
  }
}

// Returns `never` so TypeScript narrows control flow past the call site.
// Eliminates the res.status().json(); return; pattern in route handlers.
export function fail<C extends string = PlatformErrorCode>(
  code: C,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new PlatformException<C>({ code, message, details });
}
