import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseApiProblem } from "../../packages/contracts/platform/api/src/index";
import { parseSanitizedSession } from "../../packages/contracts/platform/auth-session/src/index";
import { hasPermission, isFeatureEnabled, parseAuthorizationSnapshot } from "../../packages/contracts/platform/authorization/src/index";
import { parseNavigationCatalog } from "../../packages/contracts/platform/navigation/src/index";

const fixture = (name: string): unknown => JSON.parse(readFileSync(`packages/contracts/platform/fixtures/${name}.json`, "utf8"));

describe("browser-facing frontend spine contracts", () => {
  it("accepts the canonical safe fixtures", () => {
    assert.equal(parseApiProblem(fixture("api-problem.v1")).status, 401);
    assert.equal(parseSanitizedSession(fixture("sanitized-session.v1")).state, "authenticated");
    const authorization = parseAuthorizationSnapshot(fixture("authorization-snapshot.v1"));
    assert.equal(hasPermission(authorization, "iam.profile.read"), true);
    assert.equal(isFeatureEnabled(authorization, "experience.new_shell"), true);
    assert.equal(parseNavigationCatalog(fixture("navigation-catalog.v1")).workspaces[0]?.modules[0], "records");
    const bootstrap = fixture("platform-bootstrap.v1") as Record<string, unknown>;
    assert.equal(parseSanitizedSession(bootstrap.session).authEpoch, 7);
    assert.equal(parseAuthorizationSnapshot(bootstrap.authorization).profileHash, "profile-phase2");
    assert.equal(parseNavigationCatalog(bootstrap.navigation).revision, "nav-phase2");
  });

  it("does not expose token-shaped session fields and rejects malformed catalogs", () => {
    const session = fixture("sanitized-session.v1") as Record<string, unknown>;
    const parsed = parseSanitizedSession({ ...session, accessToken: "not-consumed", refreshToken: "not-consumed" });
    assert.equal("accessToken" in parsed, false);
    assert.equal("refreshToken" in parsed, false);
    assert.equal(parsed.realmKey, "athyper");
    const catalog = fixture("navigation-catalog.v1") as Record<string, unknown>;
    assert.throws(() => parseNavigationCatalog({ ...catalog, workspaces: [{ code: "ops", name: "Ops", sortOrder: 0, modules: ["missing"] }] }), /unknown module/);
  });
});
