import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseApiProblem } from "../../packages/contracts/platform/api/src/index";
import { parseSanitizedSession } from "../../packages/contracts/platform/auth-session/src/index";
import { parseAuthorizationSnapshot } from "../../packages/contracts/platform/authorization/src/index";
import { parseNavigationCatalog } from "../../packages/contracts/platform/navigation/src/index";

const fixture = (name: string): unknown => JSON.parse(readFileSync(`packages/contracts/platform/fixtures/${name}.json`, "utf8"));

describe("server producer compatibility for frontend spine contracts", () => {
  it("validates every canonical producer fixture", () => {
    assert.doesNotThrow(() => parseApiProblem(fixture("api-problem.v1")));
    assert.doesNotThrow(() => parseSanitizedSession(fixture("sanitized-session.v1")));
    assert.doesNotThrow(() => parseAuthorizationSnapshot(fixture("authorization-snapshot.v1")));
    assert.doesNotThrow(() => parseNavigationCatalog(fixture("navigation-catalog.v1")));
    const bootstrap = fixture("platform-bootstrap.v1") as Record<string, unknown>;
    assert.equal(bootstrap.schemaVersion, 1);
    assert.doesNotThrow(() => parseSanitizedSession(bootstrap.session));
    assert.doesNotThrow(() => parseAuthorizationSnapshot(bootstrap.authorization));
    assert.doesNotThrow(() => parseNavigationCatalog(bootstrap.navigation));
  });

  it("fails closed on incomplete authenticated context and invalid feature provenance", () => {
    assert.throws(() => parseSanitizedSession({ schemaVersion: 1, state: "authenticated", plane: "mesh", requiredActions: [] }), /requires realm, context/);
    const snapshot = fixture("authorization-snapshot.v1") as Record<string, unknown>;
    assert.throws(() => parseAuthorizationSnapshot({ ...snapshot, features: { "experience.new_shell": { code: "experience.new_shell", enabled: true, source: "browser", revision: "r1" } } }), /source is invalid/);
  });

  it("accepts legacy schema-v1 sessions that omit an empty requiredActions field", () => {
    const parsed = parseSanitizedSession({ schemaVersion: 1, state: "anonymous", plane: "neon" });
    assert.deepEqual(parsed.requiredActions, []);
    assert.deepEqual(parseSanitizedSession({ schemaVersion: 1, state: "anonymous", plane: "neon", requiredActions: null }).requiredActions, []);
    assert.deepEqual(parseSanitizedSession({ schemaVersion: 1, state: "anonymous", plane: "neon", requiredActions: {} }).requiredActions, []);
    assert.throws(() => parseSanitizedSession({ schemaVersion: 1, state: "anonymous", plane: "neon", requiredActions: "UPDATE_PASSWORD" }), /requiredActions must be an array/);
    assert.throws(() => parseSanitizedSession({ schemaVersion: 1, state: "anonymous", plane: "neon", requiredActions: { UPDATE_PASSWORD: true } }), /requiredActions must be an array/);
    assert.throws(() => parseSanitizedSession({ schemaVersion: 1, state: "required_action", plane: "neon" }), /requires actions/);
  });
});

it("session expiry is a real offset timestamp, independent of runtime date utilities", () => {
  const session = parseSanitizedSession(fixture("sanitized-session.v1"));
  for (const expiresAt of ["2028-02-29T23:59:59.123456789Z", "2026-09-09T10:00:00+08:00", "2026-09-09T10:00:00-05:30"]) {
    assert.doesNotThrow(() => parseSanitizedSession({ ...session, expiresAt }));
  }
  for (const expiresAt of ["2026-02-29T10:00:00Z", "2100-02-29T10:00:00Z", "2026-04-31T10:00:00Z", "2026-09-09", "2026-09-09T10:00:00", "2026-09-09T24:00:00Z", "2026-09-09T10:00:00+24:00", "2026-09-09T10:00:00+00:60"]) {
    assert.throws(() => parseSanitizedSession({ ...session, expiresAt }), /ISO timestamp/);
  }
});
