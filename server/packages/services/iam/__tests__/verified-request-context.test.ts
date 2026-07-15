import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  composeVerifiedRequestContext,
  ensureEffectivePermissionContext,
  readVerifiedRequestContext,
  requireVerifiedContext,
  requireVerifiedRequestContext,
  storeVerifiedRequestContext,
  VerifiedRequestContextRequiredError,
} from "../permission-context/index.js";
import type {
  EffectivePermissionContext,
  PermissionResolverRegistry,
} from "../permission-context/index.js";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const PRINCIPAL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRINCIPAL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function permissionContext(
  overrides: Partial<Pick<EffectivePermissionContext, "planeKey" | "tenantId" | "principalId">> = {},
): EffectivePermissionContext {
  return {
    planeKey: "neon",
    tenantId: TENANT_A,
    principalId: PRINCIPAL_A,
    principalFingerprint: "principal-fingerprint",
    allowed: new Set(["records.read", "records.update"]),
    denied: new Set(),
    planLocked: new Set(),
    planeExcluded: new Set(),
    entries: new Map(),
    profileHash: "profile-hash",
    schemaHash: "schema-hash",
    resolvedAt: Date.now(),
    ...overrides,
  };
}

function response(): Response {
  return { locals: {} } as Response;
}

describe("canonical VerifiedRequestContext", () => {
  it("composes identity, permissions, request and mutation identifiers", () => {
    const permissions = permissionContext();
    const result = composeVerifiedRequestContext({
      identity: { realmKey: "athyper", tenantId: TENANT_A, principalId: PRINCIPAL_A, authEpoch: 7 },
      permissions,
      planeKey: "neon",
      requestId: "req-123",
      correlationId: "corr-123",
      idempotencyKey: "idem-123",
    });

    expect(result).toEqual({
      ok: true,
      context: {
        planeKey: "neon",
        realmKey: "athyper",
        tenantId: TENANT_A,
        principalId: PRINCIPAL_A,
        permissions,
        authEpoch: 7,
        profileHash: "profile-hash",
        requestId: "req-123",
        correlationId: "corr-123",
        idempotencyKey: "idem-123",
      },
    });
    if (result.ok) expect(Object.isFrozen(result.context)).toBe(true);
  });

  it("fails closed across tenant and principal boundaries", () => {
    for (const identity of [
      { realmKey: "athyper", tenantId: TENANT_B, principalId: PRINCIPAL_A, authEpoch: 7 },
      { realmKey: "athyper", tenantId: TENANT_A, principalId: PRINCIPAL_B, authEpoch: 7 },
    ]) {
      expect(composeVerifiedRequestContext({
        identity,
        permissions: permissionContext(),
        planeKey: "neon",
      })).toMatchObject({ ok: false, status: 403, error: "AUTH_CONTEXT_MISMATCH" });
    }
  });

  it("fails closed across product-plane boundaries", () => {
    expect(composeVerifiedRequestContext({
      identity: { realmKey: "athyper", tenantId: TENANT_A, principalId: PRINCIPAL_A, authEpoch: 7 },
      permissions: permissionContext({ planeKey: "mesh" }),
      planeKey: "neon",
    })).toMatchObject({ ok: false, status: 403, error: "AUTH_CONTEXT_MISMATCH" });
  });

  it("stores one context and requires it without an anonymous fallback", () => {
    const res = response();
    expect(() => requireVerifiedRequestContext(res)).toThrow(VerifiedRequestContextRequiredError);

    const result = composeVerifiedRequestContext({
      identity: { realmKey: "athyper", tenantId: TENANT_A, principalId: PRINCIPAL_A, authEpoch: 7 },
      permissions: permissionContext(),
      planeKey: "neon",
      requestId: "req-456",
    });
    if (!result.ok) throw new Error(result.message);
    storeVerifiedRequestContext(res, result.context);

    expect(readVerifiedRequestContext(res)).toBe(result.context);
    expect(requireVerifiedRequestContext(res)).toBe(result.context);
    expect(requireVerifiedContext({} as never, res)).toBe(result.context);
  });
});

describe("effective permission context reuse", () => {
  it("builds and stores one snapshot when upstream middleware has not resolved it", async () => {
    const res = response();
    const built = permissionContext();
    const build = vi.fn(async () => built);
    const registry = {
      get: vi.fn(() => ({ planeKey: "neon", build })),
    } as unknown as PermissionResolverRegistry;
    const input = { planeKey: "neon" as const, tenantId: TENANT_A, principalId: PRINCIPAL_A };

    await expect(ensureEffectivePermissionContext(res, registry, input)).resolves.toBe(built);
    await expect(ensureEffectivePermissionContext(res, registry, input)).resolves.toBe(built);
    expect(build).toHaveBeenCalledTimes(1);
    expect(res.locals.effectivePermissionContext).toBe(built);
  });

  it("reuses a matching snapshot without invoking another resolver", async () => {
    const res = response();
    const existing = permissionContext();
    res.locals.effectivePermissionContext = existing;
    const build = vi.fn();
    const registry = { get: vi.fn(() => ({ build })) } as unknown as PermissionResolverRegistry;

    await expect(ensureEffectivePermissionContext(res, registry, {
      planeKey: "neon",
      tenantId: TENANT_A,
      principalId: PRINCIPAL_A,
    })).resolves.toBe(existing);
    expect(build).not.toHaveBeenCalled();
  });

  it("rejects an existing cross-tenant or cross-plane snapshot", async () => {
    for (const existing of [
      permissionContext({ tenantId: TENANT_B }),
      permissionContext({ planeKey: "admin" }),
    ]) {
      const res = response();
      res.locals.effectivePermissionContext = existing;
      const registry = { get: vi.fn() } as unknown as PermissionResolverRegistry;
      await expect(ensureEffectivePermissionContext(res, registry, {
        planeKey: "neon",
        tenantId: TENANT_A,
        principalId: PRINCIPAL_A,
      })).rejects.toMatchObject({ code: "AUTH_CONTEXT_MISMATCH", status: 403 });
    }
  });
});
