import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ApiTransportError, experienceQueryKeys, parseExperienceBootstrap, type ExperienceBootstrap } from "@athyper/platform-api-client";
import { applyVersionedOptimisticUpdate, createServerQueryClient, dehydratePrincipalQueries, PrincipalQueryLifecycle, shouldRetrySafeRead } from "@athyper/platform-query/server";
import { readProtectedBootstrap } from "@athyper/platform-shell-app-foundation/server";
import { sessionExpiryWarningDelay, sessionExpiryWarningTarget, shouldSendSessionTouch } from "@athyper/platform-shell-app-foundation";
import type { PrincipalQueryScope, SanitizedSession } from "@athyper/contract-platform-auth-session";

const scopeA: PrincipalQueryScope = { plane: "neon", tenantId: "tenant-a", principalId: "principal-a", authEpoch: 1 };
const scopeB: PrincipalQueryScope = { plane: "mesh", tenantId: "tenant-b", principalId: "principal-b", authEpoch: 2 };
const session: SanitizedSession = { schemaVersion: 1, state: "authenticated", plane: "neon", realmKey: "athyper", tenantId: scopeA.tenantId, principalId: scopeA.principalId, authEpoch: 1, sessionVersion: 1, configurationRevision: "1", expiresAt: "2099-08-12T12:00:00.000Z", idleExpiresAt: "2099-08-12T12:00:00.000Z", absoluteExpiresAt: "2099-08-12T18:00:00.000Z", assurance: "baseline", requiredActions: [], allowedNextActions: ["continue", "logout"] };
const bootstrap: ExperienceBootstrap = parseExperienceBootstrap({ schemaVersion: 1, state: "ready", planeKey: "neon", tenantId: scopeA.tenantId, principalId: scopeA.principalId, revision: "experience-1", identity:{displayName:"User One",secondaryLabel:"user.one",initials:"UO"},tenant:{id:scopeA.tenantId,code:"tenant-alpha",displayName:"Tenant Alpha"}, profile: { localeCode: "en-MY", languageCode: "en", timezoneCode: "Asia/Kuala_Lumpur", dateFormat: "yyyy-MM-dd", numberFormat: "latn", weekStart: 1, weekendDays: [0, 6], appearanceMode: "dark", densityCode: "compact" }, workspaces: [{ code: "finance", name: "Finance", sortOrder: 1, modules: [{ code: "invoice", name: "Invoice", sortOrder: 1, primary: true }] }], permissions: ["finance.invoice.read"], features: { "finance.invoice_v2": { code: "finance.invoice_v2", enabled: true, source: "tenant_override" } }, nextActions: [] });

test("principal lifecycle cancels in-flight work before removing the previous context", async () => {
  const client = createServerQueryClient(), lifecycle = new PrincipalQueryLifecycle(client); await lifecycle.replace(scopeA);
  let aborted = false;
  const pending = client.fetchQuery({ queryKey: ["principal", "neon", "tenant-a", 1, "slow"], queryFn: ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true })) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await lifecycle.replace(scopeB);
  await assert.rejects(pending);
  assert.equal(aborted, true);
  assert.equal(client.getQueryCache().find({ queryKey: ["principal", "neon", "tenant-a", 1] }), undefined);
  client.clear();
});

test("dehydration admits only explicitly safe data under the active principal root", () => {
  const client = createServerQueryClient(), safeKey = experienceQueryKeys.bootstrap(scopeA), unsafeKey = [...safeKey, "secret"];
  client.setQueryDefaults(safeKey, { meta: { safeToDehydrate: true, principalScoped: true } }); client.setQueryData(safeKey, bootstrap);
  client.setQueryDefaults(unsafeKey, { meta: { safeToDehydrate: false, principalScoped: true } }); client.setQueryData(unsafeKey, { token: "must-not-cross" });
  const dehydrated = dehydratePrincipalQueries(client, scopeA);
  assert.equal(dehydrated.queries.length, 1); assert.deepEqual(dehydrated.queries[0]?.queryKey, safeKey); assert.doesNotMatch(JSON.stringify(dehydrated), /must-not-cross/);
  client.clear();
});

test("retry policy is bounded and excludes authentication, authorization, validation, conflict, and mutation defaults", () => {
  assert.equal(shouldRetrySafeRead(0, new ApiTransportError("network", "offline")), true);
  assert.equal(shouldRetrySafeRead(2, new ApiTransportError("timeout", "late")), false);
  for (const kind of ["authentication", "authorization", "validation", "conflict"] as const) assert.equal(shouldRetrySafeRead(0, new ApiTransportError(kind, kind)), false);
  const client = createServerQueryClient(); assert.equal(client.getDefaultOptions().mutations?.retry, false); client.clear();
});

test("versioned optimistic updates require an ETag and provide tested rollback", async () => {
  const client = createServerQueryClient(), key = [...experienceQueryKeys.bootstrap(scopeA), "record", "1"] as const; client.setQueryData(key, { value: 1 });
  await assert.rejects(() => applyVersionedOptimisticUpdate({ client, key, etag: "", update: () => ({ value: 2 }) }));
  const transaction = await applyVersionedOptimisticUpdate<{ value: number }>({ client, key, etag: '"7"', update: () => ({ value: 2 }) });
  assert.deepEqual(client.getQueryData(key), { value: 2 }); transaction.rollback(); assert.deepEqual(client.getQueryData(key), { value: 1 });
  client.clear();
});

test("server bootstrap redirects before experience access and hydrates one safe coherent state", async () => {
  let experienceReads = 0;
  const anonymous = await readProtectedBootstrap({ request: new Request("https://neon.local/"), readSession: async () => Response.json({ schemaVersion: 1, state: "anonymous", plane: "neon", requiredActions: [] }), readExperience: async () => { experienceReads += 1; return Response.json(bootstrap); } });
  assert.deepEqual(anonymous, { state: "redirect", location: "/api/auth/login?returnTo=%2F", reason: "unauthenticated" }); assert.equal(experienceReads, 0);
  const ready = await readProtectedBootstrap({ request: new Request("https://neon.local/"), readSession: async () => Response.json(session), readExperience: async () => { experienceReads += 1; return Response.json(bootstrap); } });
  assert.equal(ready.state, "ready"); if (ready.state === "ready") { assert.equal(ready.dehydratedState.queries.length, 1); assert.deepEqual(ready.dehydratedState.queries[0]?.queryKey, experienceQueryKeys.bootstrap(scopeA)); ready.queryClient.clear(); }
});

test("provider source preserves the required focused nesting order", async () => {
  const source = await readFile(new URL("../../packages/platform/shell/app-foundation/src/index.tsx", import.meta.url), "utf8");
  const names = ["AppearanceProvider", "SessionProvider", "ExperienceBootstrapProvider", "ApiClientProvider", "PlatformQueryProvider", "PermissionProvider", "FeatureProvider", "ToastProvider", "SurfaceStackProvider", "AuthenticationFailureBridge"];
  let cursor = source.indexOf("export function AppFoundationProviders"); for (const name of names) { const next = source.indexOf(`<${name}`, cursor); assert.ok(next > cursor, `${name} must appear in provider order`); cursor = next; }
  assert.match(source, /fetch\("\/api\/auth\/touch"/);
  assert.match(source, /"x-csrf-token": csrfToken/);
});

test("session expiry warning selects the earliest idle or absolute deadline", () => {
  const now = Date.parse("2026-08-13T10:00:00.000Z");
  assert.equal(sessionExpiryWarningDelay("2026-08-13T10:30:00.000Z", now), 25 * 60_000);
  assert.equal(sessionExpiryWarningDelay("2026-08-13T10:03:00.000Z", now), 0);
  assert.equal(sessionExpiryWarningDelay("2026-08-13T09:59:59.000Z", now), undefined);
  assert.equal(sessionExpiryWarningDelay(undefined, now), undefined);
  assert.deepEqual(sessionExpiryWarningTarget({ idleExpiresAt: "2026-08-13T10:15:00.000Z", absoluteExpiresAt: "2026-08-13T14:00:00.000Z" }, now), { kind: "idle", expiresAt: "2026-08-13T10:15:00.000Z", delayMs: 10 * 60_000 });
  assert.deepEqual(sessionExpiryWarningTarget({ idleExpiresAt: "2026-08-13T14:00:00.000Z", absoluteExpiresAt: "2026-08-13T10:30:00.000Z" }, now), { kind: "absolute", expiresAt: "2026-08-13T10:30:00.000Z", delayMs: 25 * 60_000 });
  assert.equal(shouldSendSessionTouch(now, now + 59_999), false);
  assert.equal(shouldSendSessionTouch(now, now + 60_000), true);
});
