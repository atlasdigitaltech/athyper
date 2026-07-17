import { afterEach, describe, expect, it, vi } from "vitest";

import {
  terminateSession,
  terminateSubjectSessions,
  notifyIamSubjectCleanup,
} from "../session-termination";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AUTH_SUBJECT_CLEANUP_ENABLED;
  delete process.env.RUNTIME_API_URL;
});

function fakeRedis() {
  const deleted: string[] = [];
  const removed: Array<[string, string]> = [];
  const members = new Map<string, string[]>();
  const client = {
    deleted,
    removed,
    members,
    async del(keys: string | string[]) {
      deleted.push(...(Array.isArray(keys) ? keys : [keys]));
      return 1;
    },
    async sRem(key: string, member: string) {
      removed.push([key, member]);
      return 1;
    },
    async sMembers(key: string) {
      return members.get(key) ?? [];
    },
  };
  return client;
}

describe("canonical session termination", () => {
  it("removes the session, short-lived indexes and Keycloak reverse membership", async () => {
    const redis = fakeRedis();
    await terminateSession(redis as never, {
      namespace: "neon",
      sid: "sid-1",
      userId: "user-1",
      keycloakSessionId: "kc-1",
      reason: "manual_logout",
    });

    expect(redis.deleted).toEqual([
      "sess:neon:sid-1",
      "sid_rotation:neon:sid-1",
      "refresh_lock:neon:sid-1",
    ]);
    expect(redis.removed).toEqual([
      ["user_sessions:neon:user-1", "sid-1"],
      ["kc_session:kc-1", "neon:sid-1"],
    ]);
  });

  it("deletes subject sessions across all namespaces", async () => {
    const redis = fakeRedis();
    redis.members.set("user_sessions:neon:user-1", ["n1", "n2"]);
    redis.members.set("user_sessions:platform:user-1", ["p1"]);

    await expect(terminateSubjectSessions(redis as never, "user-1")).resolves.toBe(3);
    expect(redis.deleted).toEqual([
      "sess:neon:n1",
      "sess:neon:n2",
      "user_sessions:neon:user-1",
      "user_sessions:mesh:user-1",
      "user_sessions:admin:user-1",
      "sess:platform:p1",
      "user_sessions:platform:user-1",
    ]);
  });

  it("fails open locally when IAM cleanup is unavailable", async () => {
    process.env.AUTH_SUBJECT_CLEANUP_ENABLED = "on";
    process.env.RUNTIME_API_URL = "http://runtime.test";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("runtime down")));

    await expect(notifyIamSubjectCleanup({
      accessToken: "token",
      subjectId: "user-1",
      reason: "idle_timeout",
      requestId: "req-1",
      auditContext: { tenant: { id: "tenant-1" } },
    })).resolves.toMatchObject({ enabled: true, attempted: true, ok: false });
  });

  it("converges every termination reason on the same idempotent cleanup", async () => {
    const reasons = ["manual_logout", "idle_timeout", "absolute_timeout", "keycloak_backchannel_logout", "admin_forced_logout"] as const;
    for (const reason of reasons) {
      const redis = fakeRedis();
      await terminateSession(redis as never, {
        namespace: "neon",
        sid: `sid-${reason}`,
        userId: "user-1",
        keycloakSessionId: "kc-1",
        reason,
      });
      expect(redis.deleted).toEqual(expect.arrayContaining([
        `sess:neon:sid-${reason}`,
        `sid_rotation:neon:sid-${reason}`,
        `refresh_lock:neon:sid-${reason}`,
      ]));
      expect(redis.removed).toContainEqual(["user_sessions:neon:user-1", `sid-${reason}`]);
      expect(redis.removed).toContainEqual(["kc_session:kc-1", `neon:sid-${reason}`]);
    }
  });
});
