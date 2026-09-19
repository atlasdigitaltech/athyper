import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserApplicationProviders } from "../../../packages/platform/shell/app-foundation/src/index";
import { UtilitiesMenu } from "../../../packages/platform/shell/shell/src/shell-utilities-menu";
import { parseExperienceBootstrap, type ExperienceBootstrap } from "@athyper/platform-api-client";
import type { SanitizedSession } from "@athyper/contract-platform-auth-session";

const session: SanitizedSession = { schemaVersion: 1, state: "authenticated", plane: "neon", realmKey: "athyper", tenantId: "tenant-a", principalId: "principal-a", authEpoch: 1, sessionVersion: 1, configurationRevision: "1", expiresAt: "2099-08-12T12:00:00.000Z", idleExpiresAt: "2099-08-12T12:00:00.000Z", absoluteExpiresAt: "2099-08-12T18:00:00.000Z", assurance: "baseline", requiredActions: [], allowedNextActions: [] };
const bootstrap: ExperienceBootstrap = parseExperienceBootstrap({ schemaVersion: 1, state: "ready", planeKey: "neon", tenantId: "tenant-a", principalId: "principal-a", revision: "e1", identity: { displayName: "User One", secondaryLabel: "user.one", initials: "UO" }, tenant: { id: "tenant-a", code: "tenant-alpha", displayName: "Tenant Alpha" }, profile: { localeCode: "en-US", languageCode: "en", timezoneCode: "UTC", dateFormat: "yyyy-MM-dd", numberFormat: "latn", weekStart: 1, weekendDays: [0, 6], appearanceMode: "light", densityCode: "comfortable" }, workspaces: [], permissions: [], features: {}, nextActions: [] });

createRoot(document.getElementById("root")!).render(
  <BrowserApplicationProviders session={session} bootstrap={bootstrap}>
    <UtilitiesMenu applicationName="Athyper Test" planeDescriptor="Fixture workspace" />
  </BrowserApplicationProviders>,
);
