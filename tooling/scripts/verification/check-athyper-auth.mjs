import { chromium } from "@playwright/test";
import { chmod, copyFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import targets from "./auth-capture-target.cjs";

// Never print the storage state, cookie values, or response body.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
async function main() {
  const { values } = parseArgs({
    options: {
      environment: { type: "string", default: "dev" },
      plane: { type: "string" },
      actor: { type: "string" },
      "principal-id": { type: "string" },
      "tenant-id": { type: "string" },
      "require-elevated": { type: "boolean", default: false },
      "isolated-studio": { type: "boolean", default: false },
      "isolated-neon": { type: "boolean", default: false },
      activate: { type: "boolean", default: false },
    },
  });
  const { plane, actor } = values;
  const target = targets.captureTarget({ ...values, repo });
  if ((target.isolatedStudio || target.isolatedNeon) && values.activate)
    throw new Error(
      "Isolated sessions cannot activate shared DEV compatibility state",
    );
  const principalId = values["principal-id"] || target.principalId;
  const tenantId = values["tenant-id"] || target.tenantId;
  if (
    !["neon", "mesh", "studio"].includes(plane) ||
    !["catl.admin", "catl.owner", "athyper.admin", "athyper.owner"].includes(
      actor,
    )
  ) {
    throw new Error(
      "Usage: node tooling/scripts/verification/check-athyper-auth.mjs --plane neon|mesh|studio --actor catl.admin|catl.owner|athyper.admin|athyper.owner [--environment dev|qa] [--principal-id ID] [--tenant-id ID] [--activate]",
    );
  }
  const statePath = target.statePath;
  await chmod(statePath, 0o600);
  const browser = await chromium.launch({
    headless: true,
    args: [
      `--host-resolver-rules=MAP *.${target.environment}.athyper.test 127.0.0.1`,
    ],
  });
  try {
    const context = await browser.newContext({
      ...(target.proxy ? { proxy: target.proxy } : {}),
      storageState: statePath,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    const response = await page.goto(`${target.origin}/api/auth/session`);
    if (!response?.ok())
      throw new Error(`Session endpoint returned HTTP ${response?.status()}`);
    let session = await response.json();
    if (
      session.state !== "authenticated" ||
      session.plane !== plane ||
      !session.tenantId ||
      !session.principalId
    ) {
      throw new Error(
        "Session is expired, incomplete, or for the wrong plane. Capture it again.",
      );
    }
    if (principalId && session.principalId !== principalId)
      throw new Error(
        "Principal ID mismatch. Existing compatibility state retained.",
      );
    if (tenantId && session.tenantId !== tenantId)
      throw new Error(
        "Tenant ID mismatch. Existing compatibility state retained.",
      );
    if (values["require-elevated"] && session.assurance !== "elevated")
      throw new Error(
        "Session is authenticated but not elevated. Use Refresh-AthyperAuth.ps1 -Elevated; ordinary refresh does not perform step-up.",
      );
    if (Date.parse(session.accessExpiresAt ?? "") <= Date.now() + 60_000) {
      const refreshed = await page.evaluate(async () => {
        const cookie = document.cookie.split("; ").find(value => /^(__Host-)?athyper-csrf=/.test(value));
        const response = await fetch("/api/auth/refresh", { method: "POST", headers: { "x-csrf-token": cookie ? decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)) : "" } });
        return { ok: response.ok, status: response.status, body: await response.json() };
      });
      if (!refreshed.ok || refreshed.body.state !== "authenticated" || refreshed.body.principalId !== session.principalId || refreshed.body.tenantId !== session.tenantId || refreshed.body.plane !== plane)
        throw new Error(`Session refresh failed identity validation (HTTP ${refreshed.status}); saved state retained.`);
      session = refreshed.body;
      if (values["require-elevated"] && session.assurance !== "elevated")
        throw new Error("Session refreshed, but a new MFA step-up is required.");
    }
    const refreshedPath = `${statePath}.${process.pid}.tmp`;
    try {
      await writeFile(refreshedPath, "", { mode: 0o600, flag: "wx" });
      await context.storageState({ path: refreshedPath });
      await rename(refreshedPath, statePath);
    } finally {
      await rm(refreshedPath, { force: true });
    }
    console.log(
      JSON.stringify(
        {
          isolatedStudio: target.isolatedStudio,
          environment: target.environment,
          plane,
          actorLabel: actor,
          authenticated: true,
          assurance: session.assurance,
          principalId: session.principalId,
          tenantId: session.tenantId,
          actorVerified: Boolean(principalId),
          tenantVerified: Boolean(tenantId),
        },
        null,
        2,
      ),
    );
    if (!principalId)
      console.log(
        "Actor label is unverified; supply --principal-id from a trusted account record to verify it.",
      );
    if (target.environment === "qa") {
      if (!principalId)
        throw new Error(
          "QA verification requires --principal-id for this actor/plane",
        );
      const qualified = resolve(
        homedir(),
        `.athyper/qualification/sessions/qa/${plane}/${actor}.json`,
      );
      await mkdir(dirname(qualified), { recursive: true, mode: 0o700 });
      const pending = `${qualified}.${process.pid}.tmp`;
      try {
        await copyFile(statePath, pending);
        await chmod(pending, 0o600);
        await rename(pending, qualified);
      } finally {
        await rm(pending, { force: true });
      }
      console.log(`Saved verified QA qualification session: ${qualified}`);
    }
    if (values.activate) {
      const destination = resolve(repo, `tests/e2e/.auth/${plane}.json`);
      const temporary = `${destination}.${process.pid}.tmp`;
      try {
        await copyFile(statePath, temporary);
        await chmod(temporary, 0o600);
        await rename(temporary, destination);
      } finally {
        await rm(temporary, { force: true });
      }
      console.log(`Updated compatibility file tests/e2e/.auth/${plane}.json`);
      console.log(
        `export PLAYWRIGHT_${plane.toUpperCase()}_BASE_URL="${target.origin}"`,
      );
      console.log(`export PLAYWRIGHT_REUSE_AUTH_STATE=${plane}`);
    }
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
