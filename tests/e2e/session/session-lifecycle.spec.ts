import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { storageStateHasAuthenticatedSession } from "../auth-state";

// Session lifecycle is an E2E contract, not a visual-regression scenario.

test.describe("session lifecycle", () => {
  test.beforeEach(({}, testInfo) => {
    const plane = sessionPlane(testInfo);
    test.skip(!storageStateHasAuthenticatedSession(resolve(`tests/e2e/.auth/${plane}.json`), String(testInfo.project.use.baseURL ?? "")), "requires a successfully established authenticated storage state");
  });

  test("manual logout clears the browser session and redirects to login", async ({ page }) => {
    await page.goto("/logout");
    await page.getByRole("button", { name: /sign out of/i }).first().click();
    await expect(page).toHaveURL(/login|logout/i);
    await expect.poll(async () => (await page.context().cookies()).some(({ name }) => name === "athyper-session" || name === "__Host-athyper-session")).toBe(false);
  });

  test("the next idle or absolute expiry warning is emitted on schedule", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    const session = await page.evaluate(async () => (await fetch("/api/auth/session", { credentials: "same-origin" })).json()) as { idleExpiresAt?: string; absoluteExpiresAt?: string };
    const now = Date.now();
    const expiries = [
      session.idleExpiresAt ? { kind: "idle", value: Date.parse(session.idleExpiresAt) } : undefined,
      session.absoluteExpiresAt ? { kind: "absolute", value: Date.parse(session.absoluteExpiresAt) } : undefined,
    ].filter((candidate): candidate is { kind: "idle" | "absolute"; value: number } => Boolean(candidate && Number.isFinite(candidate.value) && candidate.value > now));
    expect(expiries.length, "authenticated session must publish a future expiry").toBeGreaterThan(0);
    const next = expiries.sort((left, right) => left.value - right.value)[0]!;
    await page.clock.fastForward(Math.max(0, next.value - now - 5 * 60_000) + 100);
    await expect(page.getByRole("status").filter({ hasText: next.kind === "idle" ? "Session idle timeout approaching" : "Session ending soon" })).toBeVisible();
  });

  test("cross-tab termination event redirects both tabs", async ({ context }, testInfo) => {
    const plane = sessionPlane(testInfo);
    const first = await context.newPage();
    const second = await context.newPage();
    await Promise.all([first.goto("/"), second.goto("/")]);
    await waitForSessionListeners([first, second], plane);
    await first.evaluate((activePlane) => new BroadcastChannel(`athyper:${activePlane}:session-activity`).postMessage({ type: "session_terminated", reason: "logout" }), plane);
    await expect(first).toHaveURL(/login|logout/i);
    await expect(second).toHaveURL(/login|logout/i);
  });
});

async function waitForSessionListeners(pages: import("@playwright/test").Page[], activePlane: string): Promise<void> {
  await Promise.all(pages.map((page) => page.evaluate((currentPlane) => new Promise<void>((resolveReady, reject) => {
    const channel = new BroadcastChannel(`athyper:${currentPlane}:session-activity`);
    const timeout = window.setTimeout(() => { channel.close(); reject(new Error("session activity listener did not register")); }, 5_000);
    channel.addEventListener("message", (event) => {
      if (event.data?.type !== "session_listener_ready") return;
      window.clearTimeout(timeout);
      channel.close();
      resolveReady();
    });
    channel.postMessage({ type: "session_probe" });
  }), activePlane)));
}

function sessionPlane(testInfo: import("@playwright/test").TestInfo): "studio" | "neon" | "mesh" {
  const value = (testInfo.project.metadata as { plane?: unknown }).plane;
  return value === "studio" || value === "mesh" ? value : "neon";
}
