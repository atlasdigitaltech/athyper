import { describe, expect, it } from "vitest";
import type { Notification } from "@athyper/api-contracts";

import { createNotificationsConfig } from "@/lib/notifications-config";

const notification: Notification = {
  id: "01900000-0000-7000-8000-000000000001",
  message_id: "01900000-0000-7000-8000-000000000002",
  plane_key: "mesh",
  type: "record.updated",
  title: "Record updated",
  body: null,
  subject: null,
  event_code: "record.updated",
  payload: {},
  priority: "normal",
  entity_type: "purchase-order",
  entity_id: "record id",
  action_url: null,
  is_read: false,
  read_at: null,
  created_at: "2026-07-25T00:00:00.000Z",
};

describe("Mesh notifications configuration", () => {
  it("uses an entity fallback only for detail-enabled catalog entries", () => {
    const enabled = createNotificationsConfig(
      () => undefined,
      new Set(["purchase_order"]),
    );
    const disabled = createNotificationsConfig(
      () => undefined,
      new Set(["supplier"]),
    );

    expect(enabled.plane).toBe("mesh");
    expect(enabled.resolveHref?.(notification)).toBe(
      "/app/purchase_order/record%20id",
    );
    expect(disabled.resolveHref?.(notification)).toBeUndefined();
  });

  it("prefers the explicit action URL even when the entity is not enabled", () => {
    const config = createNotificationsConfig(
      () => undefined,
      new Set(),
    );

    expect(config.resolveHref?.({
      ...notification,
      action_url: "/inbox/review",
    })).toBe("/inbox/review");
  });
});
