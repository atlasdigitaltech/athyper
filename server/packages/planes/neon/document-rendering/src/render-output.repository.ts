/**
 * RenderOutputRepository — query helpers for document.render_output.
 * Placeholder for future extraction of read-side queries from RenderDocumentService.
 */

import type { Kysely } from "kysely";

export interface RenderOutputRow {
  id:               string;
  status:           string;
  storage_key:      string | null;
  storage_bucket:   string | null;
  size_bytes:       number | null;
  mime_type:        string | null;
  rendered_at:      string | null;
  error_code:       string | null;
  error_message:    string | null;
  failure_category: string | null;
}

export class RenderOutputRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  async findById(id: string, tenantId: string): Promise<RenderOutputRow | undefined> {
    return this.db
      .selectFrom("document.render_output as ro" as never)
      .selectAll("ro" as never)
      .where("ro.id" as never, "=", id as never)
      .where("ro.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as Promise<RenderOutputRow | undefined>;
  }
}
