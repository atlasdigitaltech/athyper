// server/src/__tests__/web-middleware-host-guard.test.ts
//
// F8 Phase 1 (infra review April 2026): single-ingress host guard.
// Tests the pure decision helper used by apps/web/middleware.ts.
//
// This test lives in server (not apps/web) because apps/web has no vitest
// harness — setting one up is out of scope for an infra finding closeout.
// Vitest's esbuild loader resolves the cross-tree import at test time even
// though server's tsconfig "include" does not cover apps/web.
//
// SUT: apps/web/lib/host-guard.ts
// Consumer that wires this into the Next.js middleware: apps/web/middleware.ts

import { describe, expect, it } from "vitest";

import { decideHostGuard } from "../../../apps/web/lib/host-guard.js";

describe("F8 Phase 1 — decideHostGuard", () => {
  const allowed = new Set(["neon.athyper.local", "api.athyper.local"]);

  it("passes when ALLOW_DIRECT_ACCESS=true, regardless of host", () => {
    expect(
      decideHostGuard({
        host:               "evil.example.com",
        allowedHosts:       allowed,
        allowDirectAccess:  true,
      }),
    ).toEqual({ action: "pass" });
  });

  it("passes when the allowlist is empty (feature disabled)", () => {
    expect(
      decideHostGuard({
        host:               "anything.test",
        allowedHosts:       new Set<string>(),
        allowDirectAccess:  false,
      }),
    ).toEqual({ action: "pass" });
  });

  it("passes when the host matches the allowlist", () => {
    expect(
      decideHostGuard({
        host:               "neon.athyper.local",
        allowedHosts:       allowed,
        allowDirectAccess:  false,
      }),
    ).toEqual({ action: "pass" });
  });

  it("strips port before matching (dev hosts arrive as host:port)", () => {
    expect(
      decideHostGuard({
        host:               "neon.athyper.local:3000",
        allowedHosts:       allowed,
        allowDirectAccess:  false,
      }),
    ).toEqual({ action: "pass" });
  });

  it("matches case-insensitively", () => {
    expect(
      decideHostGuard({
        host:               "NEON.Athyper.Local",
        allowedHosts:       allowed,
        allowDirectAccess:  false,
      }),
    ).toEqual({ action: "pass" });
  });

  it("rejects when the host is not in the allowlist", () => {
    expect(
      decideHostGuard({
        host:               "localhost",
        allowedHosts:       allowed,
        allowDirectAccess:  false,
      }),
    ).toEqual({ action: "reject", reason: "host_not_allowed" });
  });

  it("rejects when the Host header is missing", () => {
    expect(
      decideHostGuard({
        host:               null,
        allowedHosts:       allowed,
        allowDirectAccess:  false,
      }),
    ).toEqual({ action: "reject", reason: "host_missing" });
  });
});
