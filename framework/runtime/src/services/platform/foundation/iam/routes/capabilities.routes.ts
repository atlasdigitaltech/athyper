/**
 * Capabilities Routes
 *
 * REST API for querying capability matrix and checking permissions.
 */

import { z } from "zod";

import { PERSONA_CODES } from "../persona-model/types.js";

import type { Logger } from "../../../../../kernel/logger.js";
import type { IPersonaCapabilityService } from "../persona-model/persona-capability.service.js";
import type { PersonaCode } from "../persona-model/types.js";
import type { NextFunction, Request, Response, Router } from "express";

// ============================================================================
// Validation Schemas
// ============================================================================

const CheckCapabilityQuerySchema = z.object({
  persona: z.enum(PERSONA_CODES as [string, ...string[]]),
  operation: z.string().min(1),
  isOwner: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  recordOuPath: z.string().optional(),
  subjectOuPath: z.string().optional(),
  moduleCode: z.string().optional(),
});

// ============================================================================
// Route Factory
// ============================================================================

export interface CapabilitiesRoutesDependencies {
  capabilityService: IPersonaCapabilityService;
  logger: Logger;
}

/**
 * Create capabilities routes
 */
export function createCapabilitiesRoutes(
  router: Router,
  deps: CapabilitiesRoutesDependencies
): Router {
  const { capabilityService, logger } = deps;

  /**
   * GET /capabilities/matrix
   * Get the full capability matrix
   */
  router.get(
    "/capabilities/matrix",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const matrix = await capabilityService.getCapabilityMatrix();
        return res.json(matrix);
      } catch (error) {
        logger.error("Failed to get capability matrix", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /capabilities/matrix/rows
   * Get capability matrix as rows for UI display
   */
  router.get(
    "/capabilities/matrix/rows",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rows = await capabilityService.getCapabilityMatrixRows();
        return res.json({ rows });
      } catch (error) {
        logger.error("Failed to get capability matrix rows", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /capabilities/personas
   * List all personas
   */
  router.get(
    "/capabilities/personas",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const matrix = await capabilityService.getCapabilityMatrix();
        return res.json({ personas: matrix.personas });
      } catch (error) {
        logger.error("Failed to list personas", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /capabilities/operations
   * List all operations grouped by category
   */
  router.get(
    "/capabilities/operations",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const matrix = await capabilityService.getCapabilityMatrix();

        // Group operations by category
        const byCategory = new Map<string, typeof matrix.operations>();
        for (const op of matrix.operations) {
          const category = op.categoryCode;
          if (!byCategory.has(category)) {
            byCategory.set(category, []);
          }
          byCategory.get(category)!.push(op);
        }

        return res.json({
          categories: matrix.categories,
          operationsByCategory: Object.fromEntries(byCategory),
        });
      } catch (error) {
        logger.error("Failed to list operations", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /capabilities/check
   * Check if a persona has a specific capability
   */
  router.get(
    "/capabilities/check",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parseResult = CheckCapabilityQuerySchema.safeParse(req.query);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid query parameters",
            details: parseResult.error.errors,
          });
        }

        const { persona, operation, isOwner, recordOuPath, subjectOuPath, moduleCode } =
          parseResult.data;

        const result = await capabilityService.hasCapability(
          persona as PersonaCode,
          operation,
          {
            isOwner,
            recordOuPath,
            subjectOuPath,
            moduleCode,
          }
        );

        return res.json(result);
      } catch (error) {
        logger.error("Failed to check capability", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /capabilities/persona/:code
   * Get all capabilities for a specific persona
   */
  router.get(
    "/capabilities/persona/:code",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const code = req.params.code as PersonaCode;
        if (!PERSONA_CODES.includes(code)) {
          return res.status(400).json({
            error: "INVALID_PERSONA",
            message: `Invalid persona code: ${code}`,
            validCodes: PERSONA_CODES,
          });
        }

        const capabilities = await capabilityService.getPersonaCapabilities(code);
        return res.json({ persona: code, capabilities });
      } catch (error) {
        logger.error("Failed to get persona capabilities", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /capabilities/operation/:code/personas
   * Get all personas that have a specific capability
   */
  router.get(
    "/capabilities/operation/:code/personas",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const code = req.params.code;
        const personas = await capabilityService.getPersonasWithCapability(code);
        return res.json({ operation: code, personas });
      } catch (error) {
        logger.error("Failed to get personas for operation", { error });
        return next(error);
      }
    }
  );

  return router;
}
