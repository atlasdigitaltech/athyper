import type { PlatformErrorCode } from './codes.js';
import type { RequestLogContext } from '../context/types.js';

// Structural error type — tenant-agnostic. httpStatus is intentionally absent;
// it lives in errorCodeToHttpStatus() so the HTTP concern stays in the HTTP layer.
export interface PlatformError<C extends string = PlatformErrorCode> {
  code: C;
  message: string;
  details?: Record<string, unknown>;
}

// Enriched envelope built by the error handler at catch time.
// context is stamped from ALS — the thrower never needs to call getContext().
export interface PlatformErrorReport<C extends string = PlatformErrorCode> {
  error: PlatformError<C>;
  context?: RequestLogContext;
  ts: number;
  retryable: boolean;
}

// Canonical HTTP wire format sent to the client.
// details is stripped entirely in production.
export interface PlatformErrorResponse {
  error: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}
