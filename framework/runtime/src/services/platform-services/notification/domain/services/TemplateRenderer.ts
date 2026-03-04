/**
 * TemplateRenderer — Render notification templates with variable substitution.
 *
 * Features:
 * - Mustache-style {{variable}} substitution (consistent with existing patterns)
 * - Zod schema validation for template variables
 * - Locale fallback chain resolution (via NotificationTemplateRepo.resolve)
 * - Preview mode with sample data
 * - Graceful degradation on missing variables (render anyway, log warning)
 */

import { z } from "zod";

import type { Logger } from "../../../../../kernel/logger.js";
import type { NotificationTemplateRepo } from "../../persistence/NotificationTemplateRepo.js";
import type { NotificationTemplate } from "../models/NotificationTemplate.js";
import type { ChannelCode, RenderedTemplate } from "../types.js";

export class TemplateRenderer {
  constructor(
    private readonly templateRepo: NotificationTemplateRepo,
    private readonly logger: Logger,
  ) {}

  /**
   * Resolve and render a template for a given event.
   *
   * Resolution chain (handled by repo):
   * 1. Tenant-specific active template (highest version)
   * 2. System template (tenant_id IS NULL)
   * 3. Locale fallback: "ar-SA" → "ar" → "en"
   */
  async render(
    templateKey: string,
    channel: ChannelCode,
    locale: string,
    variables: Record<string, unknown>,
    tenantId?: string,
  ): Promise<{
    rendered: RenderedTemplate;
    template: NotificationTemplate;
  } | null> {
    const template = await this.templateRepo.resolve(
      templateKey,
      channel,
      locale,
      tenantId,
    );

    if (!template) {
      this.logger.warn(
        { templateKey, channel, locale, tenantId },
        "[notify:template] No template found",
      );
      return null;
    }

    // Validate variables against schema if defined
    this.validateVariables(template, variables);

    const rendered = this.renderTemplate(template, variables);

    return { rendered, template };
  }

  /**
   * Preview a template with sample data (does not require an active template).
   */
  async preview(
    templateId: string,
    sampleVariables: Record<string, unknown>,
  ): Promise<RenderedTemplate | null> {
    const template = await this.templateRepo.getById(templateId as any);
    if (!template) return null;

    return this.renderTemplate(template, sampleVariables);
  }

  /**
   * Render a template directly (without DB lookup).
   */
  renderDirect(
    template: NotificationTemplate,
    variables: Record<string, unknown>,
  ): RenderedTemplate {
    return this.renderTemplate(template, variables);
  }

  /**
   * Validate variables against the template's Zod schema.
   * Logs warnings but does not throw — graceful degradation.
   */
  private validateVariables(
    template: NotificationTemplate,
    variables: Record<string, unknown>,
  ): void {
    if (!template.variablesSchema) return;

    try {
      const schema = this.buildZodSchema(template.variablesSchema);
      const result = schema.safeParse(variables);

      if (!result.success) {
        this.logger.warn(
          {
            templateKey: template.templateKey,
            channel: template.channel,
            locale: template.locale,
            version: template.version,
            errors: result.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
          "[notify:template] Variable validation failed — rendering anyway",
        );
      }
    } catch (err) {
      this.logger.warn(
        {
          templateKey: template.templateKey,
          error: String(err),
        },
        "[notify:template] Failed to build Zod schema from variables_schema",
      );
    }
  }

  /**
   * Build a Zod schema from a JSON schema-like definition.
   *
   * Supports a simple format: { "varName": "string", "amount": "number", ... }
   * This keeps template administration simple while providing runtime validation.
   */
  private buildZodSchema(schemaDef: Record<string, unknown>): z.ZodType {
    const shape: Record<string, z.ZodType> = {};

    for (const [key, typeDef] of Object.entries(schemaDef)) {
      if (typeof typeDef === "string") {
        switch (typeDef) {
          case "string":
            shape[key] = z.string();
            break;
          case "number":
            shape[key] = z.number();
            break;
          case "boolean":
            shape[key] = z.boolean();
            break;
          case "date":
            shape[key] = z.string().or(z.date());
            break;
          default:
            // "string?" → optional string
            if (typeDef.endsWith("?")) {
              const base = typeDef.slice(0, -1);
              shape[key] = this.buildZodSchema({ _: base }).optional();
            } else {
              shape[key] = z.unknown();
            }
        }
      } else if (typeDef && typeof typeDef === "object" && "type" in typeDef) {
        // { type: "string", optional: true }
        const td = typeDef as { type: string; optional?: boolean };
        let fieldSchema = this.primitiveSchema(td.type);
        if (td.optional) fieldSchema = fieldSchema.optional();
        shape[key] = fieldSchema;
      } else {
        shape[key] = z.unknown();
      }
    }

    return z.object(shape).passthrough();
  }

  private primitiveSchema(type: string): z.ZodType {
    switch (type) {
      case "string":
        return z.string();
      case "number":
        return z.number();
      case "boolean":
        return z.boolean();
      case "date":
        return z.string().or(z.date());
      default:
        return z.unknown();
    }
  }

  /**
   * Perform mustache-style {{variable}} substitution across all template fields.
   */
  private renderTemplate(
    template: NotificationTemplate,
    variables: Record<string, unknown>,
  ): RenderedTemplate {
    return {
      subject: template.subject
        ? this.substitute(template.subject, variables)
        : undefined,
      bodyText: template.bodyText
        ? this.substitute(template.bodyText, variables)
        : undefined,
      bodyHtml: template.bodyHtml
        ? this.substitute(template.bodyHtml, variables)
        : undefined,
      bodyJson: template.bodyJson
        ? this.substituteJson(template.bodyJson, variables)
        : undefined,
    };
  }

  /**
   * Replace {{variable}} placeholders in a string.
   */
  private substitute(text: string, variables: Record<string, unknown>): string {
    return text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, key: string) => {
      const value = this.resolveNestedKey(variables, key);
      if (value === undefined || value === null) return "";
      return String(value);
    });
  }

  /**
   * Recursively substitute {{variable}} placeholders in a JSON structure.
   * Only replaces within string values — preserves structure.
   */
  private substituteJson(
    obj: Record<string, unknown>,
    variables: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        result[key] = this.substitute(value, variables);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === "string"
            ? this.substitute(item, variables)
            : item && typeof item === "object"
              ? this.substituteJson(item as Record<string, unknown>, variables)
              : item,
        );
      } else if (value && typeof value === "object") {
        result[key] = this.substituteJson(
          value as Record<string, unknown>,
          variables,
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Resolve a dotted key path (e.g., "entity.displayName") from a variables object.
   */
  private resolveNestedKey(obj: Record<string, unknown>, key: string): unknown {
    const parts = key.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
