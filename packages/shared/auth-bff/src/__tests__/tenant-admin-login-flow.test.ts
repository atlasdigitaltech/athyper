import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getPlaneConfig, pkceStateKey, type PlaneKey } from "@athyper/session-plane";

import {
  handleCallback,
  handleDiscoveryPost,
  handleLogin,
  handleLogout,
  handleRefresh,
  handleSessionGet,
  handleSessionPatch,
  type OrgMembership,
  type PublicSession,
  type V4Session,
} from "../index";

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

class MemoryRedis {
  readonly values = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();
  readonly ttls = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    modeOrOptions?: { EX?: number; NX?: boolean } | string,
    ttl?: number,
  ): Promise<string | null> {
    const nx = typeof modeOrOptions === "object" ? modeOrOptions.NX : false;
    if (nx && this.values.has(key)) return null;
    this.values.set(key, String(value));
    const ex = typeof modeOrOptions === "object"
      ? modeOrOptions.EX
      : typeof ttl === "number"
        ? ttl
        : undefined;
    if (ex) this.ttls.set(key, ex);
    return "OK";
  }

  async del(key: string): Promise<number> {
    const existed = this.values.delete(key);
    this.sets.delete(key);
    this.ttls.delete(key);
    return existed ? 1 : 0;
  }

  async sAdd(key: string, value: string): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    const size = set.size;
    set.add(value);
    this.sets.set(key, set);
    return set.size > size ? 1 : 0;
  }

  async sRem(key: string, value: string): Promise<number> {
    const set = this.sets.get(key);
    return set?.delete(value) ? 1 : 0;
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    this.ttls.set(key, ttl);
    return true;
  }

  async ttl(key: string): Promise<number> {
    if (!this.values.has(key)) return -2;
    return this.ttls.get(key) ?? 3_600;
  }
}

class BrowserJar {
  private readonly cookiesByHost = new Map<string, Map<string, string>>();

  constructor(private readonly userAgent: string) {}

  request(host: string, path: string, init: NextRequestInit = {}): NextRequest {
    const headers = new Headers(init.headers);
    const cookie = this.cookieHeader(host);
    if (cookie && !headers.has("Cookie")) headers.set("Cookie", cookie);
    headers.set("User-Agent", this.userAgent);
    headers.set("X-Forwarded-For", "127.0.0.1");
    return nextRequest(host, path, { ...init, headers });
  }

  capture(host: string, response: { cookies: { getAll(): Array<{ name: string; value: string }> } }): void {
    const hostCookies = this.hostCookies(host);
    for (const cookie of response.cookies.getAll()) {
      if (cookie.value) {
        hostCookies.set(cookie.name, cookie.value);
      } else {
        hostCookies.delete(cookie.name);
      }
    }
  }

  get(host: string, name: string): string | undefined {
    return this.hostCookies(host).get(name);
  }

  private cookieHeader(host: string): string {
    return [...this.hostCookies(host)]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  private hostCookies(host: string): Map<string, string> {
    const key = host.toLowerCase();
    const existing = this.cookiesByHost.get(key);
    if (existing) return existing;
    const created = new Map<string, string>();
    this.cookiesByHost.set(key, created);
    return created;
  }
}

const testState = vi.hoisted(() => ({
  redis: null as MemoryRedis | null,
}));

vi.mock("@athyper/session-store", () => ({
  createSessionRedisClient: vi.fn(async () => {
    if (!testState.redis) throw new Error("Redis test double was not initialized.");
    return testState.redis;
  }),
}));

const ORIGINAL_ENV = { ...process.env };

describe("tenant admin login, context select, and dashboard handoff", () => {
  beforeEach(() => {
    testState.redis = new MemoryRedis();
    process.env = {
      ...ORIGINAL_ENV,
      ENVIRONMENT: "test",
      KEYCLOAK_BASE_URL: "https://iam.test",
      AUTH_CONTEXT_RESOLVER_URL: "http://runtime.test/api/session/contexts",
      AUTH_AUDIT_ENDPOINT: "",
      APP_MFA_ENFORCED: "false",
    };
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    testState.redis = null;
  });

  it("logs athq.admin into Neon, pre-selects the ATHQ organization, validates IAM context, and activates dashboard context", async () => {
    await expectTenantAdminFlow({
      plane: "neon",
      host: "neon.athyper.local",
      clientId: "neon-web",
      realmRoles: ["NEON_USER", "ADMIN_USER"],
      selected: {
        tenantId: "019dbe34-2c70-7000-9000-000000000001",
        tenantCode: "athyper",
        orgCode: "LE-ATHQ",
        orgName: "Athyper Group Holdings",
        workspaceId: "de001000-0000-0000-0000-000000000001",
        workspaceType: "organization",
      },
      organizations: {
        "athyper--le-athq": {
          id: "de001000-0000-0000-0000-000000000001",
          name: "Athyper Group Holdings",
          alias: "athyper--le-athq",
          roles: ["user"],
          tenantId: "019dbe34-2c70-7000-9000-000000000001",
          tenantCode: "athyper",
          tenantName: "Athyper",
          contextType: "legal_entity",
          workspaceId: "de001000-0000-0000-0000-000000000001",
          workspaceCode: "LE-ATHQ",
          workspaceType: "organization",
          organizationId: "de001000-0000-0000-0000-000000000001",
          organizationCode: "LE-ATHQ",
          organizationName: "Athyper Group Holdings",
          legalEntityId: "de001000-0000-0000-0000-000000000001",
          legalEntityCode: "LE-ATHQ",
          legalEntityName: "Athyper Group Holdings",
        },
      },
      expectedActiveOrg: "athyper--le-athq",
      expectedWorkbench: "user",
    });
  });

  it("logs athq.admin into Admin, pre-selects the tenant admin context, validates IAM context, and activates dashboard context", async () => {
    await expectTenantAdminFlow({
      plane: "admin",
      host: "admin.athyper.local",
      clientId: "admin-web",
      realmRoles: ["ADMIN_USER", "NEON_USER"],
      selected: {
        tenantId: "019dbe34-2c70-7000-9000-000000000001",
        tenantCode: "athyper",
        orgCode: "athyper",
        orgName: "Athyper",
        workspaceId: "019dbe34-2c70-7000-9000-000000000001",
        workspaceType: "organization",
      },
      organizations: {
        "athyper--admin": {
          id: "tag-athyper-admin",
          name: "Athyper",
          alias: "athyper--admin",
          roles: ["admin"],
          tenantId: "019dbe34-2c70-7000-9000-000000000001",
          tenantCode: "athyper",
          tenantName: "Athyper",
          contextType: "tenant_admin",
          organizationId: "019dbe34-2c70-7000-9000-000000000001",
          organizationCode: "athyper",
          organizationName: "Athyper",
        },
      },
      expectedActiveOrg: "athyper--admin",
      expectedWorkbench: "admin",
    });
  });

  it("forces Admin native login through Keycloak even when silent SSO is requested", async () => {
    const loginResponse = await handleLogin(
      "admin",
      nextRequest(ADMIN_HOST, "/api/auth/login?realm=athyper&silent=true&returnUrl=%2Fdashboard"),
    );

    const authRedirect = new URL(requiredHeader(loginResponse, "location"));
    expect(authRedirect.searchParams.get("client_id")).toBe("admin-web");
    expect(authRedirect.searchParams.get("prompt")).toBe("login");
    expect(authRedirect.searchParams.get("max_age")).toBe("3600");

    const state = authRedirect.searchParams.get("state");
    expect(state).toBeTruthy();
    const pkce = JSON.parse((await requireRedis().get(pkceStateKey(state!)))!) as {
      silent?: boolean;
      forceAuthn?: boolean;
    };
    expect(pkce.silent).toBeUndefined();
    expect(pkce.forceAuthn).toBe(true);
  });

  it("keeps Neon silent SSO as prompt=none", async () => {
    const loginResponse = await handleLogin(
      "neon",
      nextRequest(NEON_HOST, "/api/auth/login?realm=athyper&silent=true&returnUrl=%2Fdashboard"),
    );

    const authRedirect = new URL(requiredHeader(loginResponse, "location"));
    expect(authRedirect.searchParams.get("client_id")).toBe("neon-web");
    expect(authRedirect.searchParams.get("prompt")).toBe("none");
    expect(authRedirect.searchParams.get("max_age")).toBeNull();

    const state = authRedirect.searchParams.get("state");
    expect(state).toBeTruthy();
    const pkce = JSON.parse((await requireRedis().get(pkceStateKey(state!)))!) as {
      silent?: boolean;
      forceAuthn?: boolean;
    };
    expect(pkce.silent).toBe(true);
    expect(pkce.forceAuthn).toBeUndefined();
  });

  it("falls back to the Mesh login chooser when silent SSO has no access context", async () => {
    const loginResponse = await handleLogin(
      "mesh",
      nextRequest(MESH_HOST, "/api/auth/login?realm=athyper&silent=true&returnUrl=%2Fdashboard"),
    );
    const state = authStateFromRedirect(loginResponse.headers.get("location"));

    mockFetch({
      clientId: "mesh-web",
      realmRoles: ["MESH_BUYER_USER"],
      organizations: {},
    });

    const callbackResponse = await handleCallback(
      "mesh",
      nextRequest(MESH_HOST, `/api/auth/callback?code=ok&state=${state}`),
    );

    const location = new URL(requiredHeader(callbackResponse, "location"));
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("returnUrl")).toBe("/dashboard");
    expect(location.searchParams.get("error")).toBeNull();
    expect(callbackResponse.cookies.get("sso_skip")?.value).toBe("1");
    expect([...requireRedis().values.keys()].filter((key) => key.startsWith("sess:mesh:"))).toHaveLength(0);
  });

  it("blocks a callback when IAM returns a different user than the requested login hint", async () => {
    const redis = requireRedis();
    mockFetch({
      clientId: "neon-web",
      identity: ATHQ_AGENT_IDENTITY,
      realmRoles: ["NEON_USER"],
      organizations: NEON_ORGANIZATIONS,
    });

    const loginResponse = await handleLogin(
      "neon",
      nextRequest(NEON_HOST, `/api/auth/login?${loginParams(NEON_SELECTED, "user", ATHQ_ADMIN_IDENTITY.username)}`),
    );
    const state = authStateFromRedirect(loginResponse.headers.get("location"));
    const pkce = JSON.parse((await redis.get(pkceStateKey(state)))!) as { loginHint?: string };
    expect(pkce.loginHint).toBe("athq.admin");

    const callbackResponse = await handleCallback(
      "neon",
      nextRequest(NEON_HOST, `/api/auth/callback?code=ok&state=${state}`),
    );

    const location = new URL(requiredHeader(callbackResponse, "location"));
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("ACCOUNT_MISMATCH");
    expect([...redis.values.keys()].filter((key) => key.startsWith("sess:neon:"))).toHaveLength(0);
  });

  it("blocks a pre-selected context when IAM resolves a different tenant or organization", async () => {
    const redis = requireRedis();
    mockFetch({
      clientId: "neon-web",
      realmRoles: ["NEON_USER"],
      organizations: {
        "other--le-other": {
          id: "other-le",
          name: "Other Holdings",
          alias: "other--le-other",
          roles: ["user"],
          tenantId: "tenant-other",
          tenantCode: "other",
          organizationId: "other-le",
          organizationCode: "LE-OTHER",
          organizationName: "Other Holdings",
        },
      },
    });

    const loginResponse = await handleLogin("neon", nextRequest(
      "neon.athyper.local",
      `/api/auth/login?${loginParams({
        tenantId: "tenant-athyper",
        tenantCode: "athyper",
        orgCode: "LE-ATHQ",
        orgName: "Athyper Group Holdings",
        workspaceId: "le-athq",
        workspaceType: "organization",
      }, "user")}`,
    ));
    const state = authStateFromRedirect(loginResponse.headers.get("location"));

    const callbackResponse = await handleCallback(
      "neon",
      nextRequest("neon.athyper.local", `/api/auth/callback?code=ok&state=${state}`),
    );

    const location = new URL(requiredHeader(callbackResponse, "location"));
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("CONTEXT_NOT_ALLOWED");
    expect([...redis.values.keys()].filter((key) => key.startsWith("sess:neon:"))).toHaveLength(0);
  });

  it("prepares remembered organization login with an opaque context token instead of raw auth context params", async () => {
    const response = await handleDiscoveryPost("neon", nextRequest("neon.athyper.local", "/api/auth/discovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "remembered-login",
        realm: "athyper",
        returnUrl: "/dashboard",
        loginHint: "athq.admin",
        selected_tenant_id: NEON_SELECTED.tenantId,
        selected_tenant: NEON_SELECTED.tenantCode,
        selected_org: NEON_SELECTED.orgCode,
        selected_org_name: NEON_SELECTED.orgName,
        selected_workspace_id: NEON_SELECTED.workspaceId,
        selected_workspace_type: NEON_SELECTED.workspaceType,
      }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json() as { loginUrl: string };
    const loginUrl = new URL(body.loginUrl, "http://neon.athyper.local");
    expect(loginUrl.pathname).toBe("/api/auth/login");
    expect(loginUrl.searchParams.get("context_token")).toBeTruthy();
    expect(loginUrl.searchParams.get("returnUrl")).toContain("/auth/select");
    for (const param of [
      "login_hint",
      "selected_tenant_id",
      "selected_tenant",
      "selected_org",
      "selected_org_name",
      "selected_workspace_id",
      "selected_workspace_type",
      "selected_role",
    ]) {
      expect(loginUrl.searchParams.get(param)).toBeNull();
    }

    const loginResponse = await handleLogin("neon", nextRequest("neon.athyper.local", `${loginUrl.pathname}${loginUrl.search}`));
    const authRedirect = new URL(requiredHeader(loginResponse, "location"));
    expect(authRedirect.searchParams.get("login_hint")).toBe("athq.admin");
    const state = authRedirect.searchParams.get("state");
    expect(state).toBeTruthy();
    const pkce = JSON.parse((await requireRedis().get(pkceStateKey(state!)))!) as {
      expectedContext?: { tenantCode: string; organizationName: string; workspaceId: string };
    };
    expect(pkce.expectedContext).toMatchObject({
      tenantCode: NEON_SELECTED.tenantCode,
      organizationName: NEON_SELECTED.orgName,
      workspaceId: NEON_SELECTED.workspaceId,
    });
  });

  it("redacts auth audit console payloads in local runtimes", async () => {
    vi.mocked(console.info).mockClear();
    await handleLogin(
      "neon",
      nextRequest("neon.athyper.local", `/api/auth/login?${loginParams(NEON_SELECTED, "user")}`),
    );

    const serializedAudit = vi.mocked(console.info).mock.calls
      .map((call) => String(call[1] ?? ""))
      .find((value) => value.includes("login_started"));

    expect(serializedAudit).toBeTruthy();
    const auditPayload = JSON.parse(serializedAudit!) as { detail?: Record<string, unknown> };
    expect(serializedAudit).not.toContain(ATHQ_ADMIN_IDENTITY.username);
    expect(serializedAudit).not.toContain(NEON_SELECTED.orgName);
    expect(serializedAudit).not.toContain(NEON_SELECTED.workspaceId);
    expect(auditPayload.detail?.expectedContext).toBeUndefined();
    expect(auditPayload.detail?.expectedContextPresent).toBe(true);
    expect(auditPayload.detail?.contextToken).toBeUndefined();
    expect(auditPayload.detail?.contextTokenPresent).toBe(false);
  });

  it("does not write auth audit payloads to console outside local runtimes", async () => {
    process.env.ENVIRONMENT = "production";
    vi.mocked(console.info).mockClear();

    await handleLogin(
      "neon",
      nextRequest("neon.athyper.local", `/api/auth/login?${loginParams(NEON_SELECTED, "user")}`),
    );

    expect(console.info).not.toHaveBeenCalled();
  });
});

describe("cross-plane browser scenarios", () => {
  beforeEach(() => {
    testState.redis = new MemoryRedis();
    process.env = {
      ...ORIGINAL_ENV,
      ENVIRONMENT: "test",
      KEYCLOAK_BASE_URL: "https://iam.test",
      AUTH_CONTEXT_RESOLVER_URL: "http://runtime.test/api/session/contexts",
      AUTH_AUDIT_ENDPOINT: "",
      APP_MFA_ENFORCED: "false",
    };
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    testState.redis = null;
  });

  it("Scenario A: same browser shares neither Neon nor Admin app sessions across tabs, then both sessions can coexist", async () => {
    const browser = new BrowserJar("Chrome normal profile");

    await loginAndActivateInBrowser(neonLoginFixture(browser));
    await expectSession("neon", browser, NEON_HOST, {
      activeOrg: "athyper--le-athq",
      activeWorkbench: "user",
    });
    await expectNoSession("admin", browser, ADMIN_HOST);

    await loginAndActivateInBrowser(adminLoginFixture(browser));
    await expectSession("admin", browser, ADMIN_HOST, {
      activeOrg: "athyper--admin",
      activeWorkbench: "admin",
    });
    await expectSession("neon", browser, NEON_HOST, {
      activeOrg: "athyper--le-athq",
      activeWorkbench: "user",
    });
  });

  it("preserves Admin MFA verification across refresh", async () => {
    const browser = new BrowserJar("Chrome normal profile");
    await loginAndActivateInBrowser(adminLoginFixture(browser));

    const config = getPlaneConfig("admin");
    const sid = browser.get(ADMIN_HOST, effectiveTestCookieName(config.cookieName));
    const csrf = browser.get(ADMIN_HOST, effectiveTestCookieName(config.csrfCookieName));
    expect(sid).toBeTruthy();
    expect(csrf).toBeTruthy();

    const redis = requireRedis();
    const sessionKey = `sess:${config.key}:${sid}`;
    const originalTtl = await redis.ttl(sessionKey);
    const session = sessionFromRedis("admin", sid!);
    expect(session.mfaRequired).toBe(false);
    expect(session.mfaVerified).toBe(true);

    await redis.set(sessionKey, JSON.stringify({
      ...session,
      accessExpiresAt: Math.floor(Date.now() / 1000) + 10,
    }), { EX: originalTtl });

    const refreshResponse = await handleRefresh("admin", browser.request(ADMIN_HOST, "/api/auth/refresh", {
      method: "POST",
      headers: { "X-CSRF-Token": csrf! },
    }));
    expect(refreshResponse.status).toBe(200);
    browser.capture(ADMIN_HOST, refreshResponse);

    const rotatedSid = browser.get(ADMIN_HOST, effectiveTestCookieName(config.cookieName));
    expect(rotatedSid).toBeTruthy();
    expect(rotatedSid).not.toBe(sid);
    const refreshed = sessionFromRedis("admin", rotatedSid!);
    expect(refreshed.mfaRequired).toBe(false);
    expect(refreshed.mfaVerified).toBe(true);
    expect(await redis.ttl(`sess:${config.key}:${rotatedSid}`)).toBe(originalTtl);
  });

  it("does not auto-verify a pending Admin MFA session across refresh", async () => {
    const browser = new BrowserJar("Chrome normal profile");
    await loginAndActivateInBrowser(adminLoginFixture(browser));

    const config = getPlaneConfig("admin");
    const sid = browser.get(ADMIN_HOST, effectiveTestCookieName(config.cookieName));
    const csrf = browser.get(ADMIN_HOST, effectiveTestCookieName(config.csrfCookieName));
    expect(sid).toBeTruthy();
    expect(csrf).toBeTruthy();

    const redis = requireRedis();
    const sessionKey = `sess:${config.key}:${sid}`;
    const originalTtl = await redis.ttl(sessionKey);
    const session = sessionFromRedis("admin", sid!);

    // Inject MFA-pending state — refresh must not silently upgrade it.
    await redis.set(sessionKey, JSON.stringify({
      ...session,
      mfaRequired: true,
      mfaVerified: false,
      mfaVerifiedAt: undefined,
      accessExpiresAt: Math.floor(Date.now() / 1000) + 10,
    }), { EX: originalTtl });

    const refreshResponse = await handleRefresh("admin", browser.request(ADMIN_HOST, "/api/auth/refresh", {
      method: "POST",
      headers: { "X-CSRF-Token": csrf! },
    }));
    expect(refreshResponse.status).toBe(200);
    browser.capture(ADMIN_HOST, refreshResponse);

    const rotatedSid = browser.get(ADMIN_HOST, effectiveTestCookieName(config.cookieName));
    expect(rotatedSid).toBeTruthy();
    const refreshed = sessionFromRedis("admin", rotatedSid!);
    expect(refreshed.mfaRequired).toBe(true);
    expect(refreshed.mfaVerified).toBe(false);
    expect(refreshed.mfaVerifiedAt).toBeUndefined();
    expect(await redis.ttl(`sess:${config.key}:${rotatedSid}`)).toBe(originalTtl);
  });

  it("revokes the Keycloak refresh token when refresh observes idle expiry", async () => {
    const browser = new BrowserJar("Chrome normal profile");
    await loginAndActivateInBrowser(neonLoginFixture(browser));

    const config = getPlaneConfig("neon");
    const sid = browser.get(NEON_HOST, effectiveTestCookieName(config.cookieName));
    const csrf = browser.get(NEON_HOST, effectiveTestCookieName(config.csrfCookieName));
    expect(sid).toBeTruthy();
    expect(csrf).toBeTruthy();

    const redis = requireRedis();
    const sessionKey = `sess:${config.key}:${sid}`;
    const originalTtl = await redis.ttl(sessionKey);
    const session = sessionFromRedis("neon", sid!);
    const now = Math.floor(Date.now() / 1000);
    await redis.set(sessionKey, JSON.stringify({
      ...session,
      lastSeenAt: now - 3_601,
    }), { EX: originalTtl });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockClear();
    const refreshResponse = await handleRefresh("neon", browser.request(NEON_HOST, "/api/auth/refresh", {
      method: "POST",
      headers: { "X-CSRF-Token": csrf! },
    }));

    expect(refreshResponse.status).toBe(401);
    await expect(refreshResponse.json()).resolves.toMatchObject({ error: "SESSION_IDLE_EXPIRED" });
    expect(redis.values.has(sessionKey)).toBe(false);
    expect(revokeFetchCalls(fetchMock)).toHaveLength(1);
  });

  it("revokes the Keycloak refresh token when validation observes absolute expiry", async () => {
    const browser = new BrowserJar("Chrome normal profile");
    await loginAndActivateInBrowser(neonLoginFixture(browser));

    const config = getPlaneConfig("neon");
    const sid = browser.get(NEON_HOST, effectiveTestCookieName(config.cookieName));
    expect(sid).toBeTruthy();

    const redis = requireRedis();
    const sessionKey = `sess:${config.key}:${sid}`;
    const originalTtl = await redis.ttl(sessionKey);
    const session = sessionFromRedis("neon", sid!);
    const now = Math.floor(Date.now() / 1000);
    await redis.set(sessionKey, JSON.stringify({
      ...session,
      createdAt: now - 28_801,
      lastSeenAt: now,
    }), { EX: originalTtl });

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockClear();
    const sessionResponse = await handleSessionGet("neon", browser.request(NEON_HOST, "/api/auth/session"));

    expect(sessionResponse.status).toBe(401);
    await expect(sessionResponse.json()).resolves.toMatchObject({ error: "SESSION_EXPIRED" });
    expect(redis.values.has(sessionKey)).toBe(false);
    expect(revokeFetchCalls(fetchMock)).toHaveLength(1);
  });

  it("Scenario B: Neon logout clears only Neon app session, then Admin can login in the same browser", async () => {
    const browser = new BrowserJar("Chrome normal profile");

    await loginAndActivateInBrowser(neonLoginFixture(browser));
    await expectSession("neon", browser, NEON_HOST, {
      activeOrg: "athyper--le-athq",
      activeWorkbench: "user",
    });

    mockFetch({
      clientId: "neon-web",
      realmRoles: ["NEON_USER", "ADMIN_USER"],
      organizations: NEON_ORGANIZATIONS,
    });
    const logoutResponse = await handleLogout("neon", browser.request(NEON_HOST, "/logout", {
      headers: { Accept: "application/json" },
    }));
    browser.capture(NEON_HOST, logoutResponse);
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.cookies.get("sso_skip")?.value).toBe("1");
    expect(browser.get(NEON_HOST, "sso_skip")).toBe("1");
    await expectNoSession("neon", browser, NEON_HOST);

    await loginAndActivateInBrowser(adminLoginFixture(browser));
    await expectSession("admin", browser, ADMIN_HOST, {
      activeOrg: "athyper--admin",
      activeWorkbench: "admin",
    });
  });

  it("Scenarios C-E: separate browser/profile, incognito, and Firefox do not inherit the Neon browser session", async () => {
    const chromePrimary = new BrowserJar("Chrome primary profile");
    await loginAndActivateInBrowser(neonLoginFixture(chromePrimary));

    const isolatedBrowsers = [
      { label: "Scenario C", browser: new BrowserJar("Chrome second profile") },
      { label: "Scenario D", browser: new BrowserJar("Chrome incognito profile") },
      { label: "Scenario E", browser: new BrowserJar("Firefox profile") },
    ];

    for (const { browser } of isolatedBrowsers) {
      await expectNoSession("neon", browser, NEON_HOST);
      await expectNoSession("admin", browser, ADMIN_HOST);

      await loginAndActivateInBrowser(adminLoginFixture(browser));
      await expectSession("admin", browser, ADMIN_HOST, {
        activeOrg: "athyper--admin",
        activeWorkbench: "admin",
      });
      await expectNoSession("neon", browser, NEON_HOST);
      await expectNoSession("admin", chromePrimary, ADMIN_HOST);
      await expectSession("neon", chromePrimary, NEON_HOST, {
        activeOrg: "athyper--le-athq",
        activeWorkbench: "user",
      });
    }
  });
});

describe("account matrix across Neon, Admin, and Mesh", () => {
  beforeEach(() => {
    testState.redis = new MemoryRedis();
    process.env = {
      ...ORIGINAL_ENV,
      ENVIRONMENT: "test",
      KEYCLOAK_BASE_URL: "https://iam.test",
      AUTH_CONTEXT_RESOLVER_URL: "http://runtime.test/api/session/contexts",
      AUTH_AUDIT_ENDPOINT: "",
      APP_MFA_ENFORCED: "false",
    };
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    testState.redis = null;
  });

  it("product.admin signs into Neon, Admin, and Mesh with at least two tenants and multiple organizations", async () => {
    for (const flow of PRODUCT_ADMIN_FLOW_CASES) {
      await expectMultiContextAccountFlow(flow);
    }
  });

  it("athq.admin signs into Neon, Admin, and Mesh only for Athyper group contexts", async () => {
    const athqFlows = [
      neonAthqAdminFixture(),
      adminAthqAdminFixture(),
      meshAthqAdminFixture(),
    ];

    for (const flow of athqFlows) {
      await expectTenantAdminFlow({
        ...flow,
        identity: ATHQ_ADMIN_IDENTITY,
        expectedOrganizationAliases: [flow.expectedActiveOrg],
      });
    }
  });
});

describe("admin Keycloak MFA ownership", () => {
  beforeEach(() => {
    testState.redis = new MemoryRedis();
    process.env = {
      ...ORIGINAL_ENV,
      ENVIRONMENT: "test",
      KEYCLOAK_BASE_URL: "https://iam.test",
      AUTH_CONTEXT_RESOLVER_URL: "http://runtime.test/api/session/contexts",
      AUTH_AUDIT_ENDPOINT: "",
      APP_MFA_ENFORCED: "false",
    };
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    testState.redis = null;
  });

  it("trusts the forced admin Keycloak login when the id_token omits the mfa amr claim", async () => {
    vi.mocked(console.info).mockClear();
    vi.mocked(console.warn).mockClear();
    mockFetch({
      clientId: "admin-web",
      identity: ATHQ_ADMIN_IDENTITY,
      realmRoles: ["ADMIN_USER", "NEON_USER"],
      organizations: ADMIN_ORGANIZATIONS,
      idTokenAmr: [],
    });

    const loginResponse = await handleLogin(
      "admin",
      nextRequest(ADMIN_HOST, `/api/auth/login?${loginParams(ADMIN_SELECTED, "admin")}`),
    );
    const state = authStateFromRedirect(loginResponse.headers.get("location"));
    const callbackResponse = await handleCallback(
      "admin",
      nextRequest(ADMIN_HOST, `/api/auth/callback?code=ok&state=${state}`),
    );

    const location = new URL(requiredHeader(callbackResponse, "location"));
    expect(location.pathname).toBe("/auth/select");
    expect(location.searchParams.get("returnUrl")).toBe("/dashboard");
    expect(location.searchParams.get("filter")).toBe("admin");

    const sidCookieName = effectiveTestCookieName(getPlaneConfig("admin").cookieName);
    const sid = callbackResponse.cookies.get(sidCookieName)?.value;
    expect(sid).toBeTruthy();
    const session = sessionFromRedis("admin", sid!);
    expect(session.mfaRequired).toBe(false);
    expect(session.mfaVerified).toBe(true);
    expect(session.mfaVerifiedAt).toBeGreaterThan(0);

    const mfaPendingCookieName = effectiveTestCookieName(getPlaneConfig("admin").mfaPendingCookieName);
    const clearedMfaCookie = callbackResponse.cookies.getAll()
      .find((cookie) => cookie.name === mfaPendingCookieName);
    expect(clearedMfaCookie?.value).toBe("");

    const fallbackAudit = vi.mocked(console.info).mock.calls
      .map((call) => String(call[1] ?? ""))
      .find((value) => value.includes("admin_mfa_keycloak_fallback_required"));
    expect(fallbackAudit).toBeFalsy();

    const alertCall = vi.mocked(console.warn).mock.calls
      .find((call) => String(call[0] ?? "") === "[auth-audit][alert]"
        && String(call[1] ?? "").includes("admin_mfa_keycloak_fallback_required"));
    expect(alertCall).toBeFalsy();
  });

  it("keeps the app fallback for an admin callback state that was not force-authenticated", async () => {
    vi.mocked(console.info).mockClear();
    vi.mocked(console.warn).mockClear();
    mockFetch({
      clientId: "admin-web",
      identity: ATHQ_ADMIN_IDENTITY,
      realmRoles: ["ADMIN_USER", "NEON_USER"],
      organizations: ADMIN_ORGANIZATIONS,
      idTokenAmr: [],
    });

    const loginResponse = await handleLogin(
      "admin",
      nextRequest(ADMIN_HOST, `/api/auth/login?${loginParams(ADMIN_SELECTED, "admin")}`),
    );
    const state = authStateFromRedirect(loginResponse.headers.get("location"));
    const redis = requireRedis();
    const pkce = JSON.parse((await redis.get(pkceStateKey(state)))!) as Record<string, unknown>;
    await redis.set(pkceStateKey(state), JSON.stringify({ ...pkce, forceAuthn: undefined }), { EX: 1_800 });

    const callbackResponse = await handleCallback(
      "admin",
      nextRequest(ADMIN_HOST, `/api/auth/callback?code=ok&state=${state}`),
    );

    const location = new URL(requiredHeader(callbackResponse, "location"));
    expect(location.pathname).toBe("/mfa/challenge");
    expect(location.searchParams.get("returnUrl")).toBeTruthy();

    const sidCookieName = effectiveTestCookieName(getPlaneConfig("admin").cookieName);
    const sid = callbackResponse.cookies.get(sidCookieName)?.value;
    expect(sid).toBeTruthy();
    const session = sessionFromRedis("admin", sid!);
    expect(session.mfaRequired).toBe(true);
    expect(session.mfaVerified).toBe(false);
    expect(session.mfaVerifiedAt).toBeUndefined();
  });
});

async function expectTenantAdminFlow(opts: {
  plane: PlaneKey;
  host: string;
  clientId: string;
  realmRoles: string[];
  identity?: TestIdentity;
  selected: SelectedContext;
  organizations: Record<string, OrgMembership>;
  expectedActiveOrg: string;
  expectedOrganizationAliases?: string[];
  expectedWorkbench: string;
}) {
  mockFetch({
    clientId: opts.clientId,
    identity: opts.identity,
    realmRoles: opts.realmRoles,
    organizations: opts.organizations,
  });

  const loginResponse = await handleLogin(
    opts.plane,
    nextRequest(opts.host, `/api/auth/login?${loginParams(opts.selected, opts.expectedWorkbench, opts.identity?.username)}`),
  );
  const state = authStateFromRedirect(loginResponse.headers.get("location"));
  expect(await requireRedis().get(pkceStateKey(state))).toContain(opts.selected.tenantCode);

  const callbackResponse = await handleCallback(
    opts.plane,
    nextRequest(opts.host, `/api/auth/callback?code=ok&state=${state}`),
  );
  const selectLocation = new URL(requiredHeader(callbackResponse, "location"));
  expect(selectLocation.pathname).toBe("/auth/select");
  expect(selectLocation.searchParams.get("returnUrl")).toBe("/dashboard");
  expect(selectLocation.searchParams.get("filter")).toBe(opts.expectedWorkbench);

  const sidCookieName = effectiveTestCookieName(getPlaneConfig(opts.plane).cookieName);
  const csrfCookieName = effectiveTestCookieName(getPlaneConfig(opts.plane).csrfCookieName);
  const sid = callbackResponse.cookies.get(sidCookieName)?.value;
  const csrf = callbackResponse.cookies.get(csrfCookieName)?.value;
  expect(sid).toBeTruthy();
  expect(csrf).toBeTruthy();

  const sessionBeforeSelect = sessionFromRedis(opts.plane, sid!);
  expect(sessionBeforeSelect.username).toBe(opts.identity?.username ?? ATHQ_ADMIN_IDENTITY.username);
  expect(Object.keys(sessionBeforeSelect.organizations)).toEqual(opts.expectedOrganizationAliases ?? [opts.expectedActiveOrg]);
  expect(sessionBeforeSelect.activeOrg).toBeNull();
  expect(sessionBeforeSelect.activeWorkbench).toBeNull();

  const patchResponse = await handleSessionPatch(opts.plane, nextRequest(opts.host, "/api/auth/session", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${sidCookieName}=${sid}; ${csrfCookieName}=${csrf}`,
      "X-CSRF-Token": csrf!,
    },
    body: JSON.stringify({ org: opts.expectedActiveOrg, workbench: opts.expectedWorkbench }),
  }));
  const patchBody = await patchResponse.json();
  expect({ status: patchResponse.status, body: patchBody }).toMatchObject({
    status: 200,
    body: { ok: true },
  });

  const getResponse = await handleSessionGet(opts.plane, nextRequest(opts.host, "/api/auth/session", {
    headers: {
      Cookie: `${sidCookieName}=${sid}; ${csrfCookieName}=${csrf}`,
    },
  }));
  expect(getResponse.status).toBe(200);
  const publicSession = await getResponse.json() as PublicSession;
  expect(publicSession.activeOrg).toBe(opts.expectedActiveOrg);
  expect(publicSession.activeWorkbench).toBe(opts.expectedWorkbench);
  expect(publicSession.organizations[opts.expectedActiveOrg]?.tenantId).toBe(opts.selected.tenantId);
}

async function expectMultiContextAccountFlow(opts: MultiContextAccountFlow) {
  mockFetch({
    clientId: opts.clientId,
    identity: opts.identity,
    realmRoles: opts.realmRoles,
    organizations: opts.organizations,
  });

  const loginResponse = await handleLogin(
    opts.plane,
    nextRequest(opts.host, `/api/auth/login?${loginParams(null, opts.activateWorkbench, opts.identity.username)}`),
  );
  const state = authStateFromRedirect(loginResponse.headers.get("location"));
  const callbackResponse = await handleCallback(
    opts.plane,
    nextRequest(opts.host, `/api/auth/callback?code=ok&state=${state}`),
  );

  const selectLocation = new URL(requiredHeader(callbackResponse, "location"));
  expect(selectLocation.pathname).toBe("/auth/select");
  expect(selectLocation.searchParams.get("returnUrl")).toBe("/dashboard");
  expect(selectLocation.searchParams.get("filter")).toBe(opts.activateWorkbench);

  const sidCookieName = effectiveTestCookieName(getPlaneConfig(opts.plane).cookieName);
  const csrfCookieName = effectiveTestCookieName(getPlaneConfig(opts.plane).csrfCookieName);
  const sid = callbackResponse.cookies.get(sidCookieName)?.value;
  const csrf = callbackResponse.cookies.get(csrfCookieName)?.value;
  expect(sid).toBeTruthy();
  expect(csrf).toBeTruthy();

  const sessionBeforeSelect = sessionFromRedis(opts.plane, sid!);
  expect(sessionBeforeSelect.username).toBe(opts.identity.username);
  expect(sessionBeforeSelect.email).toBe(opts.identity.email);
  expect(Object.keys(sessionBeforeSelect.organizations)).toEqual(opts.expectedOrganizationAliases);
  expect(new Set(Object.values(sessionBeforeSelect.organizations).map((org) => org.tenantCode))).toEqual(
    new Set(opts.expectedTenantCodes),
  );
  expect(sessionBeforeSelect.activeOrg).toBeNull();
  expect(sessionBeforeSelect.activeWorkbench).toBeNull();

  const patchResponse = await handleSessionPatch(opts.plane, nextRequest(opts.host, "/api/auth/session", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${sidCookieName}=${sid}; ${csrfCookieName}=${csrf}`,
      "X-CSRF-Token": csrf!,
    },
    body: JSON.stringify({ org: opts.activateOrg, workbench: opts.activateWorkbench }),
  }));
  expect({ status: patchResponse.status, body: await patchResponse.json() }).toMatchObject({
    status: 200,
    body: { ok: true },
  });

  const getResponse = await handleSessionGet(opts.plane, nextRequest(opts.host, "/api/auth/session", {
    headers: {
      Cookie: `${sidCookieName}=${sid}; ${csrfCookieName}=${csrf}`,
    },
  }));
  expect(getResponse.status).toBe(200);
  const publicSession = await getResponse.json() as PublicSession;
  expect(publicSession.activeOrg).toBe(opts.activateOrg);
  expect(publicSession.activeWorkbench).toBe(opts.activateWorkbench);
}

const NEON_HOST = "neon.athyper.local";
const MESH_HOST = "mesh.athyper.local";
const ADMIN_HOST = "admin.athyper.local";

const ATHYPER_TENANT_ID = "019dbe34-2c70-7000-9000-000000000001";
const SOCPA_TENANT_ID = "019dbe34-2c70-7000-9000-000000000002";
const ATHQ_WORKSPACE_ID = "de001000-0000-0000-0000-000000000001";
const ATHQ_APAC_WORKSPACE_ID = "de001100-0000-0000-0000-000000000001";
const SOCPA_WORKSPACE_ID = "de002000-0000-0000-0000-000000000001";
const ATHQ_NETWORK_ACCOUNT_ID = "na001000-0000-0000-0000-000000000001";
const SOCPA_NETWORK_ACCOUNT_ID = "na002000-0000-0000-0000-000000000001";

const ATHQ_ADMIN_IDENTITY: TestIdentity = {
  sub: "kc-athq-admin",
  username: "athq.admin",
  email: "athq.admin@athyper.demo",
  displayName: "ATHQ Admin",
};

const ATHQ_AGENT_IDENTITY: TestIdentity = {
  sub: "kc-athq-agent",
  username: "athq.agent",
  email: "athq.agent@athyper.demo",
  displayName: "ATHQ Agent",
};

const PRODUCT_ADMIN_IDENTITY: TestIdentity = {
  sub: "kc-product-admin",
  username: "product.admin",
  email: "admin@athyper.com",
  displayName: "Product Admin",
};

const NEON_SELECTED: SelectedContext = {
  tenantId: ATHYPER_TENANT_ID,
  tenantCode: "athyper",
  orgCode: "LE-ATHQ",
  orgName: "Athyper Group Holdings",
  workspaceId: ATHQ_WORKSPACE_ID,
  workspaceType: "organization",
};

const ADMIN_SELECTED: SelectedContext = {
  tenantId: ATHYPER_TENANT_ID,
  tenantCode: "athyper",
  orgCode: "athyper",
  orgName: "Athyper",
  workspaceId: ATHYPER_TENANT_ID,
  workspaceType: "organization",
};

const MESH_SELECTED: SelectedContext = {
  tenantId: ATHYPER_TENANT_ID,
  tenantCode: "athyper",
  orgCode: "ATHQ-BUYER",
  orgName: "Athyper Buyer Network",
  workspaceId: ATHQ_NETWORK_ACCOUNT_ID,
  workspaceType: "network_account",
  networkRole: "buyer",
};

const NEON_ORGANIZATIONS: Record<string, OrgMembership> = {
  "athyper--le-athq": {
    id: ATHQ_WORKSPACE_ID,
    name: "Athyper Group Holdings",
    alias: "athyper--le-athq",
    roles: ["user"],
    tenantId: ATHYPER_TENANT_ID,
    tenantCode: "athyper",
    tenantName: "Athyper",
    contextType: "legal_entity",
    workspaceId: ATHQ_WORKSPACE_ID,
    workspaceCode: "LE-ATHQ",
    workspaceType: "organization",
    organizationId: ATHQ_WORKSPACE_ID,
    organizationCode: "LE-ATHQ",
    organizationName: "Athyper Group Holdings",
    legalEntityId: ATHQ_WORKSPACE_ID,
    legalEntityCode: "LE-ATHQ",
    legalEntityName: "Athyper Group Holdings",
  },
};

const MESH_ORGANIZATIONS: Record<string, OrgMembership> = {
  "athyper--athq-buyer": {
    id: ATHQ_NETWORK_ACCOUNT_ID,
    name: "Athyper Buyer Network",
    alias: "athyper--athq-buyer",
    roles: ["user"],
    tenantId: ATHYPER_TENANT_ID,
    tenantCode: "athyper",
    tenantName: "Athyper",
    contextType: "network_account",
    workspaceId: ATHQ_NETWORK_ACCOUNT_ID,
    workspaceCode: "ATHQ-BUYER",
    workspaceType: "network_account",
    organizationId: ATHQ_NETWORK_ACCOUNT_ID,
    organizationCode: "ATHQ-BUYER",
    organizationName: "Athyper Buyer Network",
  },
};

const ADMIN_ORGANIZATIONS: Record<string, OrgMembership> = {
  "athyper--admin": {
    id: "tag-athyper-admin",
    name: "Athyper",
    alias: "athyper--admin",
    roles: ["admin"],
    tenantId: ATHYPER_TENANT_ID,
    tenantCode: "athyper",
    tenantName: "Athyper",
    contextType: "tenant_admin",
    organizationId: ATHYPER_TENANT_ID,
    organizationCode: "athyper",
    organizationName: "Athyper",
  },
};

const PRODUCT_ADMIN_NEON_ORGANIZATIONS: Record<string, OrgMembership> = {
  ...NEON_ORGANIZATIONS,
  "athyper--le-apac": {
    id: ATHQ_APAC_WORKSPACE_ID,
    name: "Athyper APAC Operations",
    alias: "athyper--le-apac",
    roles: ["user"],
    tenantId: ATHYPER_TENANT_ID,
    tenantCode: "athyper",
    tenantName: "Athyper",
    contextType: "legal_entity",
    workspaceId: ATHQ_APAC_WORKSPACE_ID,
    workspaceCode: "LE-APAC",
    workspaceType: "organization",
    organizationId: ATHQ_APAC_WORKSPACE_ID,
    organizationCode: "LE-APAC",
    organizationName: "Athyper APAC Operations",
    legalEntityId: ATHQ_APAC_WORKSPACE_ID,
    legalEntityCode: "LE-APAC",
    legalEntityName: "Athyper APAC Operations",
  },
  "socpa--le-core": {
    id: SOCPA_WORKSPACE_ID,
    name: "SOCPA Core Holdings",
    alias: "socpa--le-core",
    roles: ["user"],
    tenantId: SOCPA_TENANT_ID,
    tenantCode: "socpa",
    tenantName: "SOCPA",
    contextType: "legal_entity",
    workspaceId: SOCPA_WORKSPACE_ID,
    workspaceCode: "LE-CORE",
    workspaceType: "organization",
    organizationId: SOCPA_WORKSPACE_ID,
    organizationCode: "LE-CORE",
    organizationName: "SOCPA Core Holdings",
    legalEntityId: SOCPA_WORKSPACE_ID,
    legalEntityCode: "LE-CORE",
    legalEntityName: "SOCPA Core Holdings",
  },
};

const PRODUCT_ADMIN_ADMIN_ORGANIZATIONS: Record<string, OrgMembership> = {
  ...ADMIN_ORGANIZATIONS,
  "socpa--admin": {
    id: "tag-socpa-admin",
    name: "SOCPA",
    alias: "socpa--admin",
    roles: ["admin"],
    tenantId: SOCPA_TENANT_ID,
    tenantCode: "socpa",
    tenantName: "SOCPA",
    contextType: "tenant_admin",
    organizationId: SOCPA_TENANT_ID,
    organizationCode: "socpa",
    organizationName: "SOCPA",
  },
};

const PRODUCT_ADMIN_MESH_ORGANIZATIONS: Record<string, OrgMembership> = {
  ...MESH_ORGANIZATIONS,
  "socpa--supplier-gateway": {
    id: SOCPA_NETWORK_ACCOUNT_ID,
    name: "SOCPA Supplier Gateway",
    alias: "socpa--supplier-gateway",
    roles: ["partner"],
    tenantId: SOCPA_TENANT_ID,
    tenantCode: "socpa",
    tenantName: "SOCPA",
    contextType: "network_account",
    workspaceId: SOCPA_NETWORK_ACCOUNT_ID,
    workspaceCode: "SUPPLIER-GATEWAY",
    workspaceType: "network_account",
    organizationId: SOCPA_NETWORK_ACCOUNT_ID,
    organizationCode: "SUPPLIER-GATEWAY",
    organizationName: "SOCPA Supplier Gateway",
  },
};

const PRODUCT_ADMIN_REALM_ROLES = ["NEON_USER", "ADMIN_USER", "MESH_BUYER_USER", "MESH_PARTNER_USER"];

const PRODUCT_ADMIN_FLOW_CASES = [
  {
    plane: "neon",
    host: NEON_HOST,
    clientId: "neon-web",
    identity: PRODUCT_ADMIN_IDENTITY,
    realmRoles: PRODUCT_ADMIN_REALM_ROLES,
    organizations: PRODUCT_ADMIN_NEON_ORGANIZATIONS,
    expectedOrganizationAliases: ["athyper--le-athq", "athyper--le-apac", "socpa--le-core"],
    expectedTenantCodes: ["athyper", "socpa"],
    activateOrg: "socpa--le-core",
    activateWorkbench: "user",
  },
  {
    plane: "admin",
    host: ADMIN_HOST,
    clientId: "admin-web",
    identity: PRODUCT_ADMIN_IDENTITY,
    realmRoles: PRODUCT_ADMIN_REALM_ROLES,
    organizations: PRODUCT_ADMIN_ADMIN_ORGANIZATIONS,
    expectedOrganizationAliases: ["athyper--admin", "socpa--admin"],
    expectedTenantCodes: ["athyper", "socpa"],
    activateOrg: "socpa--admin",
    activateWorkbench: "admin",
  },
  {
    plane: "mesh",
    host: MESH_HOST,
    clientId: "mesh-web",
    identity: PRODUCT_ADMIN_IDENTITY,
    realmRoles: PRODUCT_ADMIN_REALM_ROLES,
    organizations: PRODUCT_ADMIN_MESH_ORGANIZATIONS,
    expectedOrganizationAliases: ["athyper--athq-buyer", "socpa--supplier-gateway"],
    expectedTenantCodes: ["athyper", "socpa"],
    activateOrg: "socpa--supplier-gateway",
    activateWorkbench: "partner",
  },
] as const satisfies readonly MultiContextAccountFlow[];

function neonAthqAdminFixture() {
  return {
    plane: "neon" as const,
    host: NEON_HOST,
    clientId: "neon-web",
    realmRoles: ["NEON_USER", "ADMIN_USER"],
    selected: NEON_SELECTED,
    organizations: NEON_ORGANIZATIONS,
    expectedActiveOrg: "athyper--le-athq",
    expectedWorkbench: "user",
  };
}

function adminAthqAdminFixture() {
  return {
    plane: "admin" as const,
    host: ADMIN_HOST,
    clientId: "admin-web",
    realmRoles: ["ADMIN_USER", "NEON_USER"],
    selected: ADMIN_SELECTED,
    organizations: ADMIN_ORGANIZATIONS,
    expectedActiveOrg: "athyper--admin",
    expectedWorkbench: "admin",
  };
}

function meshAthqAdminFixture() {
  return {
    plane: "mesh" as const,
    host: MESH_HOST,
    clientId: "mesh-web",
    realmRoles: ["MESH_BUYER_USER", "NEON_USER"],
    selected: MESH_SELECTED,
    organizations: MESH_ORGANIZATIONS,
    expectedActiveOrg: "athyper--athq-buyer",
    expectedWorkbench: "user",
  };
}

function neonLoginFixture(browser: BrowserJar) {
  return {
    ...neonAthqAdminFixture(),
    browser,
  };
}

function adminLoginFixture(browser: BrowserJar) {
  return {
    ...adminAthqAdminFixture(),
    browser,
  };
}

async function loginAndActivateInBrowser(opts: ReturnType<typeof neonLoginFixture> | ReturnType<typeof adminLoginFixture>) {
  mockFetch({
    clientId: opts.clientId,
    identity: ATHQ_ADMIN_IDENTITY,
    realmRoles: opts.realmRoles,
    organizations: opts.organizations,
  });

  const loginResponse = await handleLogin(
    opts.plane,
    opts.browser.request(opts.host, `/api/auth/login?${loginParams(opts.selected, opts.expectedWorkbench)}`),
  );
  const state = authStateFromRedirect(loginResponse.headers.get("location"));
  const callbackResponse = await handleCallback(
    opts.plane,
    opts.browser.request(opts.host, `/api/auth/callback?code=ok&state=${state}`),
  );
  opts.browser.capture(opts.host, callbackResponse);

  const selectLocation = new URL(requiredHeader(callbackResponse, "location"));
  expect(selectLocation.pathname).toBe("/auth/select");
  expect(selectLocation.searchParams.get("returnUrl")).toBe("/dashboard");
  expect(selectLocation.searchParams.get("filter")).toBe(opts.expectedWorkbench);

  const config = getPlaneConfig(opts.plane);
  const csrf = opts.browser.get(opts.host, effectiveTestCookieName(config.csrfCookieName));
  expect(csrf).toBeTruthy();

  const patchResponse = await handleSessionPatch(opts.plane, opts.browser.request(opts.host, "/api/auth/session", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf!,
    },
    body: JSON.stringify({ org: opts.expectedActiveOrg, workbench: opts.expectedWorkbench }),
  }));
  opts.browser.capture(opts.host, patchResponse);
  expect(await patchResponse.json()).toMatchObject({ ok: true });
}

async function expectSession(
  plane: PlaneKey,
  browser: BrowserJar,
  host: string,
  expected: { activeOrg: string; activeWorkbench: string },
): Promise<void> {
  const response = await handleSessionGet(plane, browser.request(host, "/api/auth/session"));
  expect(response.status).toBe(200);
  const session = await response.json() as PublicSession;
  expect(session.activeOrg).toBe(expected.activeOrg);
  expect(session.activeWorkbench).toBe(expected.activeWorkbench);
}

async function expectNoSession(plane: PlaneKey, browser: BrowserJar, host: string): Promise<void> {
  const response = await handleSessionGet(plane, browser.request(host, "/api/auth/session"));
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    authenticated: false,
    error: "SESSION_NOT_FOUND",
  });
}

interface SelectedContext {
  tenantId: string;
  tenantCode: string;
  orgCode: string;
  orgName: string;
  workspaceId: string;
  workspaceType: string;
  networkRole?: string;
}

interface TestIdentity {
  sub: string;
  username: string;
  email: string;
  displayName: string;
}

interface MultiContextAccountFlow {
  plane: PlaneKey;
  host: string;
  clientId: string;
  identity: TestIdentity;
  realmRoles: readonly string[];
  organizations: Record<string, OrgMembership>;
  expectedOrganizationAliases: readonly string[];
  expectedTenantCodes: readonly string[];
  activateOrg: string;
  activateWorkbench: string;
}

function loginParams(selected: SelectedContext | null, workbench: string, loginHint = ATHQ_ADMIN_IDENTITY.username): string {
  const params = new URLSearchParams();
  params.set("realm", "athyper");
  params.set("returnUrl", `/auth/select?returnUrl=${encodeURIComponent("/dashboard")}&filter=${workbench}`);
  params.set("login_hint", loginHint);
  params.set("force", "1");
  if (!selected) return params.toString();
  params.set("selected_tenant_id", selected.tenantId);
  params.set("selected_tenant", selected.tenantCode);
  params.set("selected_org", selected.orgCode);
  params.set("selected_org_name", selected.orgName);
  params.set("selected_workspace_id", selected.workspaceId);
  params.set("selected_workspace_type", selected.workspaceType);
  if (selected.networkRole) params.set("selected_role", selected.networkRole);
  return params.toString();
}

function nextRequest(host: string, path: string, init: NextRequestInit = {}): NextRequest {
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", "vitest-browser");
  if (!headers.has("X-Forwarded-For")) headers.set("X-Forwarded-For", "127.0.0.1");
  const { signal, ...rest } = init;
  const requestInit: NextRequestInit = { ...rest, headers };
  if (signal) requestInit.signal = signal;
  return new NextRequest(`http://${host}${path}`, requestInit);
}

function authStateFromRedirect(location: string | null): string {
  const redirect = new URL(location ?? "");
  expect(redirect.hostname).toBe("iam.test");
  const state = redirect.searchParams.get("state");
  expect(state).toBeTruthy();
  return state!;
}

function requiredHeader(response: { headers: Headers }, name: string): string {
  const value = response.headers.get(name);
  expect(value).toBeTruthy();
  return value!;
}

function fetchUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function revokeFetchCalls(fetchMock: { mock: { calls: Array<[string | URL | Request, RequestInit?]> } }) {
  return fetchMock.mock.calls.filter(([input]) => (
    fetchUrl(input) === "https://iam.test/realms/athyper/protocol/openid-connect/revoke"
  ));
}

function sessionFromRedis(plane: PlaneKey, sid: string): V4Session {
  const session = requireRedis().values.get(`sess:${getPlaneConfig(plane).key}:${sid}`);
  expect(session).toBeTruthy();
  return JSON.parse(session!) as V4Session;
}

function requireRedis(): MemoryRedis {
  if (!testState.redis) throw new Error("Redis test double was not initialized.");
  return testState.redis;
}

function mockFetch(opts: {
  clientId: string;
  identity?: TestIdentity;
  realmRoles: readonly string[];
  organizations: Record<string, OrgMembership>;
  idTokenAmr?: readonly string[];
}) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url === "http://runtime.test/api/session/contexts") {
      return Response.json({
        organizations: opts.organizations,
        contextCount: Object.keys(opts.organizations).length,
        source: "db",
      });
    }

    if (url === "https://iam.test/realms/athyper/protocol/openid-connect/token") {
      const identity = opts.identity ?? ATHQ_ADMIN_IDENTITY;
      const claims = {
        iss: "https://iam.test/realms/athyper",
        sub: identity.sub,
        preferred_username: identity.username,
        email: identity.email,
        name: identity.displayName,
        resource_access: {
          [opts.clientId]: { roles: ["AUTHORIZED"] },
        },
        realm_access: {
          roles: opts.realmRoles,
        },
      };
      const amrClaim = opts.idTokenAmr ?? ["otp"];
      return Response.json({
        access_token: jwt(claims),
        refresh_token: "refresh-token",
        id_token: jwt({ ...claims, amr: amrClaim }),
        token_type: "Bearer",
        expires_in: 3_600,
        refresh_expires_in: 7_200,
        scope: "openid",
        session_state: `kc-session-${identity.username.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      });
    }

    if (url === "https://iam.test/realms/athyper/protocol/openid-connect/revoke") {
      return new Response(null, { status: 200 });
    }

    return new Response(JSON.stringify({ error: "unexpected_fetch", url }), { status: 500 });
  }));
}

function jwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

function effectiveTestCookieName(base: string): string {
  return process.env.ENVIRONMENT === "local" ? base : `__Host-${base}`;
}
