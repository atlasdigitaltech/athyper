import { expect, it } from "vitest";
import { defaultNotificationConfiguration } from "@athyper/server-contract-publication";
import {
  resolveEntityNotificationRoute,
  renderEntityNotification,
} from "../entity-notification-routing.js";
const source = {
  id: "event-1",
  planeKey: "neon" as const,
  tenantId: "tenant",
  actorPrincipalId: "author",
  entityType: "document.comment",
  entityId: "comment",
  eventCode: "collaboration.comment.mentioned",
  payload: {
    entity_type: "business_partner",
    entity_id: "bp",
    excerpt: "<unsafe>",
  },
};
it("inherits shared templates for unpublished entities with exact parent coordinates", async () => {
  const route = await resolveEntityNotificationRoute(source, async () => null);
  expect(route).toMatchObject({
    parentEntityCode: "business_partner",
    parentRecordId: "bp",
    resourceId: "comment",
  });
  expect(
    renderEntityNotification(route!, "email", source).rendered.renderedHtml,
  ).toContain("&lt;unsafe&gt;");
});
it("disabled is terminal for a second entity, while unrelated events keep their existing routing", async () => {
  expect(
    await resolveEntityNotificationRoute(
      { ...source, payload: { ...source.payload, entity_type: "employee" } },
      async () => ({
        notifications: {
          comments: {
            configuration: {
              ...defaultNotificationConfiguration("comments"),
              mode: "disabled",
            },
          },
        },
      }),
    ),
  ).toBeNull();
  expect(
    await resolveEntityNotificationRoute(
      { ...source, eventCode: "supplier.onboarding.notice.created" },
      async () => {
        throw Error("Unexpected read");
      },
    ),
  ).toBeUndefined();
});
it("resolves exact override versions and does not notify attachment lifecycle events by default", async () => {
  const config = {
    ...defaultNotificationConfiguration("comments"),
    mode: "override",
    templates: [
      {
        key: "bp_mention",
        channel: "email",
        locale: "en",
        version: 2,
        subject: "BP notice",
        bodyText: "{{excerpt}}",
        variables: { excerpt: "string" },
      },
    ],
    rules: [
      {
        event: source.eventCode,
        enabled: true,
        recipients: "mentioned",
        channels: ["in_app", "email"],
        templates: [
          {
            key: "comment_mention",
            channel: "in_app",
            locale: "en",
            version: 1,
          },
          { key: "bp_mention", channel: "email", locale: "en", version: 2 },
        ],
        attachmentMode: "none",
        dedupWindowMs: 300000,
      },
    ],
  };
  const route = await resolveEntityNotificationRoute(source, async () => ({
    releaseId: "published",
    notifications: { comments: { configuration: config } },
  }));
  expect(
    renderEntityNotification(route!, "email", source).template.version,
  ).toBe(2);
  expect(renderEntityNotification(route!, "in_app", source).template.key).toBe(
    "comment_mention",
  );
  expect(
    await resolveEntityNotificationRoute(
      { ...source, eventCode: "attachments.created" },
      async () => null,
    ),
  ).toBeNull();
});

it("renders the same published parent policy for all five local channels", async () => {
  const channels = ["in_app", "email", "push", "whatsapp", "sms"] as const;
  const route = await resolveEntityNotificationRoute(source, async () => ({
    notifications: { comments: { configuration: {
      ...defaultNotificationConfiguration("comments"),
      mode: "override",
      rules: [{
        event: source.eventCode,
        enabled: true,
        recipients: "mentioned",
        channels,
        templates: channels.map(channel => ({ key: "comment_mention", channel, locale: "en", version: 1 })),
        attachmentMode: "none",
        dedupWindowMs: 300000,
      }],
    } } },
  }));
  expect(route?.rule.channels).toEqual(channels);
  for (const channel of channels) {
    const payload = renderEntityNotification(route!, channel, source);
    expect(payload.template.channel).toBe(channel);
    expect(payload.rendered.body).toBe("<unsafe>");
    expect(payload.rendered.data.entity_id).toBe("bp");
  }
});
