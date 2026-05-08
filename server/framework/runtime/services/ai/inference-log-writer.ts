/**
 * InferenceLogWriter — writes one row to log.ai_inference_log per runAction call.
 *
 * PII redaction is applied to input/output before persist.  Full unredacted
 * content is intended to go to S3 (Phase 7c); here only the redacted snapshot
 * is written to the DB.
 *
 * The runtime treats write failures as non-fatal, but the writer itself must
 * surface them so callers can emit metrics/alerts and avoid returning a fake
 * log id.
 */

import { sql } from "kysely";
import { randomUUID } from "node:crypto";
import type { AiLogMetrics, AnyDb, ActionRequest, ActionResponse, AiLogger } from "./ai-runtime.types.js";

const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

// Minimal PII redaction — replaces obvious PII patterns with [REDACTED]
// in the serialised output before it touches the DB.
// Full PII classification (from attachment.pii_types) happens in Phase 7a
// via the attachment gate; this is a best-effort scrub for log safety.
function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const text = JSON.stringify(value);
  // Redact anything that looks like an email, phone, or card number
  const scrubbed = text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\b\+?[\d\s\-().]{8,15}\b/g, (match) =>
      /\d{8,}/.test(match) ? "[REDACTED_PHONE]" : match,
    )
    .replace(/\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, "[REDACTED_CARD]");
  try {
    return JSON.parse(scrubbed);
  } catch {
    return "[PARSE_FAILED_AFTER_REDACTION]";
  }
}

export interface InferenceWriteArgs {
  pipelineId:    string;
  tenantId:      string;
  principalId:   string;
  request:       ActionRequest;
  response:      ActionResponse;
  targetEngine?: string;
}

export class InferenceLogWriter {
  constructor(
    private readonly db:     AnyDb,
    private readonly logger: AiLogger,
    private readonly metrics?: AiLogMetrics,
  ) {}

  async write(args: InferenceWriteArgs): Promise<string> {
    const logId = randomUUID();
    const {
      pipelineId, tenantId, principalId,
      request, response, targetEngine,
    } = args;

    try {
      await sql`
        INSERT INTO log.ai_inference_log (
          id, tenant_id, log_type,
          inference_type, model_id, model_version, target_engine,
          txn_id, confidence, reasoning_chain,
          input, output,
          prediction_type, is_accepted,
          correlation_id,
          created_by
        ) VALUES (
          ${logId}::uuid,
          ${tenantId}::uuid,
          'system',
          'action',
          ${response.model_id}::uuid,
          ${response.model_version},
          ${targetEngine ?? "atlas-ai.foundation"},
          ${pipelineId}::uuid,
          ${response.confidence.overall}::numeric,
          ${JSON.stringify({ prompt_version: response.prompt_version, pipeline_id: pipelineId })}::jsonb,
          ${JSON.stringify(redact(request))}::jsonb,
          ${JSON.stringify(redact(response.output))}::jsonb,
          ${request.action_code},
          NULL,
          ${request.context.correlation_id}::uuid,
          ${principalId !== "" ? principalId : SYSTEM_ACTOR_ID}::uuid
        )
      `.execute(this.db);
    } catch (e) {
      this.metrics?.writeFailed("inference");
      this.logger.error("ai_inference_log_write_failed", {
        pipelineId, err: String(e),
      });
      throw e;
    }

    return logId;
  }
}
