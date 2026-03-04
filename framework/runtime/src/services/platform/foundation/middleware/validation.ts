/**
 * Express middleware for request validation and sanitization
 */

import {
  validate,
  sanitizeObject,
  sanitizeDeep,
  type ValidationRule,
  type ValidationResult,
} from "@athyper/core";

import type { Request, Response, NextFunction } from "express";

export interface ValidationMiddlewareOptions {
  /**
   * Validation rules for request body
   */
  body?: ValidationRule[];

  /**
   * Validation rules for query parameters
   */
  query?: ValidationRule[];

  /**
   * Validation rules for URL parameters
   */
  params?: ValidationRule[];

  /**
   * Validation rules for headers
   */
  headers?: ValidationRule[];

  /**
   * Automatically sanitize validated fields
   */
  sanitize?: boolean;

  /**
   * Deep sanitize to prevent prototype pollution
   */
  deepSanitize?: boolean;

  /**
   * Custom error handler
   */
  onValidationError?: (
    errors: ValidationResult,
    req: Request,
    res: Response
  ) => void | Promise<void>;

  /**
   * Abort on first error
   */
  abortEarly?: boolean;
}

/**
 * Create validation middleware
 */
export function validationMiddleware(
  options: ValidationMiddlewareOptions
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const {
    body,
    query,
    params,
    headers,
    sanitize = true,
    deepSanitize = true,
    onValidationError,
    abortEarly = false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allErrors: ValidationResult["errors"] = [];

      // Validate and sanitize body
      if (body && req.body) {
        if (deepSanitize) {
          req.body = sanitizeDeep(req.body);
        } else if (sanitize) {
          req.body = sanitizeObject(req.body);
        }

        const result = validate(req.body, body);
        if (!result.valid) {
          allErrors.push(...result.errors);
          if (abortEarly) {
            return handleValidationError(
              { valid: false, errors: allErrors },
              req,
              res,
              onValidationError
            );
          }
        }
      }

      // Validate and sanitize query
      if (query && req.query) {
        if (deepSanitize) {
          req.query = sanitizeDeep(req.query);
        } else if (sanitize) {
          req.query = sanitizeObject(req.query);
        }

        const result = validate(req.query, query);
        if (!result.valid) {
          allErrors.push(...result.errors);
          if (abortEarly) {
            return handleValidationError(
              { valid: false, errors: allErrors },
              req,
              res,
              onValidationError
            );
          }
        }
      }

      // Validate and sanitize params
      if (params && req.params) {
        if (deepSanitize) {
          req.params = sanitizeDeep(req.params);
        } else if (sanitize) {
          req.params = sanitizeObject(req.params);
        }

        const result = validate(req.params, params);
        if (!result.valid) {
          allErrors.push(...result.errors);
          if (abortEarly) {
            return handleValidationError(
              { valid: false, errors: allErrors },
              req,
              res,
              onValidationError
            );
          }
        }
      }

      // Validate headers (no sanitization for headers)
      if (headers && req.headers) {
        const result = validate(req.headers, headers);
        if (!result.valid) {
          allErrors.push(...result.errors);
          if (abortEarly) {
            return handleValidationError(
              { valid: false, errors: allErrors },
              req,
              res,
              onValidationError
            );
          }
        }
      }

      // If any validation errors, handle them
      if (allErrors.length > 0) {
        return handleValidationError(
          { valid: false, errors: allErrors },
          req,
          res,
          onValidationError
        );
      }

      next();
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "validation_middleware_error",
          path: req.path,
          err: String(error),
        })
      );
      next(error);
    }
  };
}

/**
 * Handle validation errors
 */
function handleValidationError(
  result: ValidationResult,
  req: Request,
  res: Response,
  customHandler?: ValidationMiddlewareOptions["onValidationError"]
): void | Promise<void> {
  if (customHandler) {
    return customHandler(result, req, res);
  }

  res.status(400).json({
    error: "VALIDATION_ERROR",
    message: "Request validation failed",
    errors: result.errors.map((err) => ({
      field: err.field,
      message: err.message,
    })),
  });
}

/**
 * Validate body only
 */
export function validateBody(rules: ValidationRule[]) {
  return validationMiddleware({ body: rules });
}

/**
 * Validate query only
 */
export function validateQuery(rules: ValidationRule[]) {
  return validationMiddleware({ query: rules });
}

/**
 * Validate params only
 */
export function validateParams(rules: ValidationRule[]) {
  return validationMiddleware({ params: rules });
}

/**
 * Content-Type validation middleware
 */
export function requireContentType(...allowedTypes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers["content-type"];

    if (!contentType) {
      return res.status(400).json({
        error: "MISSING_CONTENT_TYPE",
        message: "Content-Type header is required",
      });
    }

    // Check if content type matches (ignore charset and other parameters)
    const baseContentType = contentType.split(";")[0].trim().toLowerCase();

    const isAllowed = allowedTypes.some(
      (type) => baseContentType === type.toLowerCase()
    );

    if (!isAllowed) {
      return res.status(415).json({
        error: "UNSUPPORTED_MEDIA_TYPE",
        message: `Content-Type must be one of: ${allowedTypes.join(", ")}`,
        received: baseContentType,
      });
    }

    next();
  };
}

/**
 * Request size limit validation
 */
export function requireBodySize(maxSizeBytes: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers["content-length"];

    if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
      return res.status(413).json({
        error: "PAYLOAD_TOO_LARGE",
        message: `Request body must be less than ${maxSizeBytes} bytes`,
        limit: maxSizeBytes,
      });
    }

    next();
  };
}

/**
 * Require specific HTTP methods
 */
export function requireMethod(...methods: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!methods.includes(req.method.toUpperCase())) {
      return res.status(405).json({
        error: "METHOD_NOT_ALLOWED",
        message: `Method ${req.method} is not allowed`,
        allowed: methods,
      });
    }

    next();
  };
}

/**
 * Sanitize request middleware
 * Sanitizes body, query, and params without validation
 */
export function sanitizeRequest(deepSanitize: boolean = true) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.body) {
        req.body = deepSanitize ? sanitizeDeep(req.body) : sanitizeObject(req.body);
      }

      if (req.query) {
        req.query = deepSanitize ? sanitizeDeep(req.query) : sanitizeObject(req.query);
      }

      if (req.params) {
        req.params = deepSanitize ? sanitizeDeep(req.params) : sanitizeObject(req.params);
      }

      next();
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "sanitize_request_error",
          path: req.path,
          err: String(error),
        })
      );
      next(error);
    }
  };
}
