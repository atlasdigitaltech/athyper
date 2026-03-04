/**
 * Express middleware for field-level security
 *
 * Enforces field-level access control at the controller boundary:
 * - Request (write): Filter/deny fields the subject cannot write
 * - Response (read): Filter/mask fields the subject cannot read
 */

import type { Logger } from "../../../../kernel/logger.js";
import type {
  FieldAccessService,
  SubjectSnapshot,
  FieldAccessContext,
} from "../security/field-security/index.js";
import type { Request, Response, NextFunction } from "express";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for field-level security middleware
 */
export interface FieldLevelMiddlewareOptions {
  /** Field access service instance */
  fieldAccessService: FieldAccessService;

  /** Logger instance */
  logger: Logger;

  /** Entity ID or function to resolve entity ID from request */
  entityId: string | ((req: Request) => string);

  /**
   * Function to extract subject snapshot from request
   * Default: reads from req.user or req.requestContext.subject
   */
  getSubject?: (req: Request) => SubjectSnapshot | undefined;

  /**
   * Function to extract tenant ID from request
   * Default: reads from req.tenant or subject.tenantId
   */
  getTenantId?: (req: Request, subject: SubjectSnapshot) => string;

  /**
   * Function to extract record ID from request (for record-scoped policies)
   * Default: reads from req.params.id
   */
  getRecordId?: (req: Request) => string | undefined;

  /**
   * How to handle write denials
   * - 'remove': Silently remove denied fields (default)
   * - 'error': Return 403 error with list of denied fields
   * - 'warn': Remove fields but add warning header
   */
  writeDenialMode?: "remove" | "error" | "warn";

  /**
   * Fields to always allow (bypass security check)
   * e.g., ['id', 'createdAt', 'updatedAt']
   */
  allowedFields?: string[];

  /**
   * Fields to always deny (regardless of policy)
   * e.g., ['passwordHash', 'apiKey']
   */
  deniedFields?: string[];

  /**
   * Enable audit logging for field access
   * Default: true
   */
  enableAudit?: boolean;

  /**
   * Skip field-level security for these roles
   * e.g., ['system_admin', 'super_user']
   */
  bypassRoles?: string[];
}

/**
 * Result attached to request after write filtering
 */
export interface FieldLevelWriteResult {
  /** Original field count in request body */
  originalFieldCount: number;

  /** Fields that were allowed */
  allowedFields: string[];

  /** Fields that were denied/removed */
  deniedFields: string[];

  /** Whether any fields were denied */
  hasDenials: boolean;
}

/**
 * Middleware configuration for response transformation
 */
export interface FieldLevelResponseOptions {
  /** Field access service instance */
  fieldAccessService: FieldAccessService;

  /** Logger instance */
  logger: Logger;

  /** Entity ID or function to resolve entity ID from request */
  entityId: string | ((req: Request) => string);

  /** Function to extract subject snapshot from request */
  getSubject?: (req: Request) => SubjectSnapshot | undefined;

  /** Function to extract tenant ID from request */
  getTenantId?: (req: Request, subject: SubjectSnapshot) => string;

  /** Function to extract record ID from response data */
  getRecordId?: (data: unknown) => string | undefined;

  /** Fields to always include (bypass security) */
  allowedFields?: string[];

  /** Fields to always exclude */
  deniedFields?: string[];

  /** Enable audit logging */
  enableAudit?: boolean;

  /** Roles that bypass security */
  bypassRoles?: string[];
}

// ============================================================================
// Request Middleware (Write Filtering)
// ============================================================================

/**
 * Create middleware that filters request body fields based on write permissions.
 * Should be applied AFTER authentication and body parsing middleware.
 *
 * Usage:
 * ```typescript
 * app.post('/api/users',
 *   authMiddleware,
 *   fieldLevelWriteMiddleware({ entityId: 'user', ... }),
 *   createUserHandler
 * );
 * ```
 */
export function fieldLevelWriteMiddleware(
  options: FieldLevelMiddlewareOptions
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const {
    fieldAccessService,
    logger,
    entityId: entityIdOrFn,
    getSubject = defaultGetSubject,
    getTenantId = defaultGetTenantId,
    getRecordId = defaultGetRecordId,
    writeDenialMode = "remove",
    allowedFields = [],
    deniedFields = [],
    enableAudit: _enableAudit = true,
    bypassRoles = [],
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip if no body
      if (!req.body || typeof req.body !== "object") {
        return next();
      }

      // Get subject
      const subject = getSubject(req);
      if (!subject) {
        logger.warn({ msg: "field_level_no_subject", path: req.path });
        return next();
      }

      // Check bypass roles
      if (bypassRoles.some((role) => subject.roles.includes(role))) {
        return next();
      }

      // Resolve entity ID
      const entityId = typeof entityIdOrFn === "function" ? entityIdOrFn(req) : entityIdOrFn;

      // Build context
      const context: FieldAccessContext = {
        tenantId: getTenantId(req, subject),
        recordId: getRecordId(req),
        requestId: (req as any).requestContext?.requestId,
        traceId: (req as any).requestContext?.traceContext?.traceId,
      };

      // Apply always-denied fields first
      const bodyAfterDenied = { ...req.body };
      const forceDenied: string[] = [];
      for (const field of deniedFields) {
        if (field in bodyAfterDenied) {
          delete bodyAfterDenied[field];
          forceDenied.push(field);
        }
      }

      // Apply always-allowed fields (extract them before filtering)
      const alwaysAllowedValues: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (field in bodyAfterDenied) {
          alwaysAllowedValues[field] = bodyAfterDenied[field];
        }
      }

      // Filter writable fields
      const result = await fieldAccessService.filterWritable(
        entityId,
        bodyAfterDenied,
        subject,
        context
      );

      // Re-add always-allowed fields
      const filteredBody = {
        ...result.record,
        ...alwaysAllowedValues,
      };

      // Track results
      const writeResult: FieldLevelWriteResult = {
        originalFieldCount: Object.keys(req.body).length,
        allowedFields: result.allowedFields,
        deniedFields: [...forceDenied, ...result.removedFields],
        hasDenials: forceDenied.length > 0 || result.removedFields.length > 0,
      };

      // Attach result to request for later inspection
      (req as any).fieldLevelWrite = writeResult;

      // Handle denials based on mode
      if (writeResult.hasDenials) {
        logger.info({
          msg: "field_level_write_deny",
          entityId,
          deniedFields: writeResult.deniedFields,
          subjectId: subject.id,
        });

        switch (writeDenialMode) {
          case "error":
            res.status(403).json({
              error: "FIELD_WRITE_DENIED",
              message: "One or more fields cannot be written",
              deniedFields: writeResult.deniedFields,
            });
            return;

          case "warn":
            res.setHeader("X-Field-Denied", writeResult.deniedFields.join(","));
            break;

          case "remove":
          default:
            // Silently remove (already done)
            break;
        }
      }

      // Replace request body with filtered version
      req.body = filteredBody;

      next();
    } catch (error) {
      logger.error({
        msg: "field_level_write_error",
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
      });
      next(error);
    }
  };
}

// ============================================================================
// Response Middleware (Read Filtering/Masking)
// ============================================================================

/**
 * Create a response transformer that filters/masks fields based on read permissions.
 * Returns a function that can be used to transform response data.
 *
 * Usage:
 * ```typescript
 * const filterResponse = createFieldLevelResponseFilter({ entityId: 'user', ... });
 *
 * app.get('/api/users/:id', async (req, res) => {
 *   const user = await getUserById(req.params.id);
 *   const filtered = await filterResponse(req, user);
 *   res.json(filtered);
 * });
 * ```
 */
export function createFieldLevelResponseFilter(
  options: FieldLevelResponseOptions
): (req: Request, data: unknown) => Promise<unknown> {
  const {
    fieldAccessService,
    logger,
    entityId: entityIdOrFn,
    getSubject = defaultGetSubject,
    getTenantId = defaultGetTenantId,
    getRecordId,
    allowedFields = [],
    deniedFields = [],
    bypassRoles = [],
  } = options;

  return async (req: Request, data: unknown): Promise<unknown> => {
    // Handle null/undefined
    if (data === null || data === undefined) {
      return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      const results = await Promise.all(
        data.map((item) => filterSingleRecord(req, item))
      );
      return results;
    }

    // Handle single object
    return filterSingleRecord(req, data);
  };

  async function filterSingleRecord(req: Request, data: unknown): Promise<unknown> {
    if (data === null || data === undefined || typeof data !== "object") {
      return data;
    }

    const record = data as Record<string, unknown>;

    // Get subject
    const subject = getSubject(req);
    if (!subject) {
      logger.warn({ msg: "field_level_response_no_subject", path: req.path });
      return record;
    }

    // Check bypass roles
    if (bypassRoles.some((role) => subject.roles.includes(role))) {
      return record;
    }

    // Resolve entity ID
    const entityId = typeof entityIdOrFn === "function" ? entityIdOrFn(req) : entityIdOrFn;

    // Build context
    const context: FieldAccessContext = {
      tenantId: getTenantId(req, subject),
      recordId: getRecordId ? getRecordId(record) : (record.id as string | undefined),
      requestId: (req as any).requestContext?.requestId,
      traceId: (req as any).requestContext?.traceContext?.traceId,
    };

    // Apply always-denied fields first
    const recordAfterDenied = { ...record };
    for (const field of deniedFields) {
      delete recordAfterDenied[field];
    }

    // Extract always-allowed fields
    const alwaysAllowedValues: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in record) {
        alwaysAllowedValues[field] = record[field];
      }
    }

    // Filter readable fields (with masking)
    const result = await fieldAccessService.filterReadable(
      entityId,
      recordAfterDenied,
      subject,
      context
    );

    // Re-add always-allowed fields
    return {
      ...result.record,
      ...alwaysAllowedValues,
    };
  }
}

/**
 * Create middleware that intercepts res.json() to automatically filter responses.
 * Alternative approach that modifies response behavior.
 *
 * Usage:
 * ```typescript
 * app.use(fieldLevelResponseMiddleware({ entityId: 'user', ... }));
 *
 * app.get('/api/users/:id', async (req, res) => {
 *   const user = await getUserById(req.params.id);
 *   res.json(user); // Automatically filtered
 * });
 * ```
 */
export function fieldLevelResponseMiddleware(
  options: FieldLevelResponseOptions
): (req: Request, res: Response, next: NextFunction) => void {
  const filterResponse = createFieldLevelResponseFilter(options);

  return (req: Request, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method
    res.json = function (body: unknown) {
      // If body is an object, filter it
      if (body && typeof body === "object") {
        filterResponse(req, body)
          .then((filtered) => {
            originalJson(filtered);
          })
          .catch((error) => {
            options.logger.error({
              msg: "field_level_response_error",
              error: error instanceof Error ? error.message : String(error),
            });
            originalJson(body); // Fall back to original
          });
        return res;
      }

      return originalJson(body);
    } as typeof res.json;

    next();
  };
}

// ============================================================================
// Default Helper Functions
// ============================================================================

/**
 * Default subject extractor
 */
function defaultGetSubject(req: Request): SubjectSnapshot | undefined {
  // Try common locations
  const user = (req as any).user;
  const subject = (req as any).requestContext?.subject;

  if (subject) {
    return subject as SubjectSnapshot;
  }

  if (user) {
    // Convert user to SubjectSnapshot if possible
    return {
      id: user.id || user.sub,
      type: user.type || "user",
      tenantId: user.tenantId || user.tenant_id,
      roles: user.roles || [],
      groups: user.groups,
      attributes: user.attributes,
    } as SubjectSnapshot;
  }

  return undefined;
}

/**
 * Default tenant ID extractor
 */
function defaultGetTenantId(req: Request, subject: SubjectSnapshot): string {
  return (req as any).tenantId || (req as any).tenant?.id || subject.tenantId;
}

/**
 * Default record ID extractor
 */
function defaultGetRecordId(req: Request): string | undefined {
  return req.params?.id;
}

// ============================================================================
// Utility: Combined Middleware Factory
// ============================================================================

/**
 * Create both write and response middleware for an entity.
 * Convenient factory for setting up field-level security.
 */
export function createFieldLevelMiddleware(options: FieldLevelMiddlewareOptions): {
  write: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  response: (req: Request, res: Response, next: NextFunction) => void;
  filterResponse: (req: Request, data: unknown) => Promise<unknown>;
} {
  const responseOptions: FieldLevelResponseOptions = {
    ...options,
    getRecordId: options.getRecordId
      ? (data: unknown) => (options.getRecordId as any)(data)
      : undefined,
  };
  return {
    write: fieldLevelWriteMiddleware(options),
    response: fieldLevelResponseMiddleware(responseOptions),
    filterResponse: createFieldLevelResponseFilter(responseOptions),
  };
}
