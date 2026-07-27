import { describe, expect, it } from "vitest";

import {
  createNotificationsClientConfig,
  notificationEntityHref,
} from "../config";

const notification = {
  id: "01900000-0000-7000-8000-000000000001",
  message_id: "01900000-0000-7000-8000-000000000002",
  plane_key: "neon",
  type: "record.updated",
  title: "Record updated",
  body: null,
  subject: null,
  event_code: "record.updated",
  payload: {},
  priority: "normal",
  entity_type: "purchase/order",
  entity_id: "record id",
  action_url: null,
  is_read: false,
  read_at: null,
  created_at: "2026-07-25T00:00:00.000Z",
} as const;

const fetcher = async <T,>() => ({} as T);
const navigate = () => undefined;

describe("notifications client configuration", () => {
  it("uses an explicit action URL before an entity fallback", () => {
    const config = createNotificationsClientConfig({
      plane: "neon",
      fetch: fetcher,
      navigate,
      resolveEntityHref: notificationEntityHref,
    });

    expect(config.resolveHref?.({
      ...notification,
      action_url: "/finance/review",
    })).toBe("/finance/review");
  });

  it("encodes entity fallback path segments", () => {
    expect(notificationEntityHref(notification)).toBe(
      "/app/purchase%2Forder/record%20id",
    );
  });

  it("leaves entity fallback disabled unless the plane opts in", () => {
    const config = createNotificationsClientConfig({
      plane: "admin",
      fetch: fetcher,
      navigate,
    });

    expect(config.resolveHref?.(notification)).toBeUndefined();
  });

  it("resolves a same-plane typed target before a legacy action URL", () => {
    const config = createNotificationsClientConfig({
      plane: "neon",
      fetch: fetcher,
      navigate,
    });
    expect(config.resolveHref?.({
      ...notification,
      action_url: "/legacy",
      payload: {
        target: {
          plane: "neon",
          surface: "inbox",
          routeName: "inbox",
        },
      },
    })).toBe("/inbox");
  });

  it("rejects unregistered cross-plane typed targets", () => {
    const config = createNotificationsClientConfig({
      plane: "neon",
      fetch: fetcher,
      navigate,
    });
    expect(config.resolveHref?.({
      ...notification,
      payload: {
        target: {
          plane: "admin",
          surface: "settings",
          routeName: "settings",
        },
      },
    })).toBeUndefined();
  });

  it("rejects destinations outside the registered route manifest", () => {
    const config = createNotificationsClientConfig({
      plane: "neon",
      fetch: fetcher,
      navigate,
      isHrefAllowed: (href) => href === "/dashboard",
    });
    expect(config.resolveHref?.({
      ...notification,
      action_url: "/admin",
    })).toBeUndefined();
  });
});
