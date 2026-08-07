import { NextRequest } from "next/server";
import type { PlaneConfig } from "@athyper/platform-iam-session-plane";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaneProxyHandler } from "./proxy";

export interface PlaneProxyContractSuiteOptions {
  name: string;
  origin: string;
  plane: PlaneConfig;
  publicPath: string;
  forbiddenPath: string;
  loadProxy: () => Promise<PlaneProxyHandler>;
}

export function definePlaneProxyContractSuite(options: PlaneProxyContractSuiteOptions): void {
  const host = new URL(options.origin).host;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ALLOW_DIRECT_ACCESS", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function runProxy(
    path: string,
    init: { method?: string; headers?: Record<string, string> } = {},
  ) {
    const proxy = await options.loadProxy();
    return proxy(new NextRequest(`${options.origin}${path}`, {
      method: init.method,
      headers: {
        host,
        ...init.headers,
      },
    }));
  }

  describe(`${options.name} proxy configuration`, () => {
    it("keeps its declared public routes accessible without a session", async () => {
      const response = await runProxy(options.publicPath);
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    it("blocks its declared forbidden routes before authentication", async () => {
      const response = await runProxy(options.forbiddenPath);
      expect(response.status).toBe(404);
    });

    it("accepts a hardened session cookie on protected pages", async () => {
      const response = await runProxy("/settings", {
        headers: { cookie: `__Host-${options.plane.cookieName}=session-token` },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    it("accepts a hardened CSRF cookie on mutations", async () => {
      const response = await runProxy("/api/relay/metadata", {
        method: "POST",
        headers: {
          cookie: `__Host-${options.plane.csrfCookieName}=csrf-token`,
          "x-csrf-token": "csrf-token",
        },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    it("honors a hardened MFA-pending cookie", async () => {
      const response = await runProxy("/settings", {
        headers: {
          cookie: [
            `__Host-${options.plane.cookieName}=session-token`,
            `__Host-${options.plane.mfaPendingCookieName}=1`,
          ].join("; "),
        },
      });
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/mfa/challenge");
    });
  });
}
