import type { PlatformErrorCode } from './codes.js';

const HTTP_STATUS: Record<PlatformErrorCode, number> = {
  BAD_REQUEST:          400,
  UNAUTHORIZED:         401,
  FORBIDDEN:            403,
  NOT_FOUND:            404,
  CONFLICT:             409,
  VALIDATION_FAILED:    422,
  RATE_LIMITED:         429,
  INTERNAL_ERROR:       500,
  NOT_IMPLEMENTED:      501,
  SERVICE_UNAVAILABLE:  503,
};

// Falls back to 500 for domain-specific codes not in the platform map.
export function errorCodeToHttpStatus(code: string): number {
  return (HTTP_STATUS as Record<string, number>)[code] ?? 500;
}

// Used by BullMQ workers to decide whether to re-enqueue after a terminal failure.
// INTERNAL_ERROR is intentionally excluded — retrying unknown server errors causes worker storms.
const RETRYABLE_CODES = new Set<string>([
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
]);

export function isRetryablePlatformError(code: string): boolean {
  return RETRYABLE_CODES.has(code);
}
