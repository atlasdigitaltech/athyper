import type { Route } from "@playwright/test";
import { collectionFixture } from "../activity-collection-fixtures";

// Deterministic activity data for the visual baseline: the real activity data
// source runs against these stubbed endpoints. Times are relative to the fixed
// baseline clock (2026-09-30T09:30Z).
const notification = (id: string, fields: Record<string, unknown>) => ({
  id,
  tenantId: "t",
  principalId: "p",
  planeKey: "neon",
  templateKey: "record_update",
  eventCode: "entity.record.updated",
  priority: "normal",
  payload: {},
  ...fields,
});
const unavailable = (id: string) =>
  notification(id, {
    title: "Record update unavailable",
    body: "The related record or comment is no longer available, or your access has changed.",
    entityType: "business_partner",
    createdAt: "2026-09-25T06:00:00Z",
  });
export const ACTIVITY_NOTIFICATIONS = [
  notification("n1", {
    templateKey: "comment_mention",
    eventCode: "collaboration.comment.mentioned",
    title: "Alex Tan mentioned you",
    body: "Can you confirm the bank details for Northwind before Friday?",
    entityType: "business_partner",
    entityId: "bp-1",
    recordLabel: "Business Partner · Northwind Industrial",
    href: "/records/bp-1?panel=collaboration#comment-1",
    actionLabel: "View comment",
    createdAt: "2026-09-30T09:10:00Z",
  }),
  notification("n2", {
    templateKey: "approval_requested",
    eventCode: "workflow.approval.requested",
    title: "Approval requested",
    body: "Supplier onboarding for Acme Trading needs your approval.",
    priority: "high",
    entityType: "business_partner",
    entityId: "bp-2",
    recordLabel: "Business Partner · Acme Trading",
    href: "/records/bp-2",
    actionLabel: "Review request",
    createdAt: "2026-09-30T07:45:00Z",
  }),
  notification("n6", {
    title: "Northwind Industrial was updated",
    body: "Payment terms changed to 30 days.",
    entityType: "business_partner",
    entityId: "bp-1",
    recordLabel: "Business Partner · Northwind Industrial",
    href: "/records/bp-1",
    actionLabel: "Open record",
    readAt: "2026-09-29T12:00:00Z",
    createdAt: "2026-09-29T11:00:00Z",
  }),
  unavailable("n3"),
  unavailable("n4"),
  unavailable("n5"),
];
const workItem = (id: string, fields: Record<string, unknown>) => ({
  id,
  tenantId: "t",
  workTypeCode: "approval",
  sourceEntityCode: "business_partner",
  sourceEntityId: "bp-2",
  availableAt: "2026-09-28T08:00:00Z",
  priority: "normal",
  payload: {},
  status: "open",
  rowVersion: 1,
  createdAt: "2026-09-28T08:00:00Z",
  createdBy: "system",
  ...fields,
});
export const ACTIVITY_WORK_ITEMS = [
  workItem("w1", {
    title: "Approve supplier onboarding",
    description: "Acme Trading requested supplier status.",
    recordLabel: "Business Partner · Acme Trading",
    href: "/records/bp-2",
    actionLabel: "Review request",
    priority: "high",
    dueAt: "2026-09-29T17:00:00Z",
  }),
  workItem("w2", {
    title: "Verify bank account change",
    description: "Northwind Industrial changed its settlement account.",
    recordLabel: "Business Partner · Northwind Industrial",
    href: "/records/bp-1",
    actionLabel: "Verify",
    status: "claimed",
    dueAt: "2026-10-03T17:00:00Z",
    sourceEntityId: "bp-1",
  }),
];

/** Route handler for the activity API; returns false for other requests. */
export function activityApi(
  options: {
    readonly emptyInbox?: boolean;
    /** Receives "read n3", "dismiss n4"… for notification actions. */
    readonly actions?: string[];
  } = {},
) {
  const workItems = options.emptyInbox ? [] : ACTIVITY_WORK_ITEMS;
  const collections = collectionFixture();
  return async (route: Route): Promise<boolean> => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return false;
    if (await collections(route, '["t","p","neon"]')) return true;
    if (url.pathname.endsWith("/notifications/inbox")) {
      await route.fulfill({
        json: {
          notifications: ACTIVITY_NOTIFICATIONS,
          unreadCount: 5,
          matchingCount: ACTIVITY_NOTIFICATIONS.length,
          viewScope: '["t","p","neon"]',
          facets: { entities: ["business_partner"], types: ["collaboration.comment.mentioned", "entity.record.updated"] },
        },
      });
      return true;
    }
    // Notification preferences: In-app and Email saved; Email is not set up for the
    // organisation, push needs browser permission, SMS and WhatsApp are not set up.
    if (url.pathname.endsWith("/notifications/preferences/preview")) {
      const preview = (channel: string, reason: string) => ({ channel, enabled: reason === "enabled", supported: reason !== "unsupported", consented: reason !== "consent_required", reason });
      await route.fulfill({
        json: {
          previews: [{
            eventCode: "collaboration.comment.mentioned",
            channels: [preview("in_app", "enabled"), preview("email", "unsupported"), preview("push", "consent_required"), preview("sms", "unsupported"), preview("whatsapp", "unsupported")],
          }],
        },
      });
      return true;
    }
    if (url.pathname.endsWith("/notifications/preferences")) {
      await route.fulfill({ json: { version: 1, preferences: [{ tenantId: "t", principalId: "p", eventCode: "collaboration.comment.mentioned", channels: ["in_app", "email"], version: 1 }] } });
      return true;
    }
    if (url.pathname.endsWith("/notifications/deliveries")) {
      await route.fulfill({
        json: {
          items: [
            { id: "11111111-1111-4111-8111-111111111111", channel: "email", status: "failed", subject: "Aisha Rahman mentioned you on Northwind Industrial", error: "Mailbox unavailable", createdAt: "2026-09-30T08:40:00Z", attemptCount: 2 },
            { id: "22222222-2222-4222-8222-222222222222", channel: "in_app", status: "delivered", subject: "Daniel Okafor mentioned you on Acme Trading", error: null, createdAt: "2026-09-30T07:10:00Z", attemptCount: 1 },
          ],
        },
      });
      return true;
    }
    // Entity directory: only these entities are listable; anything else requested
    // (for example person_address_use, placed in Location & Address) is left out.
    if (url.pathname.endsWith("/entity-runtime/directory")) {
      const titles: Record<string, [string, string, string?]> = {
        country: ["Countries", "ISO 3166 countries with calling codes and regions."],
        currency: ["Currencies", "ISO 4217 currencies and minor units.", "database-currency"],
        language: ["Languages", "ISO 639 languages used across the platform."],
        locale: ["Locales", "Language and region formats."],
        timezone: ["Time Zones", "IANA time zones and offsets."],
        state_region: ["States & Regions", "First-level subdivisions of each country."],
        address: ["Addresses", "Postal addresses shared by records."],
        business_partner: ["Business Partners", "Suppliers, customers and partners."],
        business_partner_request: ["Business Partner Requests", "Requests to create or change partners."],
      };
      const codes = url.searchParams.getAll("entity").filter((code) => code in titles);
      await route.fulfill({ json: { items: codes.map((code) => ({ entityCode: code, title: titles[code]![0], description: titles[code]![1], ...(titles[code]![2] ? { iconKey: titles[code]![2] } : {}), ...(code === "country" ? { count: 247 } : code === "currency" ? { count: 1 } : {}), actions: code === "country" || code === "business_partner" ? [{ key: "create", label: `New ${titles[code]![0].replace(/ies$/, "y").replace(/s$/, "")}`, href: `/app/entity/${code}/new` }] : [] })) } });
      return true;
    }
    if (url.pathname.endsWith("/notifications/counts")) {
      await route.fulfill({ json: { unread: 5 } });
      return true;
    }
    if (url.pathname.endsWith("/workflow/inbox")) {
      await route.fulfill({
        json: { data: workItems, totalCount: workItems.length, matchingCount: workItems.length, viewScope: '["t","p","neon"]' },
      });
      return true;
    }
    const action = /\/notifications\/([^/]+)\/(read|dismiss)$/.exec(url.pathname);
    if (action && route.request().method() === "POST") {
      options.actions?.push(`${action[2]} ${decodeURIComponent(action[1]!)}`);
      await route.fulfill({ status: 204, body: "" });
      return true;
    }
    if (url.pathname.endsWith("/notifications/stream")) {
      await route.fulfill({ contentType: "text/event-stream", body: "" });
      return true;
    }
    await route.fulfill({ status: 404, json: { message: "Not in fixture" } });
    return true;
  };
}
