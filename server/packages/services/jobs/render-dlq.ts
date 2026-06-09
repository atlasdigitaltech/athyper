/**
 * Render DLQ helper.
 *
 * Writes to the formal log.render_dlq schema (output_id, error_category,
 * attempt_count, payload, …) — distinct from the generic queue/job-shaped
 * dlq.middleware.ts. The render worker honours the error_category contract
 * documented at stack/compose/render/README.md:
 *
 *   transient | timeout | permanent | crash
 *
 * Best-effort: errors are swallowed and null returned. The DB-side CHECK
 * constraint render_dlq_category_chk enforces the enum.
 */

import { sql, type Kysely } from "kysely";
import { SYSTEM_ACTOR_ID } from "./jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export type RenderDlqCategory =
  | "transient"
  | "timeout"
  | "permanent"
  | "crash";

export interface RenderDlqRecord {
  tenantId:      string;
  outputId:      string;
  renderJobId?:  string | null;
  errorCode:     string;
  errorDetail?:  string | null;
  errorCategory: RenderDlqCategory;
  attemptCount:  number;
  payload?:      Record<string, unknown>;
  actorId?:      string;
}

export async function insertRenderDlq(
  db:  AnyDb,
  rec: RenderDlqRecord,
): Promise<string | null> {
  try {
    const result = await sql<{ id: string }>`
      INSERT INTO log.render_dlq
        (tenant_id,     output_id,      render_job_id,
         error_code,    error_detail,   error_category,
         attempt_count, payload,
         created_by)
      VALUES
        (${rec.tenantId}::uuid,
         ${rec.outputId}::uuid,
         ${rec.renderJobId ?? null}::uuid,
         ${rec.errorCode},
         ${rec.errorDetail ? rec.errorDetail.slice(0, 4096) : null},
         ${rec.errorCategory},
         ${rec.attemptCount},
         ${JSON.stringify(rec.payload ?? {})}::jsonb,
         ${rec.actorId ?? SYSTEM_ACTOR_ID}::uuid)
      RETURNING id
    `.execute(db);
    return result.rows[0]?.id ?? null;
  } catch {
    return null;
  }
}
