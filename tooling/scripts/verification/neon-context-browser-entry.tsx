import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserApplicationProviders } from "../../../packages/platform/shell/app-foundation/src/index";
import {
  NeonShell,
  useNeonWorkContext,
} from "../../../packages/planes/neon/shell/src/index";
import { useContextDepartureGuard } from "../../../packages/platform/shell/shell/src/context-departure";
import { parseExperienceBootstrap } from "../../../packages/platform/foundation/api-client/src/index";
import type { SanitizedSession } from "@athyper/contract-platform-auth-session";

const session: SanitizedSession = {
  schemaVersion: 1,
  state: "authenticated",
  plane: "neon",
  realmKey: "athyper",
  tenantId: "tenant-a",
  principalId: "principal-a",
  authEpoch: 1,
  sessionVersion: 1,
  configurationRevision: "1",
  expiresAt: "2099-08-12T12:00:00.000Z",
  idleExpiresAt: "2099-08-12T12:00:00.000Z",
  absoluteExpiresAt: "2099-08-12T18:00:00.000Z",
  assurance: "baseline",
  requiredActions: [],
  allowedNextActions: [],
};
const bootstrap = parseExperienceBootstrap({
  schemaVersion: 1,
  state: "ready",
  planeKey: "neon",
  tenantId: "tenant-a",
  principalId: "principal-a",
  revision: "e1",
  identity: { displayName: "User One", initials: "UO" },
  tenant: { id: "tenant-a", code: "tenant-alpha", displayName: "Tenant Alpha" },
  profile: {
    localeCode: "en-US",
    languageCode: "en",
    timezoneCode: "UTC",
    dateFormat: "yyyy-MM-dd",
    numberFormat: "latn",
    weekStart: 1,
    weekendDays: [0, 6],
    appearanceMode: "light",
    densityCode: "comfortable",
  },
  workspaces: [
    {
      code: "mdg",
      name: "Master data",
      sortOrder: 1,
      modules: [
        { code: "bp", name: "Business Partners", sortOrder: 1, primary: true },
      ],
    },
  ],
  permissions: [],
  features: {},
  nextActions: [],
});

function Content() {
  const work = useNeonWorkContext();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  useContextDepartureGuard({ dirty: !!draft, busy });
  return (
    <section>
      <h1>Context fixture</h1>
      <output data-testid="scope">
        {work.legalEntityId} /{" "}
        {work.selection.mode === "company"
          ? work.selection.companyCodeId
          : "none"}
      </output>
      <label>
        Draft
        <input
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={busy}
          onChange={(event) => setBusy(event.currentTarget.checked)}
        />
        Running command
      </label>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserApplicationProviders session={session} bootstrap={bootstrap}>
    <NeonShell bootstrap={bootstrap}>
      <Content />
    </NeonShell>
  </BrowserApplicationProviders>,
);
