/**
 * DocTemplateService — Template lifecycle management.
 *
 * Handles template CRUD, versioning (with checksums), publish/retire,
 * and resolution via bindings.
 *
 * Enhancements:
 * - HTML sanitization on version content (strips <script>, event handlers, javascript: URIs)
 * - Schema validation at version creation (validates variablesSchema structure)
 * - Audit event emission via DocAuditEmitter
 */

import { createHash } from "node:crypto";

import { SanitizationProfiles } from "@athyper/core";

import type { DocAuditEmitter } from "./DocAuditEmitter.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { DocTemplateBindingRepo } from "../../persistence/DocTemplateBindingRepo.js";
import type {
  DocTemplateRepo,
  CreateTemplateInput,
} from "../../persistence/DocTemplateRepo.js";
import type { DocTemplateVersionRepo } from "../../persistence/DocTemplateVersionRepo.js";
import type { DocTemplate, DocTemplateVersion } from "../models/DocTemplate.js";
import type { DocTemplateBinding } from "../models/DocTemplateBinding.js";
import type { TemplateId, TemplateVersionId } from "../types.js";

export interface CreateVersionData {
  contentHtml?: string;
  contentJson?: Record<string, unknown>;
  headerHtml?: string;
  footerHtml?: string;
  stylesCss?: string;
  variablesSchema?: Record<string, unknown>;
  assetsManifest?: Record<string, string>;
  createdBy: string;
}

export class DocTemplateService {
  constructor(
    private readonly templateRepo: DocTemplateRepo,
    private readonly versionRepo: DocTemplateVersionRepo,
    private readonly bindingRepo: DocTemplateBindingRepo,
    private readonly logger: Logger,
    private readonly auditEmitter?: DocAuditEmitter,
  ) {}

  async create(
    tenantId: string,
    data: Omit<CreateTemplateInput, "tenantId">,
  ): Promise<DocTemplate> {
    const existing = await this.templateRepo.getByCode(tenantId, data.code);
    if (existing) {
      throw new Error(
        `Template with code '${data.code}' already exists for this tenant`,
      );
    }

    const template = await this.templateRepo.create({ tenantId, ...data });

    await this.auditEmitter?.templateCreated(
      { kind: "user", userId: data.createdBy },
      tenantId,
      template.id,
      template.code,
    );

    this.logger.info(
      { templateId: template.id, code: template.code },
      "[doc:template] Template created",
    );
    return template;
  }

  async getById(id: TemplateId): Promise<DocTemplate | undefined> {
    return this.templateRepo.getById(id);
  }

  async createVersion(
    templateId: TemplateId,
    data: CreateVersionData,
  ): Promise<DocTemplateVersion> {
    const template = await this.templateRepo.getById(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Validate variablesSchema structure if provided
    if (data.variablesSchema) {
      this.validateVariablesSchema(data.variablesSchema);
    }

    // Sanitize HTML content — strip <script>, event handlers, javascript: protocols
    const sanitizedData = {
      ...data,
      contentHtml: data.contentHtml
        ? SanitizationProfiles.richText(data.contentHtml)
        : data.contentHtml,
      headerHtml: data.headerHtml
        ? SanitizationProfiles.richText(data.headerHtml)
        : data.headerHtml,
      footerHtml: data.footerHtml
        ? SanitizationProfiles.richText(data.footerHtml)
        : data.footerHtml,
    };

    const nextVersion = await this.versionRepo.getNextVersionNumber(templateId);
    const checksum = this.computeContentChecksum(sanitizedData);

    const version = await this.versionRepo.create({
      tenantId: template.tenantId,
      templateId,
      version: nextVersion,
      contentHtml: sanitizedData.contentHtml,
      contentJson: sanitizedData.contentJson,
      headerHtml: sanitizedData.headerHtml,
      footerHtml: sanitizedData.footerHtml,
      stylesCss: sanitizedData.stylesCss,
      variablesSchema: sanitizedData.variablesSchema,
      assetsManifest: sanitizedData.assetsManifest,
      checksum,
      createdBy: sanitizedData.createdBy,
    });

    await this.auditEmitter?.versionCreated(
      { kind: "user", userId: data.createdBy },
      template.tenantId,
      templateId,
      nextVersion,
    );

    this.logger.info(
      { templateId, version: nextVersion, checksum },
      "[doc:template] Version created",
    );

    return version;
  }

  async publish(
    templateId: TemplateId,
    versionId: TemplateVersionId,
    publishedBy: string,
  ): Promise<void> {
    const template = await this.templateRepo.getById(templateId);
    if (!template) throw new Error(`Template not found: ${templateId}`);

    const version = await this.versionRepo.getById(versionId);
    if (!version) throw new Error(`Version not found: ${versionId}`);
    if (version.templateId !== templateId)
      throw new Error("Version does not belong to this template");

    // Mark version as published
    await this.versionRepo.markPublished(versionId, publishedBy);

    // Update template: status → PUBLISHED, current_version_id → this version
    await this.templateRepo.update(templateId, {
      status: "PUBLISHED",
      currentVersionId: versionId,
      updatedBy: publishedBy,
    });

    await this.auditEmitter?.templatePublished(
      { kind: "user", userId: publishedBy },
      template.tenantId,
      templateId,
      versionId,
    );

    this.logger.info(
      { templateId, versionId, version: version.version },
      "[doc:template] Template published",
    );
  }

  async retire(templateId: TemplateId, retiredBy: string): Promise<void> {
    const template = await this.templateRepo.getById(templateId);

    await this.templateRepo.update(templateId, {
      status: "RETIRED",
      updatedBy: retiredBy,
    });

    if (template) {
      await this.auditEmitter?.templateRetired(
        { kind: "user", userId: retiredBy },
        template.tenantId,
        templateId,
      );
    }

    this.logger.info({ templateId }, "[doc:template] Template retired");
  }

  async resolveTemplate(
    tenantId: string,
    entityName: string,
    operation: string,
    variant?: string,
  ): Promise<
    | {
        template: DocTemplate;
        version: DocTemplateVersion;
        binding: DocTemplateBinding;
      }
    | undefined
  > {
    const binding = await this.bindingRepo.resolve(
      tenantId,
      entityName,
      operation,
      variant,
    );
    if (!binding) return undefined;

    const template = await this.templateRepo.getById(binding.templateId);
    if (
      !template ||
      template.status !== "PUBLISHED" ||
      !template.currentVersionId
    )
      return undefined;

    const version = await this.versionRepo.getById(template.currentVersionId);
    if (!version) return undefined;

    return { template, version, binding };
  }

  async getEffectiveVersion(
    templateId: TemplateId,
    asOf?: Date,
  ): Promise<DocTemplateVersion | undefined> {
    return this.versionRepo.getEffective(templateId, asOf);
  }

  /**
   * Validates that variablesSchema has a valid structure.
   * Must have `properties` as an object and `required` as a string array (if present).
   */
  private validateVariablesSchema(schema: Record<string, unknown>): void {
    if (schema.required !== undefined) {
      if (!Array.isArray(schema.required)) {
        throw new Error("variablesSchema.required must be an array of strings");
      }
      for (const item of schema.required) {
        if (typeof item !== "string") {
          throw new Error("variablesSchema.required must contain only strings");
        }
      }
    }

    if (schema.properties !== undefined) {
      if (
        typeof schema.properties !== "object" ||
        schema.properties === null ||
        Array.isArray(schema.properties)
      ) {
        throw new Error("variablesSchema.properties must be an object");
      }

      for (const [key, def] of Object.entries(
        schema.properties as Record<string, unknown>,
      )) {
        if (typeof def !== "object" || def === null) {
          throw new Error(
            `variablesSchema.properties.${key} must be an object`,
          );
        }
      }
    }
  }

  private computeContentChecksum(data: CreateVersionData): string {
    const hash = createHash("sha256");
    hash.update(data.contentHtml ?? "");
    hash.update(data.headerHtml ?? "");
    hash.update(data.footerHtml ?? "");
    hash.update(data.stylesCss ?? "");
    hash.update(JSON.stringify(data.contentJson ?? {}));
    hash.update(JSON.stringify(data.assetsManifest ?? {}));
    return hash.digest("hex");
  }
}
