// framework/runtime/src/services/business/engines/shared/engine-base.ts

/**
 * Shared engine patterns and base types.
 */

import type { Container } from "../../../../kernel/container.js";

/** Standard engine module interface (extends RuntimeModule pattern) */
export interface EngineModule {
  readonly name: string;
  readonly engineCode: string;
  register(c: Container): void | Promise<void>;
  contribute?(c: Container): void | Promise<void>;
}

/** Standard pagination parameters */
export interface PaginationParams {
  limit: number;
  offset: number;
}

/** Standard paginated result */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Standard audit context for service operations */
export interface OperationContext {
  tenantId: string;
  actorId: string;
  actorType: "USER" | "SYSTEM" | "AI_AGENT" | "SCHEDULER";
  correlationId: string;
  entityCode?: string;
}

/** Standard service result with success/failure */
export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ServiceError };

export interface ServiceError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export function ok<T>(value: T): ServiceResult<T> {
  return { ok: true, value };
}

export function fail<T>(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ServiceResult<T> {
  return { ok: false, error: { code, message, details } };
}

/** Standard entity status */
export type EntityStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";

/** Standard lifecycle transition validator */
export function validateTransition<S extends string>(
  current: S,
  target: S,
  allowedTransitions: Record<S, S[]>,
): boolean {
  const allowed = allowedTransitions[current];
  return allowed ? allowed.includes(target) : false;
}

/** Build a paginated result from items and total */
export function paginate<T>(
  items: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  return {
    items,
    total,
    limit: params.limit,
    offset: params.offset,
    hasMore: params.offset + items.length < total,
  };
}
