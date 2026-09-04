import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
const css = `${readFileSync("packages/platform/foundation/theme/src/styles.css", "utf8")}\n${readFileSync("packages/platform/shell/shell/src/styles.css", "utf8")}`;
const bundle = buildSync({ entryPoints: ["tooling/scripts/verification/shell-browser-entry.tsx"], bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", nodePaths: ["apps/neon/node_modules"] }).outputFiles[0]!.text;
async function mount(page: import("@playwright/test").Page, width = 900, empty = false, path = "/", query = "", direction: "ltr" | "rtl" = "ltr") { const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); await page.setViewportSize({ width, height: 700 }); await page.route("https://shell.test/**", (route) => route.request().url().endsWith("/api/auth/session/context") ? route.fallback() : route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${direction === "rtl" ? "ar" : "en"}" dir="${direction}"><head><style>${css}</style></head><body><div id="root"></div></body></html>` })); await page.goto(`https://shell.test${path}${empty ? "?empty" : query}`); await page.evaluate(bundle); if (empty) await expect(page.getByRole("heading", { name: "No applications available" })).toBeVisible(); else if (path === "/forbidden") await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible(); else await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible(); expect(errors).toEqual([]); }

test("desktop shell exposes landmarks, sidebar profile, context, and logout", async ({ page }) => { await mount(page); await expect(page.getByRole("complementary", { name: "Application navigation" })).toBeVisible(); await expect(page.getByRole("navigation", { name: "Workspaces" })).toBeVisible(); await expect(page.locator(".athyper-shell__rail-brand")).toHaveAttribute("href", "/"); await expect(page.locator(".athyper-shell__rail-brand")).toHaveAccessibleName("Athyper Test home"); await expect(page.locator(".athyper-shell__mobile-brand")).toBeHidden(); await expect(page.getByRole("main")).toBeVisible(); await expect(page.getByRole("contentinfo")).toContainText("Atlas Digital Technology Solutions"); await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused(); await expect(page.locator("[data-slot]" )).toHaveCount(4); await expect(page.locator("summary[aria-label*='Switch business context']")).toContainText("Tenant Alpha"); await expect(page.locator(".athyper-shell__topbar")).not.toContainText("User One"); await page.getByRole("group").filter({ has: page.getByText("User One", { exact: true }) }).locator("summary").click(); await expect(page.getByText("user.one@example.test", { exact: true })).toBeVisible(); await expect(page.getByText("Organization", { exact: true })).toBeVisible(); await expect(page.getByText("Working company", { exact: true })).toBeVisible(); await expect(page.getByRole("link", { name: "Sign out" })).toBeVisible(); const results = await new AxeBuilder({ page }).analyze(); expect(results.violations.filter((item) => item.impact === "critical")).toEqual([]); });
test("persistent desktop brand stays fixed while only the navigation rail collapses", async ({ page }) => {
  await mount(page, 1280, false, "/", "?desktopBrand");
  const brand = page.locator(".athyper-shell__desktop-brand");
  const brandLink = page.locator(".athyper-shell__desktop-brand-link");
  const rail = page.locator(".athyper-shell__rail");
  await expect(brand).toBeVisible();
  await expect(brandLink).toHaveAccessibleName("Athyper Test home");
  await expect(page.locator(".athyper-shell__rail-brand")).toBeHidden();
  const before = { brand: await brand.boundingBox(), rail: await rail.boundingBox() };
  await page.locator(".athyper-shell__desktop-brand-toggle").click();
  await expect(page.locator(".athyper-shell")).toHaveAttribute("data-collapsed", "true");
  const after = { brand: await brand.boundingBox(), rail: await rail.boundingBox() };
  expect(after.brand).toEqual(before.brand);
  expect(Math.round(before.rail?.width ?? 0)).toBe(280);
  expect(Math.round(after.rail?.width ?? 0)).toBe(56);
});
test("persistent desktop brand option preserves the existing mobile header", async ({ page }) => {
  await mount(page, 390, false, "/", "?desktopBrand");
  await expect(page.locator(".athyper-shell__desktop-brand")).toBeHidden();
  await expect(page.locator(".athyper-shell__mobile-brand")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
});
test("narrow mobile header keeps controls centered without shrinking touch targets", async ({ page }) => {
  await mount(page, 280, false, "/", "?desktopBrand");
  await expect(page.getByRole("button",{name:"Inbox"})).toBeHidden();
  const geometry=await page.evaluate(()=>{
    const topbar=document.querySelector(".athyper-shell__topbar")!.getBoundingClientRect();
    const children=Array.from(document.querySelector(".athyper-shell__topbar")!.children).filter((element)=>getComputedStyle(element).display!=="none").map((element)=>element.getBoundingClientRect());
    const actions=Array.from(document.querySelectorAll(".athyper-shell__actions>button")).filter((element)=>getComputedStyle(element).display!=="none").map((element)=>element.getBoundingClientRect());
    return{center:topbar.top+topbar.height/2,children:children.map(({left,right,top,height})=>({left,right,center:top+height/2})),actionWidths:actions.map(({width})=>width),viewportWidth:innerWidth,overflowWidth:document.documentElement.scrollWidth};
  });
  expect(geometry.children.every(({left,right,center})=>left>=0&&right<=geometry.viewportWidth&&Math.abs(center-geometry.center)<=1)).toBe(true);
  expect(geometry.actionWidths.every((width)=>Math.round(width)===36)).toBe(true);
  expect(geometry.overflowWidth).toBe(geometry.viewportWidth);
});
test("mobile activity center preserves the global header and owns only the remaining viewport", async ({ page }) => {
  await mount(page, 390);
  const topbar=page.locator(".athyper-shell__topbar");
  await page.getByRole("button",{name:"Notifications"}).click();
  const layer=page.locator('.a-drawer-layer[data-variant="activity"]');
  const panel=page.getByRole("dialog",{name:"Activity center"});
  await expect(topbar).toBeVisible();
  await expect(page.locator(".athyper-shell")).toHaveAttribute("data-activity-open","true");
  await expect(page.locator(".athyper-shell__breadcrumbs")).toBeHidden();
  await expect.poll(async()=>Math.round((await layer.boundingBox())?.y??-1)).toBe(56);
  await expect.poll(async()=>Math.round((await panel.boundingBox())?.height??-1)).toBe(644);
  await panel.getByRole("button",{name:"Close activity center"}).click();
  await expect(page.locator(".athyper-shell")).toHaveAttribute("data-activity-open","false");
  await expect(page.locator(".athyper-shell__breadcrumbs")).toBeVisible();
});
test("mobile drawer uses the official wordmark without a duplicate icon and restores focus", async ({ page }) => { await mount(page, 390); const trigger = page.getByRole("button", { name: "Open navigation" }); await trigger.click(); await expect(page.getByRole("link", { name: "Finance" })).toBeFocused(); await expect(page.locator(".athyper-shell__rail-brand > .athyper-shell__brand-mark-frame")).toBeHidden(); await expect(page.locator(".athyper-shell__rail-brand > .athyper-shell__brand-copy")).toBeVisible(); await page.keyboard.press("Escape"); await expect(trigger).toBeFocused(); await expect(page.locator(".athyper-shell")).toHaveAttribute("data-drawer-open", "false"); });
test("RTL mobile profile and quick-access overlays remain inside the viewport", async ({ page }) => {
  await mount(page, 430, false, "/", "", "rtl");
  const menu = page.getByRole("button", { name: "Open navigation" });
  await menu.click();
  await page.locator(".athyper-shell__profile > summary").click();
  const profile = await page.locator(".athyper-shell__profile-panel").boundingBox();
  expect(profile && Math.round(profile.x)).toBe(16);
  expect(profile && Math.round(profile.x + profile.width)).toBe(414);

  await page.locator(".athyper-shell__profile").evaluate((details) => { (details as HTMLDetailsElement).open = false; });
  await page.getByRole("button", { name: "Open recent items" }).click();
  const quickAccess = page.getByRole("dialog", { name: "Quick access" });
  await expect(quickAccess).toBeVisible();
  await expect.poll(async () => Math.round((await quickAccess.boundingBox())?.x ?? -1)).toBe(0);
  const surface = await quickAccess.boundingBox();
  expect(surface && Math.round(surface.x)).toBe(0);
  expect(surface && Math.round(surface.width)).toBe(430);
});
test("RTL shell reserves the right rail and keeps the mobile header within the viewport", async ({ page }) => {
  await mount(page, 1366, false, "/", "", "rtl");
  const desktopGeometry = await page.evaluate(() => {
    const rail = document.querySelector(".athyper-shell__rail")!.getBoundingClientRect();
    const context = document.querySelector(".athyper-shell__business-context")!.getBoundingClientRect();
    return { railLeft: rail.left, contextRight: context.right, viewportWidth: innerWidth };
  });
  expect(desktopGeometry.contextRight).toBeLessThanOrEqual(desktopGeometry.railLeft);
  expect(desktopGeometry.railLeft).toBeLessThan(desktopGeometry.viewportWidth);

  await page.setViewportSize({ width: 390, height: 700 });
  const mobileGeometry = await page.evaluate(() => {
    const topbar = document.querySelector(".athyper-shell__topbar")!.getBoundingClientRect();
    const children = Array.from(document.querySelector(".athyper-shell__topbar")!.children).filter((element) => getComputedStyle(element).display !== "none").map((element) => element.getBoundingClientRect());
    return { topbar: { left: topbar.left, right: topbar.right }, children: children.map(({ left, right }) => ({ left, right })), viewportWidth: innerWidth, overflowWidth: document.documentElement.scrollWidth };
  });
  expect(mobileGeometry.topbar.left).toBeGreaterThanOrEqual(0);
  expect(mobileGeometry.topbar.right).toBeLessThanOrEqual(mobileGeometry.viewportWidth);
  expect(mobileGeometry.children.every(({ left, right }) => left >= 0 && right <= mobileGeometry.viewportWidth)).toBe(true);
  expect(mobileGeometry.overflowWidth).toBe(mobileGeometry.viewportWidth);

  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  await expect.poll(async () => {
    const drawer = await page.locator(".athyper-shell__rail").boundingBox();
    return drawer ? Math.round(drawer.x + drawer.width) : null;
  }).toBe(390);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 320, height: 700 });
  const narrowGeometry = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    overflowWidth: document.documentElement.scrollWidth,
    visibleChildrenFit: Array.from(document.querySelector(".athyper-shell__topbar")!.children)
      .filter((element) => getComputedStyle(element).display !== "none")
      .every((element) => { const { left, right } = element.getBoundingClientRect(); return left >= 0 && right <= innerWidth; }),
  }));
  expect(narrowGeometry.overflowWidth).toBe(narrowGeometry.viewportWidth);
  expect(narrowGeometry.visibleChildrenFit).toBe(true);
});
test("collapse preference keeps a badged home link, initials, and delayed navigation context", async ({ page }) => { await mount(page, 1200); await page.getByRole("button", { name: "Collapse navigation" }).click(); await expect(page.locator(".athyper-shell")).toHaveAttribute("data-collapsed", "true"); await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible(); await expect(page.locator(".athyper-shell__rail-brand")).toHaveAccessibleName("Athyper Test home"); await expect(page.locator(".athyper-shell__rail-brand > .athyper-shell__brand-copy")).toHaveCSS("width", "1px"); await expect(page.locator(".athyper-shell__rail-brand .athyper-shell__plane-badge")).toHaveCSS("display", "grid"); await expect(page.locator(".athyper-shell__profile-summary")).toHaveCSS("width", "1px"); await expect(page.locator(".athyper-shell__profile > summary > .athyper-shell__avatar")).toHaveText("UO"); await page.locator(".athyper-shell__rail-brand").hover(); await expect(page.locator(".athyper-shell__rail-brand .athyper-shell__brand-tooltip")).toHaveCSS("opacity", "1"); await page.getByRole("link", { name: "Finance" }).hover(); await expect(page.locator(".athyper-shell__navigation-peek")).toContainText("Finance"); const favourites=page.getByRole("button",{name:"Open favourites"});await favourites.hover();await expect(page.locator(".athyper-shell__navigation-peek")).toContainText("Quick accessFavourites");const recent=page.getByRole("button",{name:"Open recent items"});await recent.focus();await expect(page.locator(".athyper-shell__navigation-peek")).toContainText("Quick accessRecent items");expect(await page.evaluate(() => localStorage.getItem("athyper.shell.collapsed"))).toBe("true"); expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("User One"); });
test("quick access tracks recent work and promotes it to persistent favourites", async ({ page }) => { await mount(page, 1280); const recentTrigger = page.getByRole("button", { name: "Open recent items" }); await recentTrigger.click(); const panel = page.getByRole("dialog", { name: "Quick access" }); await expect(panel).toBeVisible(); await expect(panel.getByPlaceholder("Search recent work")).toBeFocused(); await panel.getByRole("button", { name: /Pages/ }).click(); await expect(panel.getByRole("link", { name: /General Ledger/ })).toBeVisible(); await panel.getByRole("button", { name: "Add General Ledger to favourites" }).click(); await panel.getByRole("tab", { name: /Favourites/ }).click(); await expect(panel.getByRole("link", { name: /General Ledger/ })).toBeVisible(); await panel.getByRole("button", { name: "Close quick access" }).click(); await expect(recentTrigger).toBeFocused(); await recentTrigger.click(); await panel.getByRole("tab", { name: /Favourites/ }).click(); await expect(panel.getByRole("link", { name: /General Ledger/ })).toBeVisible(); expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("User One"); });
test("quick access becomes a full-width mobile surface and returns focus to navigation", async ({ page }) => { await mount(page, 390); const menu = page.getByRole("button", { name: "Open navigation" }); await menu.click(); await page.getByRole("button", { name: "Open recent items" }).click(); const panel = page.getByRole("dialog", { name: "Quick access" }); await expect(panel).toBeVisible(); await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0); const bounds = await panel.boundingBox(); expect(bounds?.width).toBe(390); await page.keyboard.press("Escape"); await expect(menu).toBeFocused(); await expect(page.locator(".athyper-shell")).toHaveAttribute("data-quick-access-open", "false"); });
test("empty entitlements render a stable accessible recovery state", async ({ page }) => { await mount(page, 900, true); await expect(page.getByRole("heading", { name: "No applications available" })).toBeVisible(); await expect(page.getByRole("link", { name: "Switch context" })).toHaveAttribute("href", "/select-context"); });
test("a directly requested forbidden route never renders protected page content", async ({ page }) => { await mount(page, 900, false, "/forbidden"); await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible(); await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(0); });
test("context switch posts only the selected tenant to the same-origin session route", async ({ page }) => { let body = ""; await page.route("https://shell.test/api/auth/session/context", async (route) => { body = route.request().postData() ?? ""; await route.fulfill({ status: 204 }); }); await mount(page, 900, false, "/", "?multi"); await page.locator("summary[aria-label*='Switch business context']").click(); await page.getByRole("button", { name: /Tenant Beta/ }).click(); await expect.poll(() => body).toBe('{"tenantId":"tenant-beta"}'); });
