/** Portable authoring contract. No transport, database, or app dependencies. */
export const NOTIFICATION_CHANNELS = [
  "in_app",
  "email",
  "push",
  "sms",
  "whatsapp",
  "webhook",
] as const;
/** The notification events each capability publishes; principals may set preferences only for these. */
export const NOTIFICATION_EVENTS = Object.freeze({
  comments: Object.freeze([
    "collaboration.comment.created",
    "collaboration.comment.mentioned",
    "collaboration.comment.edited",
    "collaboration.comment.deleted",
  ] as const),
  attachments: Object.freeze([
    "attachments.finalized",
    "attachments.archived",
    "attachments.categorized",
    "attachments.folder_move",
  ] as const),
});
export type NotificationChannelCode = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationCapability = "comments" | "attachments";
export interface NotificationTemplateReference {
  readonly key: string;
  readonly channel: NotificationChannelCode;
  readonly locale: string;
  readonly version: number;
}
export interface NotificationTemplateDefinition extends NotificationTemplateReference {
  readonly subject: string;
  readonly bodyText: string;
  readonly variables: Readonly<
    Record<string, "string" | "number" | "boolean" | "url">
  >;
}
export interface EntityNotificationRule {
  readonly event: string;
  readonly enabled: boolean;
  readonly recipients: "mentioned" | "actor";
  readonly channels: readonly NotificationChannelCode[];
  readonly templates: readonly NotificationTemplateReference[];
  readonly attachmentMode: "none" | "link" | "embed";
  readonly dedupWindowMs: number;
}
export interface EntityNotificationConfiguration {
  readonly schemaVersion: 1;
  readonly mode: "inherit" | "override" | "disabled";
  readonly defaultPolicyRef: string;
  /** Explicit domain target for a separate Studio configuration identity. */
  readonly targetEntityCode?: string;
  /** Only explicit entity overrides live here. Shared defaults are referenced. */
  readonly templates: readonly NotificationTemplateDefinition[];
  readonly rules: readonly EntityNotificationRule[];
}
export interface NotificationRecordCoordinate {
  readonly resourceType: "document.comment" | "document.attachment";
  readonly resourceId: string;
  readonly parentEntityCode: string;
  readonly parentRecordId: string;
}
export class NotificationConfigurationError extends Error {
  readonly code = "NOTIFICATION_CONFIGURATION_INVALID";
}
const fail = (message: string): never => {
  throw new NotificationConfigurationError(message);
};
function obj(
  v: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    return fail(`${path}: object required`);
  if (Object.keys(v).some((k) => !keys.includes(k)))
    fail(`${path}: unknown property`);
  return v as Record<string, unknown>;
}
function str(v: unknown, path: string, max = 160): string {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    return fail(`${path}: nonempty string up to ${max} characters required`);
  return v;
}
function integer(v: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(v) || Number(v) < min || Number(v) > max)
    return fail(`${path}: integer ${min}..${max} required`);
  return Number(v);
}
function array(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max)
    return fail(`${path}: array of at most ${max} items required`);
  return v;
}
function choice<T extends string>(
  v: unknown,
  choices: readonly T[],
  path: string,
): T {
  if (typeof v !== "string" || !choices.includes(v as T))
    return fail(`${path}: expected ${choices.join(", ")}`);
  return v as T;
}
export const notificationTemplateCoordinate = (
  t: NotificationTemplateReference,
) => `${t.key}:${t.channel}:${t.locale}:${t.version}`;
export function parseNotificationTemplateReference(
  value: unknown,
): NotificationTemplateReference {
  const v = obj(
    value,
    ["key", "channel", "locale", "version"],
    "template reference",
  );
  const key = str(v.key, "template key");
  if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(key)) fail("Invalid template key");
  const locale = str(v.locale, "locale", 16);
  if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(locale)) fail("Invalid template locale");
  return {
    key,
    channel: choice(v.channel, NOTIFICATION_CHANNELS, "channel"),
    locale,
    version: integer(v.version, "template version", 1, 32767),
  };
}
export function parseNotificationTemplate(
  value: unknown,
): NotificationTemplateDefinition {
  const v = obj(
    value,
    ["key", "channel", "locale", "version", "subject", "bodyText", "variables"],
    "template",
  );
  const ref = parseNotificationTemplateReference({
    key: v.key,
    channel: v.channel,
    locale: v.locale,
    version: v.version,
  });
  const subject = str(v.subject, "subject", 240),
    bodyText = str(v.bodyText, "bodyText", 12000);
  if (
    !v.variables ||
    typeof v.variables !== "object" ||
    Array.isArray(v.variables) ||
    Object.keys(v.variables).length > 32
  )
    fail("variables: at most 32 declarations required");
  const variables: Record<string, "string" | "number" | "boolean" | "url"> = {};
  for (const [key, type] of Object.entries(v.variables as object)) {
    if (
      !/^[a-z][a-z0-9_]{0,63}$/.test(key) ||
      ["constructor", "prototype", "__proto__"].includes(key)
    )
      fail("Invalid variable name");
    variables[key] = choice(
      type,
      ["string", "number", "boolean", "url"],
      `variable ${key}`,
    );
  }
  for (const text of [subject, bodyText]) {
    for (const m of text.matchAll(/{{([^{}]*)}}/g))
      if (!Object.hasOwn(variables, m[1]!.trim()))
        fail(`Undeclared template variable: ${m[1]}`);
    if (/[{}]/.test(text.replace(/{{[^{}]*}}/g, "")))
      fail("Invalid template placeholder syntax");
  }
  return { ...ref, subject, bodyText, variables };
}
const shared = NOTIFICATION_CHANNELS.map((channel) =>
  parseNotificationTemplate({
    key: "comment_mention",
    channel,
    locale: "en",
    version: 1,
    subject: "You were mentioned in a comment",
    bodyText: "{{excerpt}}",
    variables: { excerpt: "string" },
  }),
);
/** Versioned platform defaults. Entity drafts cannot shadow these coordinates. */
export function sharedNotificationTemplates(): readonly NotificationTemplateDefinition[] {
  return structuredClone(shared);
}
export function defaultNotificationConfiguration(
  kind: NotificationCapability,
): EntityNotificationConfiguration {
  return {
    schemaVersion: 1,
    mode: "inherit",
    defaultPolicyRef: `platform.${kind}.notifications.v1`,
    templates: [],
    rules: [],
  };
}
function defaults(
  kind: NotificationCapability,
): readonly EntityNotificationRule[] {
  return kind === "comments"
    ? [
        {
          event: "collaboration.comment.mentioned",
          enabled: true,
          recipients: "mentioned",
          channels: ["in_app", "email"],
          templates: shared
            .filter((t) => t.channel === "in_app" || t.channel === "email")
            .map(({ key, channel, locale, version }) => ({
              key,
              channel,
              locale,
              version,
            })),
          attachmentMode: "none",
          dedupWindowMs: 300000,
        },
      ]
    : [];
}
export function parseEntityNotificationConfiguration(
  value: unknown,
  kind: NotificationCapability,
): EntityNotificationConfiguration {
  const v = obj(
    value,
    [
      "schemaVersion",
      "mode",
      "defaultPolicyRef",
      "targetEntityCode",
      "templates",
      "rules",
    ],
    "notifications",
  );
  if (v.schemaVersion !== 1) fail("notifications.schemaVersion: expected 1");
  const mode = choice(
    v.mode,
    ["inherit", "override", "disabled"],
    "notifications.mode",
  );
  if (v.defaultPolicyRef !== `platform.${kind}.notifications.v1`)
    fail("Unpublished or incompatible default notification policy reference");
  if (
    v.targetEntityCode !== undefined &&
    (typeof v.targetEntityCode !== "string" ||
      !/^[a-z][a-z0-9_]{1,62}$/.test(v.targetEntityCode))
  )
    fail("Invalid target entity code");
  const templates = array(v.templates, "templates", 64).map(
    parseNotificationTemplate,
  );
  const coordinates = new Set(shared.map(notificationTemplateCoordinate));
  for (const t of templates) {
    const k = notificationTemplateCoordinate(t);
    if (coordinates.has(k))
      fail(`Duplicate or reserved template coordinate: ${k}`);
    coordinates.add(k);
  }
  const seen = new Set<string>();
  const rules = array(v.rules, "rules", 32).map((value) => {
    const r = obj(
      value,
      [
        "event",
        "enabled",
        "recipients",
        "channels",
        "templates",
        "attachmentMode",
        "dedupWindowMs",
      ],
      "rule",
    );
    const event = str(r.event, "event");
    const events: readonly string[] = NOTIFICATION_EVENTS[kind];
    if (!events.includes(event) || seen.has(event))
      fail(`Unsupported or duplicate notification event: ${event}`);
    seen.add(event);
    if (typeof r.enabled !== "boolean") fail("rule.enabled must be boolean");
    const channels = array(r.channels, "channels", 6).map((c) =>
      choice(c, NOTIFICATION_CHANNELS, "channel"),
    );
    if (
      new Set(channels).size !== channels.length ||
      (r.enabled && !channels.length)
    )
      fail("Enabled rule requires unique channels");
    const refs = array(r.templates, "rule.templates", 32).map(
      parseNotificationTemplateReference,
    );
    if (new Set(refs.map(notificationTemplateCoordinate)).size !== refs.length)
      fail("Duplicate template reference");
    for (const ref of refs)
      if (
        !coordinates.has(notificationTemplateCoordinate(ref)) ||
        !channels.includes(ref.channel)
      )
        fail(
          `Missing or incompatible template reference: ${notificationTemplateCoordinate(ref)}`,
        );
    for (const channel of channels)
      if (
        refs.filter((t) => t.channel === channel && t.locale === "en")
          .length !== 1
      )
        fail(`Exactly one English fallback template required for ${channel}`);
    if (
      new Set(refs.map((t) => `${t.channel}:${t.locale}`)).size !== refs.length
    )
      fail("Only one version per channel and locale may be selected");
    const recipients = choice(
      r.recipients,
      ["mentioned", "actor"],
      "recipients",
    );
    if (
      recipients === "mentioned" &&
      event !== "collaboration.comment.mentioned"
    )
      fail("Mention recipients require a mention event");
    return {
      event,
      enabled: r.enabled as boolean,
      recipients,
      channels,
      templates: refs,
      attachmentMode: choice(
        r.attachmentMode,
        ["none", "link", "embed"],
        "attachmentMode",
      ),
      dedupWindowMs: integer(r.dedupWindowMs, "dedupWindowMs", 0, 86400000),
    };
  });
  if (mode !== "override" && rules.length)
    fail("Only override mode accepts event overrides");
  return {
    schemaVersion: 1,
    mode,
    defaultPolicyRef: v.defaultPolicyRef as string,
    ...(v.targetEntityCode !== undefined
      ? { targetEntityCode: v.targetEntityCode as string }
      : {}),
    templates,
    rules,
  };
}
export function compileEntityNotificationConfiguration(
  value: unknown,
  kind: NotificationCapability,
) {
  const config = parseEntityNotificationConfiguration(value, kind);
  const rules =
    config.mode === "disabled"
      ? []
      : Array.from(
          new Map(
            [...defaults(kind), ...config.rules].map((r) => [r.event, r]),
          ).values(),
        ).filter((r) => r.enabled);
  return {
    schemaVersion: 1 as const,
    mode: config.mode,
    defaultPolicyRef: config.defaultPolicyRef,
    rules,
    templates: config.templates,
  };
}
export function previewNotificationTemplate(value: unknown, input: unknown) {
  const template = parseNotificationTemplate(value);
  const data = obj(input, Object.keys(template.variables), "preview variables");
  for (const [key, type] of Object.entries(template.variables)) {
    const v = data[key];
    if (type === "url") {
      if (typeof v !== "string") fail(`Variable ${key} must be a URL`);
      try {
        const u = new URL(String(v));
        if (u.protocol !== "https:" || u.username || u.password)
          fail(`Variable ${key} must be an HTTPS URL`);
      } catch {
        fail(`Variable ${key} must be an HTTPS URL`);
      }
    } else if (typeof v !== type || (type === "number" && !Number.isFinite(v)))
      fail(`Variable ${key} must be ${type}`);
    if (typeof v === "string" && v.length > 12000)
      fail(`Variable ${key} is too long`);
  }
  const render = (s: string) =>
    s.replace(/{{([^{}]*)}}/g, (_, key: string) => String(data[key.trim()]));
  const subject = render(template.subject),
    bodyText = render(template.bodyText);
  if (subject.length > 998 || /[\r\n]/.test(subject) || bodyText.length > 64000)
    fail("Rendered template exceeds output limits");
  const escape = (v: string) =>
    v
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  return {
    subject,
    bodyText,
    bodyHtml: `<p>${escape(bodyText).replace(/\n/g, "<br>")}</p>`,
    channel: template.channel,
    locale: template.locale,
    version: template.version,
  };
}
export function parseNotificationRecordCoordinate(
  value: unknown,
): NotificationRecordCoordinate {
  const v = obj(
    value,
    ["resourceType", "resourceId", "parentEntityCode", "parentRecordId"],
    "notification record",
  );
  const parentEntityCode = str(v.parentEntityCode, "parentEntityCode");
  if (!/^[a-z][a-z0-9_]*$/.test(parentEntityCode))
    fail("Invalid parent entity code");
  return {
    resourceType: choice(
      v.resourceType,
      ["document.comment", "document.attachment"],
      "resourceType",
    ),
    resourceId: str(v.resourceId, "resourceId", 256),
    parentEntityCode,
    parentRecordId: str(v.parentRecordId, "parentRecordId", 256),
  };
}

/** Validated, versioned Neon projection; intentionally separate from record UI descriptors. */
export function parseNotificationPublicationDescriptor(value: unknown) {
  const v = obj(
    value,
    ["schema", "entityCode", "sourceEntityCode", "notifications"],
    "notification descriptor",
  );
  if (v.schema !== "athyper.entity-notifications/1")
    fail("Unsupported notification descriptor schema");
  const entityCode = str(v.entityCode, "entityCode", 63);
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(entityCode))
    fail("Invalid notification entity code");
  const sourceEntityCode = str(v.sourceEntityCode, "sourceEntityCode", 63);
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(sourceEntityCode))
    fail("Invalid notification source entity code");
  const policies = obj(
    v.notifications,
    ["comments", "attachments"],
    "notification policies",
  );
  if (!Object.keys(policies).length)
    fail("At least one notification policy is required");
  const notifications: Partial<
    Record<NotificationCapability, EntityNotificationConfiguration>
  > = {};
  for (const kind of ["comments", "attachments"] as const)
    if (Object.hasOwn(policies, kind))
      notifications[kind] = parseEntityNotificationConfiguration(
        policies[kind],
        kind,
      );
  for (const config of Object.values(notifications))
    if (config.targetEntityCode !== entityCode)
      fail("Notification policy target mismatch");
  return {
    schema: "athyper.entity-notifications/1" as const,
    sourceEntityCode,
    entityCode,
    notifications,
  };
}
