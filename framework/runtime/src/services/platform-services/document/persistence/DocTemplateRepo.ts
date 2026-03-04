/**
 * DocTemplateRepo — Kysely repo for core.doc_template
 */

import type { DocTemplate } from "../domain/models/DocTemplate.js";
import type {
  TemplateId,
  TemplateVersionId,
  TemplateListFilters,
} from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "doc.template" as keyof DB & string;

export interface CreateTemplateInput {
  tenantId: string;
  code: string;
  name: string;
  kind: string;
  engine?: string;
  metadata?: Record<string, unknown>;
  supportsRtl?: boolean;
  requiresLetterhead?: boolean;
  allowedOperations?: string[];
  supportedLocales?: string[];
  createdBy: string;
}

export interface UpdateTemplateInput {
  name?: string;
  kind?: string;
  engine?: string;
  status?: string;
  currentVersionId?: TemplateVersionId;
  metadata?: Record<string, unknown>;
  supportsRtl?: boolean;
  requiresLetterhead?: boolean;
  allowedOperations?: string[];
  supportedLocales?: string[];
  updatedBy: string;
}

export class DocTemplateRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(id: TemplateId): Promise<DocTemplate | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async getByCode(
    tenantId: string,
    code: string,
  ): Promise<DocTemplate | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async list(
    tenantId: string,
    filters?: TemplateListFilters,
  ): Promise<DocTemplate[]> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (filters?.status) {
      query = query.where("status", "=", filters.status);
    }
    if (filters?.kind) {
      query = query.where("kind", "=", filters.kind);
    }
    if (filters?.engine) {
      query = query.where("engine", "=", filters.engine);
    }
    if (filters?.search) {
      query = query.where((eb: any) =>
        eb.or([
          eb("name", "ilike", `%${filters.search}%`),
          eb("code", "ilike", `%${filters.search}%`),
        ]),
      );
    }

    query = query
      .orderBy("code", "asc")
      .limit(filters?.limit ?? 100)
      .offset(filters?.offset ?? 0);

    const rows = await query.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async create(input: CreateTemplateInput): Promise<DocTemplate> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        tenant_id: input.tenantId,
        code: input.code,
        name: input.name,
        kind: input.kind,
        engine: input.engine ?? "HANDLEBARS",
        status: "DRAFT",
        current_version_id: null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        supports_rtl: input.supportsRtl ?? false,
        requires_letterhead: input.requiresLetterhead ?? false,
        allowed_operations: input.allowedOperations ?? null,
        supported_locales: input.supportedLocales ?? null,
        created_at: now,
        created_by: input.createdBy,
      })
      .execute();

    return {
      id: id as TemplateId,
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      kind: input.kind as any,
      engine: (input.engine ?? "HANDLEBARS") as any,
      status: "DRAFT",
      currentVersionId: null,
      metadata: input.metadata ?? null,
      supportsRtl: input.supportsRtl ?? false,
      requiresLetterhead: input.requiresLetterhead ?? false,
      allowedOperations: input.allowedOperations ?? null,
      supportedLocales: input.supportedLocales ?? null,
      createdAt: now,
      createdBy: input.createdBy,
      updatedAt: null,
      updatedBy: null,
    };
  }

  async update(id: TemplateId, input: UpdateTemplateInput): Promise<void> {
    const data: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: input.updatedBy,
    };

    if (input.name !== undefined) data.name = input.name;
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.engine !== undefined) data.engine = input.engine;
    if (input.status !== undefined) data.status = input.status;
    if (input.currentVersionId !== undefined)
      data.current_version_id = input.currentVersionId;
    if (input.metadata !== undefined)
      data.metadata = JSON.stringify(input.metadata);
    if (input.supportsRtl !== undefined) data.supports_rtl = input.supportsRtl;
    if (input.requiresLetterhead !== undefined)
      data.requires_letterhead = input.requiresLetterhead;
    if (input.allowedOperations !== undefined)
      data.allowed_operations = input.allowedOperations;
    if (input.supportedLocales !== undefined)
      data.supported_locales = input.supportedLocales;

    await this.db
      .updateTable(TABLE as any)
      .set(data)
      .where("id", "=", id)
      .execute();
  }

  private mapRow(row: any): DocTemplate {
    return {
      id: row.id as TemplateId,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      engine: row.engine,
      status: row.status,
      currentVersionId: row.current_version_id as TemplateVersionId | null,
      metadata: this.parseJson(row.metadata),
      supportsRtl: row.supports_rtl ?? false,
      requiresLetterhead: row.requires_letterhead ?? false,
      allowedOperations: row.allowed_operations ?? null,
      supportedLocales: row.supported_locales ?? null,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
      updatedBy: row.updated_by,
    };
  }

  private parseJson(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value as Record<string, unknown>;
  }
}
