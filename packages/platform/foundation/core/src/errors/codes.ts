export type PlatformErrorCode =
  | 'BAD_REQUEST'           // 400 — malformed input, missing required header
  | 'UNAUTHORIZED'          // 401 — no valid credentials
  | 'FORBIDDEN'             // 403 — valid credentials, insufficient permission
  | 'NOT_FOUND'             // 404
  | 'CONFLICT'              // 409 — resource state conflict (duplicate, in-progress)
  | 'VALIDATION_FAILED'     // 422 — semantically invalid (business rule, gate denied)
  | 'RATE_LIMITED'          // 429
  | 'INTERNAL_ERROR'        // 500
  | 'NOT_IMPLEMENTED'       // 501
  | 'SERVICE_UNAVAILABLE';  // 503
