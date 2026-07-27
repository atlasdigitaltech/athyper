import { describe, expect, it } from "vitest";
import { notificationStorageKey, type NotificationsClientConfig } from "../config";

const base = {
  fetch: async <T,>() => ({} as T),
  navigate: () => undefined,
} satisfies Pick<NotificationsClientConfig, "fetch" | "navigate">;

describe("notification storage isolation", () => {
  it("uses different keys for the same browser on different planes", () => {
    const neon = notificationStorageKey({ ...base, plane: "neon" }, "subscription_id");
    const mesh = notificationStorageKey({ ...base, plane: "mesh" }, "subscription_id");
    const admin = notificationStorageKey({ ...base, plane: "admin" }, "subscription_id");

    expect(new Set([neon, mesh, admin])).toHaveLength(3);
    expect(neon).toBe("athyper_neon_push_subscription_id");
  });
});
