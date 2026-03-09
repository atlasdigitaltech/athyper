/**
 * Standardized API Response Helpers
 *
 * All API routes MUST use these helpers to ensure a consistent response
 * contract across the entire application.
 *
 * Success:   { success: true, data: T }
 * Paginated: { success: true, data: T[], meta: PaginationMeta }
 * Error:     { success: false, error: { code: string, message: string, details?: unknown } }
 */

import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ---------------------------------------------------------------------------
// Standard error codes (use these consistently)
// ---------------------------------------------------------------------------

export const ErrorCodes = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  INVALID_BODY: "INVALID_BODY",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

// ---------------------------------------------------------------------------
// Success helpers
// ---------------------------------------------------------------------------

/** Return a single resource or result. */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json(
    { success: true, data } satisfies ApiSuccessResponse<T>,
    { status },
  );
}

/** Return created resource (201). */
export function created<T>(data: T) {
  return ok(data, 201);
}

/** Return a paginated list. */
export function paginated<T>(
  data: T[],
  meta: PaginationMeta,
) {
  return NextResponse.json(
    { success: true, data, meta } satisfies ApiPaginatedResponse<T>,
    { status: 200 },
  );
}

/**
 * Build PaginationMeta from page/pageSize/total.
 * Converts between offset-based and page-based representations.
 */
export function buildPaginationMeta(opts: {
  page: number;
  pageSize: number;
  total: number;
}): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(opts.total / opts.pageSize));
  return {
    page: opts.page,
    pageSize: opts.pageSize,
    total: opts.total,
    totalPages,
    hasNext: opts.page < totalPages,
    hasPrev: opts.page > 1,
  };
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/** Return a structured error response. */
export function fail(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, ...(details != null ? { details } : {}) },
    } satisfies ApiErrorResponse,
    { status },
  );
}

export function unauthorized(message = "Authentication required") {
  return fail(ErrorCodes.UNAUTHORIZED, message, 401);
}

export function forbidden(message = "Permission denied") {
  return fail(ErrorCodes.FORBIDDEN, message, 403);
}

export function notFound(message = "Resource not found") {
  return fail(ErrorCodes.NOT_FOUND, message, 404);
}

export function badRequest(message: string, details?: unknown) {
  return fail(ErrorCodes.INVALID_BODY, message, 400, details);
}

export function validationError(message: string, details?: unknown) {
  return fail(ErrorCodes.VALIDATION_ERROR, message, 422, details);
}

export function conflict(message: string, details?: unknown) {
  return fail(ErrorCodes.CONFLICT, message, 409, details);
}

export function rateLimited(message = "Too many requests") {
  return fail(ErrorCodes.RATE_LIMITED, message, 429);
}

export function serviceUnavailable(message = "Service unavailable") {
  return fail(ErrorCodes.SERVICE_UNAVAILABLE, message, 503);
}

export function internalError(message = "Internal server error") {
  return fail(ErrorCodes.INTERNAL_ERROR, message, 500);
}

// ---------------------------------------------------------------------------
// Query parameter extraction helpers
// ---------------------------------------------------------------------------

/** Extract standard pagination params from URLSearchParams. */
export function extractPagination(params: URLSearchParams): {
  page: number;
  pageSize: number;
} {
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(params.get("pageSize") ?? "20", 10) || 20),
  );
  return { page, pageSize };
}

/** Extract standard sort params from URLSearchParams. */
export function extractSort(params: URLSearchParams): {
  sort: string | undefined;
  dir: "asc" | "desc";
} {
  const sort = params.get("sort") ?? undefined;
  const rawDir = params.get("dir")?.toLowerCase();
  const dir: "asc" | "desc" = rawDir === "desc" ? "desc" : "asc";
  return { sort, dir };
}

/** Extract search term from URLSearchParams. */
export function extractSearch(params: URLSearchParams): string | undefined {
  const search = params.get("search")?.trim();
  return search || undefined;
}
