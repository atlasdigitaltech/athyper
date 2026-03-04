/**
 * DocLetterheadRepo — Kysely repo for core.doc_letterhead
 */

import type { DocLetterhead } from "../domain/models/DocLetterhead.js";
import type { LetterheadId } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "doc.letterhead" as keyof DB & string;

export interface CreateLetterheadInput {
  tenantId: string;
  code: string;
  name: string;
  orgUnitId?: string;
  logoStorageKey?: string;
  headerHtml?: string;
  footerHtml?: string;
  watermarkText?: string;
  watermarkOpacity?: number;
  defaultFonts?: Record<string, unknown>;
  pageMargins?: Record<string, unknown>;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
  createdBy: string;
}

export interface UpdateLetterheadInput {
  name?: string;
  logoStorageKey?: string;
  headerHtml?: string;
  footerHtml?: string;
  watermarkText?: string;
  watermarkOpacity?: number;
  defaultFonts?: Record<string, unknown>;
  pageMargins?: Record<string, unknown>;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
  updatedBy: string;
}

export class DocLetterheadRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(id: LetterheadId): Promise<DocLetterhead | undefined> {
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
  ): Promise<DocLetterhead | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async list(tenantId: string): Promise<DocLetterhead[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .orderBy("code", "asc")
      .execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async getDefault(
    tenantId: string,
    orgUnitId?: string,
  ): Promise<DocLetterhead | undefined> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("is_default", "=", true);

    if (orgUnitId) {
      query = query.where("org_unit_id", "=", orgUnitId);
    }

    const row = await query.executeTakeFirst();

    // Fallback: if no org-unit-specific default, try tenant-level default
    if (!row && orgUnitId) {
      const fallback = await this.db
        .selectFrom(TABLE as any)
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .where("is_default", "=", true)
        .where((eb: any) => eb.or([eb("org_unit_id", "is", null)]))
        .executeTakeFirst();
      return fallback ? this.mapRow(fallback) : undefined;
    }

    return row ? this.mapRow(row) : undefined;
  }

  async create(input: CreateLetterheadInput): Promise<DocLetterhead> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        tenant_id: input.tenantId,
        code: input.code,
        name: input.name,
        org_unit_id: input.orgUnitId ?? null,
        logo_storage_key: input.logoStorageKey ?? null,
        header_html: input.headerHtml ?? null,
        footer_html: input.footerHtml ?? null,
        watermark_text: input.watermarkText ?? null,
        watermark_opacity: input.watermarkOpacity ?? 0.15,
        default_fonts: input.defaultFonts
          ? JSON.stringify(input.defaultFonts)
          : null,
        page_margins: input.pageMargins
          ? JSON.stringify(input.pageMargins)
          : null,
        is_default: input.isDefault ?? false,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        created_at: now,
        created_by: input.createdBy,
      })
      .execute();

    return this.mapRow({
      id,
      tenant_id: input.tenantId,
      code: input.code,
      name: input.name,
      org_unit_id: input.orgUnitId ?? null,
      logo_storage_key: input.logoStorageKey ?? null,
      header_html: input.headerHtml ?? null,
      footer_html: input.footerHtml ?? null,
      watermark_text: input.watermarkText ?? null,
      watermark_opacity: input.watermarkOpacity ?? 0.15,
      default_fonts: input.defaultFonts ?? null,
      page_margins: input.pageMargins ?? null,
      is_default: input.isDefault ?? false,
      metadata: input.metadata ?? null,
      created_at: now,
      created_by: input.createdBy,
      updated_at: null,
      updated_by: null,
    });
  }

  async update(id: LetterheadId, input: UpdateLetterheadInput): Promise<void> {
    const data: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: input.updatedBy,
    };

    if (input.name !== undefined) data.name = input.name;
    if (input.logoStorageKey !== undefined)
      data.logo_storage_key = input.logoStorageKey;
    if (input.headerHtml !== undefined) data.header_html = input.headerHtml;
    if (input.footerHtml !== undefined) data.footer_html = input.footerHtml;
    if (input.watermarkText !== undefined)
      data.watermark_text = input.watermarkText;
    if (input.watermarkOpacity !== undefined)
      data.watermark_opacity = input.watermarkOpacity;
    if (input.defaultFonts !== undefined)
      data.default_fonts = JSON.stringify(input.defaultFonts);
    if (input.pageMargins !== undefined)
      data.page_margins = JSON.stringify(input.pageMargins);
    if (input.isDefault !== undefined) data.is_default = input.isDefault;
    if (input.metadata !== undefined)
      data.metadata = JSON.stringify(input.metadata);

    await this.db
      .updateTable(TABLE as any)
      .set(data)
      .where("id", "=", id)
      .execute();
  }

  private mapRow(row: any): DocLetterhead {
    return {
      id: row.id as LetterheadId,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      orgUnitId: row.org_unit_id,
      logoStorageKey: row.logo_storage_key,
      headerHtml: row.header_html,
      footerHtml: row.footer_html,
      watermarkText: row.watermark_text,
      watermarkOpacity: Number(row.watermark_opacity),
      defaultFonts: this.parseJson(row.default_fonts) as any,
      pageMargins: this.parseJson(row.page_margins) as any,
      isDefault: row.is_default,
      metadata: this.parseJson(row.metadata),
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
