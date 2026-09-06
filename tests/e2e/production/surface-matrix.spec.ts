import { expect, test } from "@playwright/test";
import {
  CORE_SURFACES,
  REQUIRED_COMPONENT_STATES,
  assertKeyboardReachability,
  assertSurfaceContract,
  assertWebVitalBudgets,
  observeWebVitals,
  productionContext,
} from "./fixtures";

test.beforeEach(async ({ page }, testInfo) => {
  const context = productionContext(testInfo);
  test.skip(!context.enabled, "set PLAYWRIGHT_PRODUCTION_MATRIX=1 and provide plane credentials or a stored session");
  await observeWebVitals(page);
});

test("login and context selection remain reachable", async ({ browser }, testInfo) => {
  const project = productionContext(testInfo);
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.getByLabel(/email|username/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeEnabled();
  await context.close();
  expect(["studio", "neon", "mesh"]).toContain(project.plane);
});

for (const surface of CORE_SURFACES) {
  test(`${surface.code}: shell, accessibility, keyboard and performance`, async ({ page }) => {
    await page.goto(surface.route);
    await assertSurfaceContract(page, surface.code);
    await assertKeyboardReachability(page);
    await assertWebVitalBudgets(page);
  });
}

test("desktop or mobile shell matches the active project", async ({ page }, testInfo) => {
  const { formFactor } = productionContext(testInfo);
  await page.goto("/dashboard");
  if (formFactor === "mobile") {
    await expect(page.getByRole("button", { name: /open navigation|menu/i })).toBeVisible();
  } else {
    await expect(page.getByRole("navigation").first()).toBeVisible();
  }
});

test("Atlas Add menu remains usable from desktop through compact mobile widths", async ({ page }) => {
  await page.goto("/home");
  const composer = page.locator(".athyper-home__hero .athyper-home__composer");
  const add = composer.getByRole("button", { name: "Add context" });
  await expect(add).toBeVisible();
  await add.click();
  const menu = page.getByRole("menu", { name: "Add context" });
  await expect(menu.getByRole("menuitem", { name: /Files from device/ })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: /Business record/ })).toBeDisabled();
  await expect(menu).toContainText("Coming soon");
  await expect(menu.getByRole("menuitem", { name: /Files from device/ })).toBeFocused();
  const desktopTriggerBounds = await add.boundingBox();
  const desktopMenuBounds = await menu.boundingBox();
  expect(Math.abs((desktopMenuBounds?.x ?? 0) - (desktopTriggerBounds?.x ?? 0))).toBeLessThanOrEqual(2);
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: /Files from device/ })).toBeFocused();

  const fileChooser = page.waitForEvent("filechooser");
  await menu.getByRole("menuitem", { name: /Files from device/ }).click();
  expect((await fileChooser).isMultiple()).toBe(true);

  for (const width of [430, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(add).toBeVisible();
    const bounds = await add.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    await expect(composer.getByRole("button", { name: "Ask" })).toBeVisible();
    await add.click();
    const menuBounds = await menu.boundingBox();
    expect(menuBounds?.x).toBeGreaterThanOrEqual(0);
    expect((menuBounds?.x ?? 0) + (menuBounds?.width ?? 0)).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(add).toBeFocused();
  }

  await page.locator("html").evaluate((element) => element.setAttribute("dir", "rtl"));
  await add.click();
  const rtlBounds = await menu.boundingBox();
  expect(rtlBounds?.x).toBeGreaterThanOrEqual(0);
  expect((rtlBounds?.x ?? 0) + (rtlBounds?.width ?? 0)).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  await page.locator("html").evaluate((element) => element.setAttribute("dir", "ltr"));

  await page.setViewportSize({ width: 430, height: 850 });
  await page.getByRole("button", { name: "Pin Atlas to the right side" }).click();
  await expect(page.locator(".athyper-atlas-workspace--dock").getByRole("button", { name: "Add context" })).toBeVisible();
  await page.goto("/atlas?from=%2Fhome");
  await expect(page.locator(".athyper-atlas-workspace--fullscreen").getByRole("button", { name: "Add context" })).toBeVisible();
});

test("Atlas file messages follow the governed attachment vocabulary", async ({ page }) => {
  const attachmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await page.route("**/api/relay/attachments/stage", async (route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ attachmentId, uploadUrl: `https://objects.dev.athyper.test/__e2e-upload/${attachmentId}` }) });
  });
  await page.route("**/__e2e-upload/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ status: 200 });
  });
  await page.route(`**/api/relay/attachments/${attachmentId}/finalize`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ attachmentId, status: "active" }) });
  });
  await page.route(`**/api/relay/attachments/${attachmentId}/status`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ attachmentId, status: "active", extractionStatus: "extracted", fileName: "supplier.pdf", contentType: "application/pdf", sizeBytes: 3 }) });
  });
  await page.goto("/home");
  const composer = page.locator(".athyper-home__hero .athyper-home__composer");
  const input = composer.locator('input[type="file"]');

  await input.setInputFiles({ name: "unsupported.exe", mimeType: "application/octet-stream", buffer: Buffer.from("bad") });
  await expect(composer).toContainText("Choose a supported file up to 25 MB.");

  await input.setInputFiles({ name: "oversized.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(25 * 1024 * 1024 + 1) });
  await expect(composer).toContainText("This file exceeds the 25 MB limit.");

  await input.setInputFiles({ name: "supplier.pdf", mimeType: "application/pdf", buffer: Buffer.from("pdf") });
  await expect(composer).not.toContainText("This file exceeds the 25 MB limit.");
  await expect(composer).toContainText("Uploading and virus scanning…");
  await expect(composer).toContainText("Preparing governed content…");
  await expect(composer).toContainText("Ready to use");
});

test("light, dark and density modes retain the surface contract", async ({ page }) => {
  await page.goto("/settings");
  for (const theme of ["light", "dark"]) {
    for (const density of ["compact", "default", "comfortable"]) {
      await page.evaluate(({ theme: nextTheme, density: nextDensity }) => {
        document.documentElement.classList.toggle("dark", nextTheme === "dark");
        document.documentElement.dataset.density = nextDensity;
      }, { theme, density });
      await assertSurfaceContract(page, `settings:${theme}:${density}`);
    }
  }
});

test("runtime list/detail/document fixtures use bounded requests", async ({ page }) => {
  const entity = process.env.PLAYWRIGHT_RUNTIME_ENTITY;
  const record = process.env.PLAYWRIGHT_RUNTIME_RECORD_ID;
  test.skip(!entity || !record, "requires PLAYWRIGHT_RUNTIME_ENTITY and PLAYWRIGHT_RUNTIME_RECORD_ID");
  const listRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/^\/api\/entity-runtime\/[^/]+\/list\/?$/.test(url.pathname)) {
      listRequests.push(url.toString());
    }
  });
  await page.goto(`/app/${encodeURIComponent(entity!)}`);
  await assertSurfaceContract(page, "runtime-list");
  await page.goto(`/app/${encodeURIComponent(entity!)}/${encodeURIComponent(record!)}`);
  await assertSurfaceContract(page, "runtime-detail-document");
  expect(listRequests.length, "runtime navigation must issue a list request").toBeGreaterThan(0);
  expect(listRequests.every((value) => {
    const url = new URL(value);
    return ["limit", "page_size", "size"].some((key) => /^\d+$/.test(url.searchParams.get(key) ?? ""));
  }), `unbounded runtime requests: ${listRequests.filter((value) => !/(?:limit|page_size|size)=\d+/.test(value)).join(", ")}`).toBe(true);
});

test("dashboard and settings bootstrap without route-level request waterfalls", async ({ page }) => {
  for (const route of ["/dashboard", "/settings"]) {
    const bootstrapRequests: string[] = [];
    const listener = (request: { resourceType(): string; url(): string }) => {
      if (request.resourceType() === "fetch" || request.resourceType() === "xhr") {
        bootstrapRequests.push(request.url());
      }
    };
    page.on("request", listener);
    await page.goto(route);
    await page.locator("[aria-busy='true']").first().waitFor({ state: "detached", timeout: 20_000 }).catch(() => undefined);
    page.removeListener("request", listener);
    const aggregateRequests = bootstrapRequests.filter((url) =>
      route === "/dashboard"
        ? /\/api\/relay\/platform\/dashboard(?:\?|$)/.test(url)
        : /\/api\/.*settings.*(?:bootstrap|effective)(?:\?|$)/.test(url));
    expect(aggregateRequests.length, `${route} bootstrap request count`).toBeLessThanOrEqual(1);
  }
});

for (const state of REQUIRED_COMPONENT_STATES) {
  test(`seeded component state: ${state}`, async ({ page }) => {
    const environmentKey = `PLAYWRIGHT_STATE_${state.replaceAll("-", "_").toUpperCase()}_ROUTE`;
    const route = process.env[environmentKey];
    test.skip(!route, `requires ${environmentKey}`);
    await page.goto(route!);
    await expect(
      page.locator(`[data-ui-state="${state}"]`).or(page.getByText(stateText(state))).first(),
    ).toBeVisible();
  });
}

test("permission denied and expired session fail closed", async ({ page, context }) => {
  const deniedRoute = process.env.PLAYWRIGHT_DENIED_ROUTE ?? "/settings/tenant/not-authorized/general";
  await page.goto(deniedRoute);
  await expect(page.locator("body")).toContainText(/denied|not authorized|not found|unavailable/i);
  await context.clearCookies();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login|auth/i);
});

test("required state vocabulary is complete", () => {
  expect(REQUIRED_COMPONENT_STATES).toEqual([
    "loading", "empty", "partial", "error", "unauthorized", "unavailable",
    "stale", "mutation-pending", "mutation-success", "mutation-conflict",
    "mutation-failure",
  ]);
});

function stateText(state: (typeof REQUIRED_COMPONENT_STATES)[number]): RegExp {
  const patterns: Record<(typeof REQUIRED_COMPONENT_STATES)[number], RegExp> = {
    loading: /loading/i,
    empty: /no .* available|no .* found|empty/i,
    partial: /some data .* unavailable|partial/i,
    error: /unable to load|temporarily unavailable|try again/i,
    unauthorized: /denied|not authorized/i,
    unavailable: /feature unavailable|not available/i,
    stale: /stale|out of date/i,
    "mutation-pending": /saving|submitting|working/i,
    "mutation-success": /saved|completed|success/i,
    "mutation-conflict": /changed elsewhere|conflict/i,
    "mutation-failure": /save failed|action failed|could not be saved/i,
  };
  return patterns[state];
}
