import { decideRouteAccess, type AccessSnapshot } from "@athyper/platform-shell-runtime";

export const HOME_WIDGET_IDS = ["recommendations", "workspaces", "quick-actions", "recent"] as const;
export type HomeWidgetId = typeof HOME_WIDGET_IDS[number];

export interface HomeAccessRequirement {
  readonly moduleCode: string;
  readonly requiredPermissions?: readonly string[];
  readonly requiredFeatures?: readonly string[];
}

export interface HomeAccessControlled {
  readonly href: string;
  readonly category?: string;
  readonly access?: HomeAccessRequirement;
}

export interface HomeInteraction {
  readonly visits: number;
  readonly lastVisitedAt: string;
}

export interface HomePersonalization {
  readonly version: 1;
  readonly widgetOrder: readonly HomeWidgetId[];
  readonly hiddenWidgets: readonly HomeWidgetId[];
  readonly interactions: Readonly<Record<string, HomeInteraction>>;
}

export interface HomeRecommendation<T extends HomeAccessControlled> {
  readonly item: T;
  readonly score: number;
  readonly reason: string;
}

export const DEFAULT_HOME_PERSONALIZATION: HomePersonalization = Object.freeze({
  version: 1,
  widgetOrder: Object.freeze([...HOME_WIDGET_IDS]),
  hiddenWidgets: Object.freeze([]),
  interactions: Object.freeze({}),
});

export function isHomeItemAllowed(item: HomeAccessControlled, access: AccessSnapshot): boolean {
  if (!item.access) return access.sessionState === "authenticated" && access.contextAvailable;
  return decideRouteAccess(access, {
    moduleCode: item.access.moduleCode,
    requiredPermissions: item.access.requiredPermissions ?? [],
    requiredFeatures: item.access.requiredFeatures ?? [],
    navigation: "secondary",
  }).allowed;
}

export function recommendHomeItems<T extends HomeAccessControlled>(items: readonly T[], access: AccessSnapshot, personalization: HomePersonalization, now = Date.now(), limit = 4): readonly HomeRecommendation<T>[] {
  return items
    .filter((item) => isHomeItemAllowed(item, access))
    .map((item) => {
      const interaction = personalization.interactions[item.href];
      const recency = interaction ? recencyScore(interaction.lastVisitedAt, now) : 0;
      const roleRelevance = item.access?.requiredPermissions?.length ? 14 : item.access ? 8 : 2;
      const actionRelevance = item.category?.toLocaleLowerCase() === "action" || item.category?.toLocaleLowerCase() === "work" ? 8 : 0;
      const score = roleRelevance + actionRelevance + Math.min(interaction?.visits ?? 0, 8) * 6 + recency;
      const reason = interaction?.visits
        ? interaction.visits > 1 ? "Frequently opened by you" : "Opened recently by you"
        : item.access?.requiredPermissions?.length ? "Recommended for your permissions" : "Available in your workspace";
      return Object.freeze({ item, score, reason });
    })
    .sort((left, right) => right.score - left.score || left.item.href.localeCompare(right.item.href))
    .slice(0, Math.max(0, limit));
}

export function rememberHomeInteraction(personalization: HomePersonalization, href: string, visitedAt = new Date().toISOString()): HomePersonalization {
  if (!safeLocalHref(href)) return personalization;
  const previous = personalization.interactions[href];
  return Object.freeze({
    ...personalization,
    interactions: Object.freeze({
      ...personalization.interactions,
      [href]: Object.freeze({ visits: Math.min((previous?.visits ?? 0) + 1, 10_000), lastVisitedAt: visitedAt }),
    }),
  });
}

export function updateHomeWidgetVisibility(personalization: HomePersonalization, widget: HomeWidgetId, visible: boolean): HomePersonalization {
  const hidden = new Set(personalization.hiddenWidgets);
  if (visible) hidden.delete(widget); else hidden.add(widget);
  return Object.freeze({ ...personalization, hiddenWidgets: Object.freeze(HOME_WIDGET_IDS.filter((candidate) => hidden.has(candidate))) });
}

export function moveHomeWidget(personalization: HomePersonalization, widget: HomeWidgetId, direction: -1 | 1): HomePersonalization {
  const order = [...personalization.widgetOrder], index = order.indexOf(widget), target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return personalization;
  [order[index], order[target]] = [order[target]!, order[index]!];
  return Object.freeze({ ...personalization, widgetOrder: Object.freeze(order) });
}

export function parseHomePersonalization(value: unknown): HomePersonalization {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_HOME_PERSONALIZATION;
  const record = value as Record<string, unknown>;
  const order = Array.isArray(record.widgetOrder) ? record.widgetOrder.filter(isWidgetId) : [];
  const widgetOrder = [...new Set(order), ...HOME_WIDGET_IDS.filter((widget) => !order.includes(widget))];
  const hiddenWidgets = Array.isArray(record.hiddenWidgets) ? [...new Set(record.hiddenWidgets.filter(isWidgetId))] : [];
  const interactions: Record<string, HomeInteraction> = {};
  if (record.interactions && typeof record.interactions === "object" && !Array.isArray(record.interactions)) {
    for (const [href, candidate] of Object.entries(record.interactions as Record<string, unknown>).slice(0, 100)) {
      if (!safeLocalHref(href) || !candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const item = candidate as Record<string, unknown>, visits = Number(item.visits), lastVisitedAt = item.lastVisitedAt;
      if (Number.isSafeInteger(visits) && visits > 0 && visits <= 10_000 && typeof lastVisitedAt === "string" && !Number.isNaN(Date.parse(lastVisitedAt))) interactions[href] = Object.freeze({ visits, lastVisitedAt });
    }
  }
  return Object.freeze({ version: 1, widgetOrder: Object.freeze(widgetOrder), hiddenWidgets: Object.freeze(hiddenWidgets), interactions: Object.freeze(interactions) });
}

export function homePersonalizationStorageKey(plane: string, tenantId: string, principalId: string): string {
  return `athyper.home.personalization.v1:${scopeHash(`${plane}:${tenantId}:${principalId}`)}`;
}

function isWidgetId(value: unknown): value is HomeWidgetId { return typeof value === "string" && (HOME_WIDGET_IDS as readonly string[]).includes(value); }
function safeLocalHref(value: string): boolean { return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/(^|\/)\.\.(\/|$)/.test(value); }
function recencyScore(value: string, now: number): number { const elapsed = now - Date.parse(value); if (!Number.isFinite(elapsed) || elapsed < 0) return 0; if (elapsed < 86_400_000) return 24; if (elapsed < 604_800_000) return 14; if (elapsed < 2_592_000_000) return 6; return 0; }
function scopeHash(value: string): string { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619); return (hash >>> 0).toString(36); }
