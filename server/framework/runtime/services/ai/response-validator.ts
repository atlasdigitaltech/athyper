/**
 * ResponseValidator — Zod-strict validation of raw model output.
 *
 * Every capability handler must call validate() on the parsed JSON from the
 * model before returning a CapabilityResult.  If validation fails:
 *   - status = "failed" is returned (not thrown) so the runtime can write an
 *     inference log row and surface a clean error to the caller.
 *   - The raw text is logged at warn level for debugging.
 */

import type { z } from "zod";
import type { AiLogger } from "./ai-runtime.types.js";

export interface ValidationSuccess<T> {
  ok:   true;
  data: T;
}
export interface ValidationFailure {
  ok:      false;
  message: string;
  issues:  Array<{ path: string; message: string }>;
}
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export class ResponseValidator {
  constructor(private readonly logger: AiLogger) {}

  validate<T>(
    schema:  z.ZodType<T>,
    raw:     unknown,
    context: { actionCode: string; pipelineId: string },
  ): ValidationResult<T> {
    const result = schema.safeParse(raw);
    if (result.success) return { ok: true, data: result.data };

    const issues = result.error.issues.map((i) => ({
      path:    i.path.join("."),
      message: i.message,
    }));

    this.logger.warn("ai_response_validation_failed", {
      actionCode: context.actionCode,
      pipelineId: context.pipelineId,
      issueCount: issues.length,
      firstIssue: issues[0],
    });

    return {
      ok:      false,
      message: `Model output failed schema validation: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
      issues,
    };
  }
}
