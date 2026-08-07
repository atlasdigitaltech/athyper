import type { NextRequest } from "next/server";
import { createPlaneProxy, createPlaneProxyHostGuardSettings } from "@athyper/app-foundation/proxy";
import { i18nConfig } from "@athyper/platform-i18n/config";
import { isForbiddenPath, isPublicPath } from "@athyper/app-neon-route-manifest";
import { getPlaneConfig } from "@athyper/platform-iam-session-plane";

import { PLANE_KEY } from "./lib/plane";

const planeProxy = createPlaneProxy({
  plane: getPlaneConfig(PLANE_KEY),
  isPublicPath,
  isForbiddenPath,
  locale: {
    locales: i18nConfig.locales,
    defaultLocale: i18nConfig.defaultLocale,
  },
  hostGuard: createPlaneProxyHostGuardSettings(process.env),
});

export function proxy(request: NextRequest) {
  return planeProxy(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|favicon\\.ico|icon\\.svg|livez).*)"],
};
