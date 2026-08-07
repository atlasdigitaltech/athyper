import {
  NotificationCapabilitiesSchema,
  NotificationSchema,
} from "@athyper/api-contracts";
import { describe, expect, it } from "vitest";

describe("notification wire contracts", () => {
  it("accepts the normalized inbox and SSE notification shape", () => {
    expect(NotificationSchema.parse({
      id: "01900000-0000-7000-8000-000000000001",
      message_id: "01900000-0000-7000-8000-000000000002",
      plane_key: "mesh",
      type: "p2p.purchase_order.approved",
      title: "Purchase order approved",
      body: "PO-100 is ready.",
      subject: "Purchase order approved",
      event_code: "p2p.purchase_order.approved",
      payload: { action_url: "/app/purchase_order/01900000-0000-7000-8000-000000000003" },
      priority: "normal",
      entity_type: "purchase_order",
      entity_id: "01900000-0000-7000-8000-000000000003",
      action_url: "/app/purchase_order/01900000-0000-7000-8000-000000000003",
      is_read: false,
      read_at: null,
      created_at: "2026-07-25T00:00:00.000Z",
    }).plane_key).toBe("mesh");
  });

  it("keeps unavailable channels and digest reasons server-driven", () => {
    const result = NotificationCapabilitiesSchema.parse({
      plane_key: "admin",
      channels: [{ code: "whatsapp", available: false, reason: "whatsapp_adapter_unavailable" }],
      digest_frequencies: [{ code: "daily", available: false, reason: "digest_scheduler_unavailable" }],
      effective_preferences: [],
    });
    expect(result.channels[0]?.available).toBe(false);
  });
});
