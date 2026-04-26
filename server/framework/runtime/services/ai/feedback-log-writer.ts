/**
 * FeedbackLogWriter — writes one row to log.ai_feedback_log per user verdict.
 *
 * feedback_type must match a value seeded in the log.ai_feedback_type lookup domain.
 * Supported types: "atlas", "classification", "extraction_correction"
 *
 * The evidence_snapshot captures the before/after diff so the calibration loop
 * can correlate model confidence with actual user corrections over time.
 */

import { sql } from "kysely";
import type { AnyDb, AiLogger } from "./ai-runtime.types.js";

export type FeedbackVerdict = "correct" | "wrong" | "partial" | "missing";

export interface FeedbackWriteArgs {
  tenantId:     string;
  principalId:  string;
  feedbackType: string;           // must be a seeded control.lookup_value code
  entityType?:  string;
  entityId?:    string;
  targetId?:    string;          // inference_log_id being corrected
  verdict:      FeedbackVerdict;
  reasonCode?:  string;
  reasonDetail?: string;
  evidenceSnapshot?: unknown;    // before/after diff
  detail?:       unknown;        // type-specific fields
}

export class FeedbackLogWriter {
  constructor(
    private readonly db:     AnyDb,
    private readonly logger: AiLogger,
  ) {}

  async write(args: FeedbackWriteArgs): Promise<void> {
    const {
      tenantId, principalId, feedbackType,
      entityType, entityId, targetId,
      verdict, reasonCode, reasonDetail,
      evidenceSnapshot, detail,
    } = args;

    try {
      await sql`
        INSERT INTO log.ai_feedback_log (
          tenant_id, log_type,
          feedback_type, entity_type, entity_id, target_id,
          verdict, reason_code, reason_detail,
          evidence_snapshot, detail,
          submitted_by, created_by
        ) VALUES (
          ${tenantId}::uuid,
          'business',
          ${feedbackType},
          ${entityType ?? null},
          ${entityId    ? `${entityId}::uuid` : null},
          ${targetId    ? `${targetId}::uuid` : null},
          ${verdict},
          ${reasonCode   ?? null},
          ${reasonDetail ?? null},
          ${evidenceSnapshot ? JSON.stringify(evidenceSnapshot) : null}::jsonb,
          ${detail       ? JSON.stringify(detail)       : null}::jsonb,
          ${principalId}::uuid,
          ${principalId}::uuid
        )
      `.execute(this.db);
    } catch (e) {
      this.logger.error("ai_feedback_log_write_failed", { err: String(e) });
    }
  }
}
