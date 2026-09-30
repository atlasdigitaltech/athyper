import { chromium, request, type FullConfig } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { authenticateBrowser } from "../authenticate-browser";

export default async function setup(config: FullConfig): Promise<void> {
  const origin = String(config.projects[0]!.use.baseURL);
  const suppliedState = process.env.PLAYWRIGHT_MESH_STORAGE_STATE;
  if (suppliedState) {
    const client = await request.newContext({ baseURL: origin, storageState: resolve(suppliedState), ignoreHTTPSErrors: true });
    try {
      const response = await client.get("/api/auth/session");
      const session = response.ok() ? await response.json() : undefined;
      if (session?.state !== "authenticated" || session.plane !== "mesh" || !session.tenantId || !session.principalId) {
        throw new Error("The supplied storage state does not establish an authenticated Mesh tenant session. Sign in again.");
      }
    } finally { await client.dispose(); }
    return;
  }
  const username = process.env.PLAYWRIGHT_MESH_USER;
  const password = process.env.PLAYWRIGHT_MESH_PASSWORD;
  if (!username || !password) {
    throw new Error("Authenticated Mesh review requires PLAYWRIGHT_MESH_USER and PLAYWRIGHT_MESH_PASSWORD, or PLAYWRIGHT_MESH_STORAGE_STATE. Tests were not run; this is not a passing verification.");
  }
  const browser = await chromium.launch();
  try {
    // Login runs outside test tracing so credentials are not retained in traces.
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    await authenticateBrowser(await context.newPage(), {
      origin, username, password, tenantName: process.env.PLAYWRIGHT_MESH_TENANT_NAME,
    });
    const statePath = String(config.projects[0]!.use.storageState);
    await mkdir(dirname(statePath), { recursive: true });
    await context.storageState({ path: statePath });
    await context.close();
  } finally { await browser.close(); }
}
