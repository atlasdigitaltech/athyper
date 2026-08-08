// server/src/runtimes/error-handler.ts
//
// Central Express error handler for the API runtime.
//
// Resolution order:
//   1. PlatformException   — thrown via fail() or new PlatformException()
//   2. WorkflowRuntimeError — legacy class; kept during migration to PlatformException
//   3. mapPostgresBusinessError — DB constraint violations mapped to 422 codes
//   4. Fallthrough          — unknown error → INTERNAL_ERROR (500)
//
// All paths converge on a single PlatformErrorReport, stamped with tenant
// context from ALS, before logging and responding.

import type { Request, Response, NextFunction } from "express";
import {
  PlatformException,
  errorCodeToHttpStatus,
  isRetryablePlatformError,
  type PlatformError,
  type PlatformErrorReport,
  type PlatformErrorResponse,
} from "@athyper/platform-core";
import type { RequestLogContext } from "@athyper/platform-core/context";
import { WorkflowRuntimeError } from "@athyper/svc-workflow";
import { mapPostgresBusinessError } from "@athyper/svc-shared";
import { tryGetContext } from "@athyper/server-foundation/context";
import { Sentry } from "@athyper/adapter-telemetry/sentry";

export interface ErrorHandlerOptions {
  isProduction: boolean;
  logger: {
    warn(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

function buildRequestLogContext(): RequestLogContext | undefined {
  const ctx = tryGetContext();
  if (!ctx) return undefined;
  return {
    correlationId: ctx.requestId,
    tenantId:      ctx.tenantId,
    userId:        ctx.principalId,
    plane:         ctx.planeKey,
  };
}

function sanitize(
  report: PlatformErrorReport<string>,
  isProduction: boolean,
): PlatformErrorResponse {
  return {
    error:     report.error.code,
    message:   report.error.message,
    requestId: report.context?.correlationId,
    // Strip details in production — may contain internal field paths or DB state.
    ...(!isProduction && report.error.details
      ? { details: report.error.details }
      : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createErrorHandler(opts: ErrorHandlerOptions) {
  return function platformErrorHandler(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ): void {
    const context = buildRequestLogContext();
    let platformError: PlatformError<string>;
    let isKnown = true;

    if (err instanceof PlatformException) {
      platformError = err.toPlatformError();

    } else if (err instanceof WorkflowRuntimeError) {
      // Migration bridge — WorkflowRuntimeError satisfies PlatformError structurally.
      platformError = {
        code:    err.code,
        message: err.message,
        details: err.details,
      };

    } else {
      const businessError = mapPostgresBusinessError(err);
      if (businessError) {
        platformError = {
          code:    businessError.code,
          message: businessError.message,
          details: {
            ...(businessError.field ? { field: businessError.field } : {}),
            ...(businessError.details ?? {}),
          },
        };
      } else {
        platformError = {
          code:    'INTERNAL_ERROR',
          message: opts.isProduction ? 'Internal server error' : err.message,
        };
        isKnown = false;
      }
    }

    const report: PlatformErrorReport<string> = {
      error:     platformError,
      context,
      ts:        Date.now(),
      retryable: isRetryablePlatformError(platformError.code),
    };

    if (isKnown) {
      opts.logger.warn('platform_error', {
        code:      report.error.code,
        message:   report.error.message,
        tenantId:  context?.tenantId,
        requestId: context?.correlationId,
      });
    } else {
      opts.logger.error('unhandled_error', {
        err:       err.message,
        stack:     err.stack,
        tenantId:  context?.tenantId,
        requestId: context?.correlationId,
      });
      // Only capture unknowns in Sentry — known PlatformExceptions are
      // expected operational errors (NOT_FOUND, FORBIDDEN) and not actionable.
      Sentry.captureException(err, {
        extra: { tenantId: context?.tenantId, requestId: context?.correlationId },
      });
    }

    const httpStatus = errorCodeToHttpStatus(platformError.code);
    const body = sanitize(report, opts.isProduction);
    res.status(httpStatus).json(body);
  };
}
