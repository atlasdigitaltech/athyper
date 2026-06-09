import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const aclTemplate = new URL("../../../stack/config/memorycache/redis-acl.conf.tpl", import.meta.url);
const aclConfig = new URL("../../../stack/config/memorycache/redis-acl.conf", import.meta.url);
const stagingConfig = new URL("../../../stack/config/memorycache/environments/cache.staging.conf", import.meta.url);
const productionConfig = new URL("../../../stack/config/memorycache/environments/cache.production.conf", import.meta.url);

function appAclTokens(aclFile: URL): Set<string> {
  const raw = readFileSync(aclFile, "utf8");
  const appLine = raw.split(/\r?\n/).find((line) => line.startsWith("user app "));
  if (!appLine) throw new Error(`${aclFile.pathname} is missing the app user`);
  return new Set(appLine.split(/\s+/));
}

describe("Redis ACL contract", () => {
  it("allows every active app cache keyspace", () => {
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
      "~desc:v3:*",
      "~kc_admin_token",
      "~__health_probe__",
    ];

    for (const aclFile of [aclTemplate, aclConfig]) {
      const tokens = appAclTokens(aclFile);
      for (const pattern of requiredPatterns) {
        expect(tokens.has(pattern), `${aclFile.pathname} missing Redis ACL key pattern ${pattern}`).toBe(true);
      }
    }
  });

  it("allows collab activity pubsub only on activity channels", () => {
    for (const aclFile of [aclTemplate, aclConfig]) {
      const tokens = appAclTokens(aclFile);

      expect(tokens.has("&activity:*"), `${aclFile.pathname} missing activity channel pattern`).toBe(true);
      expect(tokens.has("+publish"), `${aclFile.pathname} missing publish command`).toBe(true);
      expect(tokens.has("+subscribe"), `${aclFile.pathname} missing subscribe command`).toBe(true);
      expect(tokens.has("+unsubscribe"), `${aclFile.pathname} missing unsubscribe command`).toBe(true);
      expect(tokens.has("-@pubsub"), `${aclFile.pathname} should not deny the pubsub category`).toBe(false);
    }
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
