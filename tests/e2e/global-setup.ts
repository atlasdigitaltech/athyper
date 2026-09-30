import { authenticateBrowser } from "./authenticate-browser";
import { chromium, request, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const LEGACY_STORAGE_STATE_PATH = "./tests/e2e/.auth/storage-state.json";
const PLANES = ["studio", "neon", "mesh"] as const;

/**
 * Creates one authenticated storage state per plane. Credentials may be
 * plane-specific or inherit PLAYWRIGHT_USER / PLAYWRIGHT_PASSWORD.
 * Missing credentials overwrite stale state with an empty state so discovery
 * and dry-runs cannot accidentally reuse an old authenticated run.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  // Explicit reuse supports sessions established through interactive MFA.
  // Validate with the BFF; the presence of a cookie alone does not prove login.
  const reusePlane = process.env.PLAYWRIGHT_REUSE_AUTH_STATE;
  if (reusePlane) {
    if (!PLANES.some((plane) => plane === reusePlane)) {
      throw new Error("PLAYWRIGHT_REUSE_AUTH_STATE must be studio, neon, or mesh");
    }
    const project = config.projects.find((item) => item.name === `production-${reusePlane}-desktop`);
    if (!project?.use.baseURL) throw new Error(`No base URL configured for ${reusePlane}`);
    const client = await request.newContext({
      baseURL: String(project.use.baseURL),
      ignoreHTTPSErrors: true,
      storageState: `./tests/e2e/.auth/${reusePlane}.json`,
    });
    try {
      const response = await client.get("/api/auth/session");
      const session = response.ok() ? await response.json() : undefined;
      if (session?.state !== "authenticated" || session.plane !== reusePlane || !session.tenantId) {
        throw new Error(`Saved ${reusePlane} session is not authenticated; complete sign-in and MFA again`);
      }
    } finally {
      await client.dispose();
    }
    return;
  }
  const hasAnyCredentials = PLANES.some((plane) => {
    const suffix = plane.toUpperCase();
    return Boolean(
      (process.env[`PLAYWRIGHT_${suffix}_USER`] ?? process.env.PLAYWRIGHT_USER) &&
        (process.env[`PLAYWRIGHT_${suffix}_PASSWORD`] ?? process.env.PLAYWRIGHT_PASSWORD),
    );
  });

  if (!hasAnyCredentials) {
    for (const plane of PLANES) {
      await writeEmptyState(`./tests/e2e/.auth/${plane}.json`);
    }
    await writeEmptyState(LEGACY_STORAGE_STATE_PATH);
    return;
  }

  const browser = await chromium.launch();
  try {
    for (const plane of PLANES) {
      const project = config.projects.find(
        (candidate) => candidate.name === `production-${plane}-desktop`,
      );
      const baseURL = String(project?.use.baseURL ?? "");
      const suffix = plane.toUpperCase();
      const username = process.env[`PLAYWRIGHT_${suffix}_USER`] ?? process.env.PLAYWRIGHT_USER;
      const password = process.env[`PLAYWRIGHT_${suffix}_PASSWORD`] ?? process.env.PLAYWRIGHT_PASSWORD;
      const statePath = `./tests/e2e/.auth/${plane}.json`;

      if (!username || !password || !baseURL) {
        await writeEmptyState(statePath);
        continue;
      }

      await writeEmptyState(statePath);
      if (plane === "neon") await writeEmptyState(LEGACY_STORAGE_STATE_PATH);
      mkdirSync(dirname(statePath), { recursive: true });
      const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
      const page = await context.newPage();
      await authenticateBrowser(page, {
        origin: baseURL, username, password,
        tenantName: process.env[`PLAYWRIGHT_${suffix}_TENANT_NAME`],
      });

      const state = await context.storageState();
      const authenticated = state.cookies.some(({ name, value }) =>
        (name === "athyper-session" || name === "__Host-athyper-session") && value.length > 0);
      if (!authenticated) {
        await context.close();
        throw new Error(`${plane} login completed without an Athyper session cookie`);
      }
      await context.storageState({ path: statePath });
      if (plane === "neon") {
        await context.storageState({ path: LEGACY_STORAGE_STATE_PATH });
      }
      await context.close();
    }
    const neonHasCredentials = Boolean(
      (process.env.PLAYWRIGHT_NEON_USER ?? process.env.PLAYWRIGHT_USER)
      && (process.env.PLAYWRIGHT_NEON_PASSWORD ?? process.env.PLAYWRIGHT_PASSWORD),
    );
    if (!neonHasCredentials) await writeEmptyState(LEGACY_STORAGE_STATE_PATH);
  } finally {
    await browser.close();
  }
}

async function writeEmptyState(path: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const fs = await import("node:fs/promises");
  await fs.writeFile(path, JSON.stringify({ cookies: [], origins: [] }, null, 2));
}
