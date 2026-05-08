import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const aclTemplate = new URL("../../../stack/config/memorycache/redis-acl.conf.tpl", import.meta.url);
const stagingConfig = new URL("../../../stack/config/memorycache/environments/cache.staging.conf", import.meta.url);
const productionConfig = new URL("../../../stack/config/memorycache/environments/cache.production.conf", import.meta.url);

function appAclTokens(): Set<string> {
  const raw = readFileSync(aclTemplate, "utf8");
  const appLine = raw.split(/\r?\n/).find((line) => line.startsWith("user app "));
  if (!appLine) throw new Error("redis-acl.conf.tpl is missing the app user");
  return new Set(appLine.split(/\s+/));
}

describe("Redis ACL contract", () => {
  it("allows every active app cache keyspace", () => {
    const tokens = appAclTokens();
    const requiredPatterns = [
      "~session:*",
      "~principal_sessions:*",
      "~bootstrap:*",
      "~bootstrap_keys:*",
      "~sess:*",
      "~user_sessions:*",
      "~refresh_lock:*",
      "~sid_rotation:*",
      "~ratelimit:*",
      "~pkce_state:*",
      "~jwks:*",
      "~bull:jobs-*",
      "~mfa_elevation:*",
      "~wa_assert:*",
      "~ff:*",
      "~oauth2:token:*",
      "~ai:*",
      "~desc:v2:*",
      "~kc_admin_token",
      "~__health_probe__",
    ];

    for (const pattern of requiredPatterns) {
      expect(tokens.has(pattern), `missing Redis ACL key pattern ${pattern}`).toBe(true);
    }
  });

  it("allows collab activity pubsub only on activity channels", () => {
    const tokens = appAclTokens();

    expect(tokens.has("&activity:*")).toBe(true);
    expect(tokens.has("+publish")).toBe(true);
    expect(tokens.has("+subscribe")).toBe(true);
    expect(tokens.has("+unsubscribe")).toBe(true);
    expect(tokens.has("-@pubsub")).toBe(false);
  });

  it("keeps environment configs from declaring a duplicate aclfile", () => {
    for (const configUrl of [stagingConfig, productionConfig]) {
      const raw = readFileSync(configUrl, "utf8");
      const activeLines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));
      expect(activeLines.some((line) => line.startsWith("aclfile "))).toBe(false);
    }
  });
});
