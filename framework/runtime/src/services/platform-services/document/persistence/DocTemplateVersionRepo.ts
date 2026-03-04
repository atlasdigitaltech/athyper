/**
 * DocTemplateVersionRepo — Kysely repo for core.doc_template_version
 */

import type { DocTemplateVersion } from "../domain/models/DocTemplate.js";
import type { TemplateId, TemplateVersionId } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "doc.template_version" as keyof DB & string;

export interface CreateTemplateVersionInput {
  tenantId: string;
  templateId: TemplateId;
  version: number;
  contentHtml?: string;
  contentJson?: Record<string, unknown>;
  headerHtml?: string;
  footerHtml?: string;
  stylesCss?: string;
  variablesSchema?: Record<string, unknown>;
  assetsManifest?: Record<string, string>;
  checksum: string;
  createdBy: string;
}

export class DocTemplateVersionRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(
    id: TemplateVersionId,
  ): Promise<DocTemplateVersion | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async listByTemplate(templateId: TemplateId): Promise<DocTemplateVersion[]> {
    const rows = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("template_id", "=", templateId)
      .orderBy("version", "desc")
      .execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  async getLatestVersion(
    templateId: TemplateId,
  ): Promise<DocTemplateVersion | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("template_id", "=", templateId)
      .orderBy("version", "desc")
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async getNextVersionNumber(templateId: TemplateId): Promise<number> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .select((eb: any) => eb.fn.max("version").as("max_version"))
      .where("template_id", "=", templateId)
      .executeTakeFirst();
    return ((result as any)?.max_version ?? 0) + 1;
  }

  async getEffective(
    templateId: TemplateId,
    asOf?: Date,
  ): Promise<DocTemplateVersion | undefined> {
    const now = asOf ?? new Date();
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("template_id", "=", templateId)
      .where("published_at", "is not", null)
      .where((eb: any) =>
        eb.or([
          eb("effective_from", "is", null),
          eb("effective_from", "<=", now),
        ]),
      )
      .where((eb: any) =>
        eb.or([eb("effective_to", "is", null), eb("effective_to", ">", now)]),
      )
      .orderBy("version", "desc")
      .executeTakeFirst();
    return row ? this.mapRow(row) : undefined;
  }

  async create(input: CreateTemplateVersionInput): Promise<DocTemplateVersion> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        tenant_id: input.tenantId,
        template_id: input.templateId,
        version: input.version,
        content_html: input.contentHtml ?? null,
        content_json: input.contentJson
          ? JSON.stringify(input.contentJson)
          : null,
        header_html: input.headerHtml ?? null,
        footer_html: input.footerHtml ?? null,
        styles_css: input.stylesCss ?? null,
        variables_schema: input.variablesSchema
          ? JSON.stringify(input.variablesSchema)
          : null,
        assets_manifest: input.assetsManifest
          ? JSON.stringify(input.assetsManifest)
          : null,
        checksum: input.checksum,
        created_at: now,
        created_by: input.createdBy,
      })
      .execute();

    return {
      id: id as TemplateVersionId,
      tenantId: input.tenantId,
      templateId: input.templateId,
      version: input.version,
      contentHtml: input.contentHtml ?? null,
      contentJson: input.contentJson ?? null,
      headerHtml: input.headerHtml ?? null,
      footerHtml: input.footerHtml ?? null,
      stylesCss: input.stylesCss ?? null,
      variablesSchema: input.variablesSchema ?? null,
      assetsManifest: input.assetsManifest ?? null,
      checksum: input.checksum,
      publishedAt: null,
      publishedBy: null,
      effectiveFrom: null,
      effectiveTo: null,
      createdAt: now,
      createdBy: input.createdBy,
    };
  }

  async markPublished(
    id: TemplateVersionId,
    publishedBy: string,
  ): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set({
        published_at: new Date(),
        published_by: publishedBy,
      })
      .where("id", "=", id)
      .execute();
  }

  private mapRow(row: any): DocTemplateVersion {
    return {
      id: row.id as TemplateVersionId,
      tenantId: row.tenant_id,
      templateId: row.template_id as TemplateId,
      version: row.version,
      contentHtml: row.content_html,
      contentJson: this.parseJson(row.content_json),
      headerHtml: row.header_html,
      footerHtml: row.footer_html,
      stylesCss: row.styles_css,
      variablesSchema: this.parseJson(row.variables_schema),
      assetsManifest: this.parseJson(row.assets_manifest) as Record<
        string,
        string
      > | null,
      checksum: row.checksum,
      publishedAt: row.published_at ? new Date(row.published_at) : null,
      publishedBy: row.published_by,
      effectiveFrom: row.effective_from ? new Date(row.effective_from) : null,
      effectiveTo: row.effective_to ? new Date(row.effective_to) : null,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
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
