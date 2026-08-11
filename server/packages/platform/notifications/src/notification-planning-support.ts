import { createHash } from "node:crypto";

import type { NotificationAttachmentReference, NotificationSourceEvent } from "@athyper/server-contract-notifications";

export interface NotificationTemplate {
  readonly version: number;
  readonly subject: string | null;
  readonly body_text: string | null;
  readonly body_html: string | null;
  readonly body_json: unknown;
  readonly variables_schema: unknown;
}

export function assertNotificationSource(source: NotificationSourceEvent): void {
  if (!isUuid(source.tenantId) || !isUuid(source.actorPrincipalId) || !source.id.trim() || !/^[a-z][a-z0-9_.:-]{1,126}$/.test(source.eventCode)) throw new TypeError("Invalid notification source event");
  if (source.entityType && !/^[a-z][a-z0-9_.-]{1,126}$/.test(source.entityType)) throw new TypeError("Invalid Entity Meta entity code");
}

export function assertAttachmentReference(reference: NotificationAttachmentReference): void {
  if (!isUuid(reference.attachmentId) || !["current", "pinned"].includes(reference.versionPolicy) || !["link", "embed", "auto"].includes(reference.requestedDisposition) || (reference.versionPolicy === "pinned" && !isUuid(reference.attachmentVersionId)) || (reference.versionPolicy === "current" && reference.attachmentVersionId)) throw new TypeError("Invalid notification attachment reference");
}

export function recipientPrincipalIds(raw: unknown, source: NotificationSourceEvent): readonly string[] {
  const rule = object(raw);
  const values = new Set(source.recipientPrincipalIds ?? []);
  if (rule["actor"] === true) values.add(source.actorPrincipalId);
  for (const id of strings(rule["principal_ids"])) values.add(id);
  for (const path of strings(rule["principal_paths"])) {
    const value = at(source.payload, path);
    if (typeof value === "string") values.add(value);
    if (Array.isArray(value)) for (const id of value) if (typeof id === "string") values.add(id);
  }
  return [...values].filter(isUuid).slice(0, 1000);
}

export function evaluatesCondition(raw: unknown, payload: Readonly<Record<string, unknown>>): boolean {
  if (raw === null || raw === undefined) return true;
  const expression = object(raw);
  if (Array.isArray(expression["all"])) return expression["all"].every((item) => evaluatesCondition(item, payload));
  if (Array.isArray(expression["any"])) return expression["any"].some((item) => evaluatesCondition(item, payload));
  if (expression["not"] !== undefined) return !evaluatesCondition(expression["not"], payload);
  const path = typeof expression["path"] === "string" ? expression["path"] : "";
  if (!path) return false;
  const value = at(payload, path);
  if ("eq" in expression) return value === expression["eq"];
  if (Array.isArray(expression["in"])) return expression["in"].includes(value);
  if (typeof expression["exists"] === "boolean") return (value !== undefined) === expression["exists"];
  return false;
}

export function renderNotificationTemplate(template: NotificationTemplate, payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  validateVariables(template.variables_schema, payload);
  const substitute = (value: string, html = false) => value.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, path: string) => {
    const found = at(payload, path);
    if (found === undefined || found === null) throw new Error(`Notification template variable is missing: ${path}`);
    const text = typeof found === "string" ? found : JSON.stringify(found);
    return html ? escapeHtml(text) : text;
  });
  const subject = template.subject ? substitute(template.subject) : undefined;
  const renderedText = template.body_text ? substitute(template.body_text) : undefined;
  const renderedHtml = template.body_html ? substitute(template.body_html, true) : undefined;
  const bodyJson = mapJson(template.body_json, (value) => substitute(value));
  return { ...(subject ? { subject } : {}), ...(renderedText ? { renderedText } : {}), ...(renderedHtml ? { renderedHtml } : {}), ...(bodyJson && typeof bodyJson === "object" && !Array.isArray(bodyJson) ? bodyJson as Record<string, unknown> : {}), data: payload };
}

export function stableHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function retryAttempts(priority: string): number { return priority === "urgent" ? 10 : priority === "high" ? 7 : priority === "low" ? 3 : 5; }
export function isUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

function validateVariables(raw: unknown, payload: Readonly<Record<string, unknown>>): void { for (const key of strings(object(raw)["required"])) if (at(payload, key) === undefined) throw new Error(`Notification template variable is required: ${key}`); }
function mapJson(value: unknown, map: (value: string) => string): unknown { if (typeof value === "string") return map(value); if (Array.isArray(value)) return value.map((item) => mapJson(item, map)); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapJson(item, map)])); return value; }
function at(value: unknown, path: string): unknown { return path.split(".").filter(Boolean).reduce<unknown>((current, key) => current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined, value); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strings(value: unknown): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
