import type { NotificationSourceEvent } from "@athyper/server-contract-notifications";
import {
  compileEntityNotificationConfiguration,
  defaultNotificationConfiguration,
  notificationTemplateCoordinate,
  previewNotificationTemplate,
  sharedNotificationTemplates,
  type NotificationCapability,
  type EntityNotificationRule,
  type NotificationTemplateDefinition,
} from "@athyper/server-contract-publication";

export interface EntityNotificationRoute {
  readonly parentEntityCode: string;
  readonly parentRecordId: string;
  readonly resourceId: string;
  readonly capability: NotificationCapability;
  readonly rule: EntityNotificationRule;
  readonly templates: readonly NotificationTemplateDefinition[];
  readonly releaseId?: string;
}
/** Undefined means an unrelated event; null is a terminal suppression, never legacy fallback. */
export async function resolveEntityNotificationRoute(
  source: NotificationSourceEvent,
  read: (
    entityCode: string,
  ) => Promise<{
    releaseId?: string;
    notifications: Readonly<Record<string, unknown>>;
  } | null>,
): Promise<EntityNotificationRoute | null | undefined> {
  const capability = source.eventCode.startsWith("collaboration.comment.")
    ? "comments"
    : source.eventCode.startsWith("attachments.")
      ? "attachments"
      : undefined;
  if (!capability || source.planeKey !== "neon") return undefined;
  const parentEntityCode = source.payload.entity_type,
    parentRecordId = source.payload.entity_id;
  if (
    typeof parentEntityCode !== "string" ||
    !/^[a-z][a-z0-9_]{1,62}$/.test(parentEntityCode) ||
    typeof parentRecordId !== "string" ||
    !parentRecordId ||
    !source.entityId
  )
    return null;
  const published = await read(parentEntityCode);
  const entry = published?.notifications[capability] as
    { configuration?: unknown } | undefined;
  // Missing settings inherit shared defaults. Explicit disabled compiles to zero rules.
  const projection = compileEntityNotificationConfiguration(
    entry?.configuration ?? defaultNotificationConfiguration(capability),
    capability,
  );
  const rule = projection.rules.find((r) => r.event === source.eventCode);
  if (!rule) return null;
  return {
    parentEntityCode,
    parentRecordId,
    resourceId: source.entityId,
    capability,
    rule,
    templates: [...sharedNotificationTemplates(), ...projection.templates],
    ...(published?.releaseId ? { releaseId: published.releaseId } : {}),
  };
}
export function renderEntityNotification(
  route: EntityNotificationRoute,
  channel: EntityNotificationRule["channels"][number],
  source: NotificationSourceEvent,
) {
  const refs = route.rule.templates.filter((ref) => ref.channel === channel);
  const ref =
    refs.find((ref) => ref.locale === (source.locale ?? "en")) ??
    refs.find((ref) => ref.locale === "en");
  const template =
    ref &&
    route.templates.find(
      (t) =>
        notificationTemplateCoordinate(t) ===
        notificationTemplateCoordinate(ref),
    );
  if (!template)
    throw new Error("Published notification template is unavailable");
  const variables = Object.fromEntries(
    Object.keys(template.variables).map((key) => [key, source.payload[key]]),
  );
  const preview = previewNotificationTemplate(template, variables);
  return {
    template,
    rendered: {
      templateKey: template.key,
      subject: preview.subject,
      renderedText: preview.bodyText,
      renderedHtml: preview.bodyHtml,
      title: preview.subject,
      body: preview.bodyText,
      data: source.payload,
    },
  };
}
