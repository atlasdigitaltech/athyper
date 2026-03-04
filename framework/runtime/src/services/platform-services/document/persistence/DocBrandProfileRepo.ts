/**
 * DocBrandProfileRepo — Kysely repo for core.doc_brand_profile
 */

import type { DocBrandProfile } from "../domain/models/DocBrandProfile.js";
import type { BrandProfileId } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "doc.brand_profile" as keyof DB & string;

export interface CreateBrandProfileInput {
  tenantId: string;
  code: string;
  name: string;
  palette?: Record<string, unknown>;
  typography?: Record<string, unknown>;
  spacingScale?: Record<string, unknown>;
  direction?: string;
  defaultLocale?: string;
  supportedLocales?: string[];
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
  createdBy: string;
}

export interface UpdateBrandProfileInput {
  name?: string;
  palette?: Record<string, unknown>;
  typography?: Record<string, unknown>;
  spacingScale?: Record<string, unknown>;
  direction?: string;
  defaultLocale?: string;
  supportedLocales?: string[];
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
  updatedBy: string;
}

export class DocBrandProfileRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(id: BrandProfileId): Promise<DocBrandProfile | undefined> {
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
  ): Promise<DocBrandProfile | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async list(tenantId: string): Promise<DocBrandProfile[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .orderBy("code", "asc")
      .execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async getDefault(tenantId: string): Promise<DocBrandProfile | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("is_default", "=", true)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async create(input: CreateBrandProfileInput): Promise<DocBrandProfile> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        tenant_id: input.tenantId,
        code: input.code,
        name: input.name,
        palette: input.palette ? JSON.stringify(input.palette) : null,
        typography: input.typography ? JSON.stringify(input.typography) : null,
        spacing_scale: input.spacingScale
          ? JSON.stringify(input.spacingScale)
          : null,
        direction: input.direction ?? "LTR",
        default_locale: input.defaultLocale ?? "en",
        supported_locales: input.supportedLocales ?? [],
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
      palette: input.palette ?? null,
      typography: input.typography ?? null,
      spacing_scale: input.spacingScale ?? null,
      direction: input.direction ?? "LTR",
      default_locale: input.defaultLocale ?? "en",
      supported_locales: input.supportedLocales ?? [],
      is_default: input.isDefault ?? false,
      metadata: input.metadata ?? null,
      created_at: now,
      created_by: input.createdBy,
      updated_at: null,
      updated_by: null,
    });
  }

  async update(
    id: BrandProfileId,
    input: UpdateBrandProfileInput,
  ): Promise<void> {
    const data: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: input.updatedBy,
    };

    if (input.name !== undefined) data.name = input.name;
    if (input.palette !== undefined)
      data.palette = JSON.stringify(input.palette);
    if (input.typography !== undefined)
      data.typography = JSON.stringify(input.typography);
    if (input.spacingScale !== undefined)
      data.spacing_scale = JSON.stringify(input.spacingScale);
    if (input.direction !== undefined) data.direction = input.direction;
    if (input.defaultLocale !== undefined)
      data.default_locale = input.defaultLocale;
    if (input.supportedLocales !== undefined)
      data.supported_locales = input.supportedLocales;
    if (input.isDefault !== undefined) data.is_default = input.isDefault;
    if (input.metadata !== undefined)
      data.metadata = JSON.stringify(input.metadata);

    await this.db
      .updateTable(TABLE as any)
      .set(data)
      .where("id", "=", id)
      .execute();
  }

  private mapRow(row: any): DocBrandProfile {
    return {
      id: row.id as BrandProfileId,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      palette: this.parseJson(row.palette) as any,
      typography: this.parseJson(row.typography) as any,
      spacingScale: this.parseJson(row.spacing_scale) as any,
      direction: row.direction,
      defaultLocale: row.default_locale,
      supportedLocales: row.supported_locales ?? [],
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
