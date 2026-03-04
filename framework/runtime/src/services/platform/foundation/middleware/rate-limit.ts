/**
 * Express middleware for rate limiting
 * Supports per-tenant, per-user, and per-IP rate limiting
 */

import { createRateLimitKey } from "@athyper/core";

import type {
  RateLimiter,
  RateLimitContext,
  RateLimitResult,
} from "@athyper/core";
import type { Request, Response, NextFunction } from "express";

export interface RateLimitMiddlewareOptions {
  /**
   * Rate limiter instance
   */
  limiter: RateLimiter;

  /**
   * Custom key generator
   */
  keyGenerator?: (req: Request) => string | Promise<string>;

  /**
   * Extract tenant key from request
   */
  getTenantKey?: (req: Request) => string | undefined;

  /**
   * Extract user ID from request
   */
  getUserId?: (req: Request) => string | undefined;

  /**
   * Skip rate limiting for certain requests
   */
  skip?: (req: Request) => boolean | Promise<boolean>;

  /**
   * Custom handler for rate limit exceeded
   */
  onRateLimitExceeded?: (
    req: Request,
    res: Response,
    result: RateLimitResult
  ) => void | Promise<void>;

  /**
   * Include rate limit headers in response
   */
  includeHeaders?: boolean;

  /**
   * Draft standard headers (RateLimit-* headers)
   */
  standardHeaders?: boolean;

  /**
   * Legacy headers (X-RateLimit-* headers)
   */
  legacyHeaders?: boolean;
}

/**
 * Create rate limiting middleware
 */
export function rateLimitMiddleware(
  options: RateLimitMiddlewareOptions
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const {
    limiter,
    keyGenerator,
    getTenantKey,
    getUserId,
    skip,
    onRateLimitExceeded,
    includeHeaders = true,
    standardHeaders = true,
    legacyHeaders = true,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if rate limiting should be skipped
      if (skip && (await skip(req))) {
        return next();
      }

      // Generate rate limit key
      const key = keyGenerator
        ? await keyGenerator(req)
        : await generateDefaultKey(req, getTenantKey, getUserId);

      // Consume rate limit
      const result = await limiter.consume(key);

      // Add rate limit headers
      if (includeHeaders) {
        addRateLimitHeaders(res, result, { standardHeaders, legacyHeaders });
      }

      // Check if rate limit exceeded
      if (!result.allowed) {
        if (onRateLimitExceeded) {
          await onRateLimitExceeded(req, res, result);
        } else {
          handleRateLimitExceeded(res, result);
        }
        return;
      }

      next();
    } catch (error) {
      // On error, fail open (allow request) but log
      console.error(
        JSON.stringify({
          msg: "rate_limit_middleware_error",
          path: req.path,
          err: String(error),
        })
      );
      next();
    }
  };
}

/**
 * Generate default rate limit key from request
 */
async function generateDefaultKey(
  req: Request,
  getTenantKey?: (req: Request) => string | undefined,
  getUserId?: (req: Request) => string | undefined
): Promise<string> {
  const context: RateLimitContext = {
    tenantKey: getTenantKey?.(req),
    userId: getUserId?.(req),
    ip: getClientIp(req),
    endpoint: `${req.method}:${req.path}`,
  };

  return createRateLimitKey(context);
}

/**
 * Extract client IP address from request
 */
function getClientIp(req: Request): string {
  // Check common headers for real IP (when behind proxy)
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Add rate limit headers to response
 */
function addRateLimitHeaders(
  res: Response,
  result: RateLimitResult,
  options: { standardHeaders?: boolean; legacyHeaders?: boolean }
): void {
  const resetSeconds = Math.ceil(result.resetMs / 1000);

  // Draft standard headers (https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers)
  if (options.standardHeaders) {
    res.setHeader("RateLimit-Limit", result.limit.toString());
    res.setHeader("RateLimit-Remaining", result.remaining.toString());
    res.setHeader("RateLimit-Reset", resetSeconds.toString());
  }

  // Legacy X-RateLimit-* headers (widely used)
  if (options.legacyHeaders) {
    res.setHeader("X-RateLimit-Limit", result.limit.toString());
    res.setHeader("X-RateLimit-Remaining", result.remaining.toString());
    res.setHeader("X-RateLimit-Reset", resetSeconds.toString());
  }

  // Retry-After header when rate limited
  if (!result.allowed && result.retryAfter) {
    res.setHeader("Retry-After", result.retryAfter.toString());
  }
}

/**
 * Handle rate limit exceeded
 */
function handleRateLimitExceeded(res: Response, result: RateLimitResult): void {
  res.status(429).json({
    error: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests, please try again later",
    limit: result.limit,
    remaining: result.remaining,
    resetIn: Math.ceil(result.resetMs / 1000),
    retryAfter: result.retryAfter,
  });
}

/**
 * Create per-tenant rate limiter middleware
 */
export function perTenantRateLimiter(
  limiter: RateLimiter
): ReturnType<typeof rateLimitMiddleware> {
  return rateLimitMiddleware({
    limiter,
    keyGenerator: async (req) => {
      const tenantKey = (req as any).tenantKey || (req as any).tenant?.key;
      if (!tenantKey) {
        throw new Error("Tenant key not found in request");
      }
      return `tenant:${tenantKey}`;
    },
  });
}

/**
 * Create per-user rate limiter middleware
 */
export function perUserRateLimiter(
  limiter: RateLimiter
): ReturnType<typeof rateLimitMiddleware> {
  return rateLimitMiddleware({
    limiter,
    keyGenerator: async (req) => {
      const userId = (req as any).userId || (req as any).user?.id;
      if (!userId) {
        // Fall back to IP if no user ID
        return `ip:${getClientIp(req)}`;
      }
      return `user:${userId}`;
    },
  });
}

/**
 * Create per-IP rate limiter middleware
 */
export function perIpRateLimiter(
  limiter: RateLimiter
): ReturnType<typeof rateLimitMiddleware> {
  return rateLimitMiddleware({
    limiter,
    keyGenerator: async (req) => `ip:${getClientIp(req)}`,
  });
}

/**
 * Create per-endpoint rate limiter middleware
 */
export function perEndpointRateLimiter(
  limiter: RateLimiter
): ReturnType<typeof rateLimitMiddleware> {
  return rateLimitMiddleware({
    limiter,
    keyGenerator: async (req) => {
      const tenantKey = (req as any).tenantKey || (req as any).tenant?.key;
      const endpoint = `${req.method}:${req.path}`;
      return tenantKey ? `tenant:${tenantKey}:endpoint:${endpoint}` : `endpoint:${endpoint}`;
    },
  });
}

/**
 * Combine multiple rate limiters
 * Requests must pass all rate limiters
 */
export function combineRateLimiters(
  ...middlewares: Array<ReturnType<typeof rateLimitMiddleware>>
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction) => {
    for (const middleware of middlewares) {
      let error: any;
      let handled = false;

      const customNext = (err?: any) => {
        if (err) error = err;
        handled = true;
      };

      await middleware(req, res, customNext);

      // If response was sent (rate limited), stop
      if (res.headersSent) {
        return;
      }

      // If error occurred, pass it on
      if (error) {
        return next(error);
      }

      // If next wasn't called, rate limit was exceeded
      if (!handled) {
        return;
      }
    }

    next();
  };
}
