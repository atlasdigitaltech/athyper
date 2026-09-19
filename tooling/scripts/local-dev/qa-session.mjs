/** Capture ordinary QA login/MFA; never automate credentials or approval. */
import { mkdir, chmod, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import targets from "../verification/auth-capture-target.cjs";

// Existing Cirrus principals verified against the retained QA database.
export const accounts = Object.freeze({
  "catl.admin": "81cd1978-2df5-5c9a-938a-2f8c291aea13",
  "catl.owner": "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d",
});
export const tenantId = "44444444-4444-4444-8444-444444444444";
export function validateSession(session, plane, actor) {
  if (!["studio", "neon"].includes(plane) || !Object.hasOwn(accounts, actor))
    throw new Error("Unsupported QA plane or account");
  if (
    session?.state !== "authenticated" ||
    session.plane !== plane ||
    session.tenantId !== tenantId ||
    session.principalId !== targets.identities[plane][actor]
  ) {
    throw new Error(
      "QA session is expired or does not match the selected Cirrus account and plane.",
    );
  }
}
async function main() {
  process.umask(0o077);
  const { values } = parseArgs({
    options: {
      plane: { type: "string" },
      actor: { type: "string" },
      check: { type: "boolean", default: false },
    },
  });
  const { plane, actor } = values;
  if (!["studio", "neon"].includes(plane) || !Object.hasOwn(accounts, actor))
    throw new Error(
      "Usage: pnpm qa:session --plane studio|neon --actor catl.admin|catl.owner [--check]",
    );
  const dir = join(
    homedir(),
    ".athyper",
    "qualification",
    "sessions",
    "qa",
    plane,
  );
  const state = join(dir, `${actor}.json`);
  const baseURL = `https://${plane}.qa.athyper.test`;
  const { chromium } = await import("@playwright/test");
  const browserArgs = ["--host-resolver-rules=MAP *.qa.athyper.test 127.0.0.1"];
  const verify = async (page) => {
    const result = await page.evaluate(async () => {
      const response = await fetch("/api/auth/session");
      return {
        ok: response.ok,
        status: response.status,
        session: response.ok ? await response.json() : null,
      };
    });
    if (!result.ok)
      throw new Error(
        `QA session endpoint returned HTTP ${result.status}; no session was saved.`,
      );
    validateSession(result.session, plane, actor);
  };
  if (values.check) {
    const browser = await chromium.launch({
      headless: true,
      args: browserArgs,
    });
    try {
      const context = await browser.newContext({
        storageState: state,
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();
      // A JSON navigation avoids racing application redirects during checks.
      await page.goto(`${baseURL}/api/auth/session`);
      await verify(page);
    } finally {
      await browser.close();
    }
    console.log(`Verified existing QA ${plane} session for ${actor} (Cirrus).`);
    return;
  }
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)
    throw new Error(
      "Capture requires a graphical terminal on your local desktop. Run this command there after QA is healthy.",
    );
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const browser = await chromium.launch({ headless: false, args: browserArgs });
  const temporary = `${state}.${process.pid}.tmp`;
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto(baseURL);
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      await prompt.question(
        `Sign in as ${actor}, complete normal MFA and select Cirrus. Press Enter here when the ${plane} application is ready. `,
      );
    } finally {
      prompt.close();
    }
    await verify(page);
    await context.storageState({ path: temporary });
    await chmod(temporary, 0o600);
    await rename(temporary, state);
    console.log(`Verified QA session saved privately: ${state}`);
  } finally {
    await rm(temporary, { force: true });
    await browser.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
