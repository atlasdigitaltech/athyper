import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { getPlaneConfig } from "@athyper/platform-iam-session-plane";
import {
  createPlaneProxy,
  createPlaneProxyHostGuardSettings,
} from "./proxy";

describe("createPlaneProxy", () => {
  it("parses host-guard environment values once at the app boundary", () => {
    const settings = createPlaneProxyHostGuardSettings({
      ALLOW_DIRECT_ACCESS: "true",
      ALLOWED_HOSTS: " NEON.ATHYPER.LOCAL, mesh.athyper.local ",
      GATEWAY_ORIGIN: "https://gateway.athyper.local",
    });

    expect(settings.allowDirectAccess).toBe(true);
    expect(settings.allowedHosts).toEqual(new Set(["neon.athyper.local", "mesh.athyper.local"]));
    expect(settings.gatewayOrigin).toBe("https://gateway.athyper.local");
  });

  it("uses injected host-guard settings for rejected browser requests", () => {
    const proxy = createPlaneProxy({
      plane: getPlaneConfig("neon"),
      isPublicPath: () => false,
      isForbiddenPath: () => false,
      locale: { locales: ["en"], defaultLocale: "en" },
      hostGuard: {
        allowDirectAccess: false,
        allowedHosts: new Set(["neon.athyper.local"]),
        gatewayOrigin: "https://gateway.athyper.local",
      },
    });

    const response = proxy(new NextRequest("https://unexpected.athyper.local/dashboard", {
      headers: { host: "unexpected.athyper.local" },
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://gateway.athyper.local/dashboard");
  });
});
