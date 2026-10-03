import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { buildSync } from "esbuild";
import { format, resolveConfig } from "prettier";
import { expect, test, type Page } from "@playwright/test";
import { pinnedFontFace, planeStyles } from "./fixtures/app-styles";
import { activityApi } from "./fixtures/activity-data";

// Application-wide visual and accessibility baseline, one entry per page type
// (docs/architecture/application-experience/ui-system-standard.md §6).
// Real shared runtime, real Neon stylesheet graph, deterministic data, pinned
// Geist font. Every design-system change shows up here as a reviewable diff:
//   pnpm test:ui-baseline                      compare
//   pnpm test:ui-baseline --update-snapshots   accept intended visual changes
//   UI_BASELINE_UPDATE_A11Y=1 pnpm test:ui-baseline   record the accessibility baseline

function bundle(entry: string): { js: string; css: string } {
  const outputs = buildSync({
    entryPoints: [entry],
    bundle: true,
    outfile: "fixture.js",
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    nodePaths: ["apps/neon/node_modules"],
    tsconfig: resolve("tooling/config/tsconfig-react.json"),
    define: { "process.env.NODE_ENV": '"test"' },
    logLevel: "error",
  }).outputFiles;
  return {
    js: outputs.find((file) => file.path.endsWith(".js"))!.text,
    css: outputs.find((file) => file.path.endsWith(".css"))?.text ?? "",
  };
}

const bundles = {
  surfaces: bundle("tooling/scripts/verification/ui-baseline-entry.tsx"),
  shell: bundle("tooling/scripts/verification/shell-browser-entry.tsx"),
};
const styles = `${pinnedFontFace()}\n${planeStyles("neon")}`;
// Frame for the component gallery only; product surfaces bring their own layout.
const kitFrame = `.ui-baseline-kit{display:grid;gap:var(--a-density-section-gap);max-width:60rem}
.ui-baseline-kit section{display:grid;gap:var(--a-density-stack-gap)}
.ui-baseline-kit__row{display:flex;flex-wrap:wrap;align-items:center;gap:var(--a-space-2)}
.ui-baseline-kit__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:var(--a-density-stack-gap)}
.ui-baseline-kit__stack{display:grid;justify-items:start;gap:var(--a-density-stack-gap)}
.ui-baseline-kit__check{display:inline-flex;align-items:center;gap:var(--a-space-2)}
.ui-baseline-kit__panel{max-width:28rem}`;
// The shell's main region padding, which page content sits inside.
const pagePadding = "padding:clamp(var(--a-space-6),3vw,var(--a-space-10))";

type Density = "compact" | "comfortable" | "spacious";
type Theme = "light" | "dark";
interface Capture {
  readonly name: string;
  readonly width: number;
  readonly density?: Density;
  readonly theme?: Theme;
  /** Theme family; the default is Atlas Modern. */
  readonly family?: "atlas-mono";
  /** Serve an empty Inbox (empty-state checks). */
  readonly emptyInbox?: boolean;
  /** Records notification actions sent to the API ("read n3"). */
  readonly actions?: string[];
}
/** Every page type at phone, tablet and desktop; density and dark mode where they matter most. */
export const CAPTURES: readonly Capture[] = [
  { name: "phone", width: 390 },
  { name: "tablet", width: 768 },
  { name: "desktop", width: 1440 },
  { name: "desktop-compact", width: 1440, density: "compact" },
  { name: "desktop-spacious", width: 1440, density: "spacious" },
  { name: "phone-dark", width: 390, theme: "dark" },
  { name: "desktop-dark", width: 1440, theme: "dark" },
  // Atlas Mono derives brand-soft from a light grey: tints read as grey blocks in dark.
  { name: "desktop-mono-dark", width: 1440, theme: "dark", family: "atlas-mono" },
];

interface Surface {
  readonly name: string;
  readonly bundle: keyof typeof bundles;
  readonly path: string;
  readonly hostStyle?: string;
  readonly ready: (page: Page) => Promise<void>;
  readonly open?: (page: Page, capture: Capture) => Promise<void>;
}
const SURFACES: readonly Surface[] = [
  {
    name: "kit",
    bundle: "surfaces",
    path: "/?surface=kit",
    hostStyle: pagePadding,
    ready: (page) =>
      expect(
        page.getByRole("heading", { name: "Design system kit" }),
      ).toBeVisible(),
  },
  {
    name: "shell",
    bundle: "shell",
    path: "/?desktopBrand",
    ready: (page) =>
      expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible(),
  },
  {
    name: "home",
    bundle: "surfaces",
    path: "/?surface=home",
    hostStyle: pagePadding,
    ready: (page) => expect(page.getByRole("button", { name: "Send message" })).toBeVisible(),
  },
  {
    name: "list",
    bundle: "surfaces",
    path: "/?surface=list",
    hostStyle: pagePadding,
    ready: (page) =>
      expect(
        page.getByText("Afghanistan", { exact: true }).first(),
      ).toBeVisible(),
  },
  {
    name: "list-controls",
    bundle: "surfaces",
    path: "/?surface=list",
    hostStyle: pagePadding,
    ready: (page) =>
      expect(
        page.getByText("Afghanistan", { exact: true }).first(),
      ).toBeVisible(),
    open: async (page) => {
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      await expect(
        page.getByRole("dialog", { name: "Countries list controls" }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("dialog", { name: "Countries list controls" })
          .getByRole("heading", { name: "Filters" }),
      ).toBeVisible();
    },
  },
  {
    name: "record",
    bundle: "surfaces",
    path: "/?surface=record",
    hostStyle: pagePadding,
    ready: (page) =>
      expect(
        page.getByRole("heading", {
          level: 1,
          name: "Northwind Industrial Supplies Ltd",
        }),
      ).toBeVisible(),
  },
  {
    name: "atlas",
    bundle: "surfaces",
    path: "/?surface=atlas",
    ready: (page) =>
      expect(page.locator(".athyper-atlas-workspace__header")).toBeVisible(),
  },
  {
    // Atlas full view: History and Context side panels around a readable conversation.
    name: "atlas-full",
    bundle: "surfaces",
    path: "/?surface=atlas&full",
    ready: (page) =>
      expect(page.locator(".athyper-atlas-workspace--fullscreen")).toBeVisible(),
  },
  {
    name: "activity-panel",
    bundle: "surfaces",
    path: "/record?surface=activity-panel",
    ready: (page) =>
      expect(page.getByText("Alex Tan mentioned you").first()).toBeVisible(),
  },
  {
    name: "activity-page",
    bundle: "surfaces",
    path: "/notifications?surface=activity-page",
    hostStyle: pagePadding,
    ready: (page) =>
      expect(page.getByText("Alex Tan mentioned you").first()).toBeVisible(),
  },
  {
    name: "activity-inbox",
    bundle: "surfaces",
    path: "/inbox?surface=activity-inbox",
    hostStyle: pagePadding,
    ready: (page) =>
      expect(page.getByText("Approve supplier onboarding").first()).toBeVisible(),
  },
  {
    // Workspace home: the entity-list page frame with module cards.
    name: "workspace",
    bundle: "surfaces",
    path: "/mdg?surface=workspace",
    hostStyle: pagePadding,
    ready: (page) => expect(page.getByRole("link", { name: "Countries" }).first()).toBeVisible(),
  },
  {
    name: "workspace-module",
    bundle: "surfaces",
    path: "/mdg/organization-reference?surface=workspace-module",
    hostStyle: pagePadding,
    ready: (page) => expect(page.getByRole("heading", { name: "Countries" })).toBeVisible(),
  },
  {
    // Notification preferences in the shared side panel, opened from Notifications.
    name: "notification-preferences",
    bundle: "surfaces",
    path: "/notifications?surface=notification-preferences",
    hostStyle: pagePadding,
    ready: (page) =>
      expect(page.getByText("Alex Tan mentioned you").first()).toBeVisible(),
    open: async (page) => {
      await page.getByRole("button", { name: "Notification preferences" }).click();
      await expect(page.getByLabel("In-app", { exact: true })).toBeVisible();
      await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
    },
  },
  {
    // The same shared controls panel as list-controls, opened from Notifications.
    name: "activity-controls",
    bundle: "surfaces",
    path: "/notifications?surface=activity-page",
    hostStyle: pagePadding,
    ready: (page) =>
      expect(page.getByText("Alex Tan mentioned you").first()).toBeVisible(),
    open: async (page) => {
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      const panel = page.getByRole("dialog", { name: "Notifications list controls" });
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("heading", { name: "Filters" })).toBeVisible();
      // The panel slides in; capture only once every animation has settled.
      await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
    },
  },
];

const A11Y_BASELINE = "tests/foundation-browser/ui-baseline.a11y.json";
const updateA11y = process.env.UI_BASELINE_UPDATE_A11Y === "1";
function readA11yBaseline(): Record<string, readonly string[]> {
  return existsSync(A11Y_BASELINE)
    ? JSON.parse(readFileSync(A11Y_BASELINE, "utf8"))
    : {};
}

async function mount(page: Page, surface: Surface, capture: Capture) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-09-30T09:30:00Z"));
  await page.setViewportSize({ width: capture.width, height: 900 });
  const code = bundles[surface.bundle];
  const api = activityApi({ emptyInbox: capture.emptyInbox, actions: capture.actions });
  await page.route("https://ui.test/**", async (route) => {
    if (await api(route)) return;
    if (route.request().resourceType() !== "document") {
      // Static brand assets come from the plane's public folder, as in production.
      const asset = resolve(
        "apps/neon/public",
        `.${new URL(route.request().url()).pathname}`,
      );
      return existsSync(asset) && asset.startsWith(resolve("apps/neon/public"))
        ? route.fulfill({ path: asset })
        : route.abort();
    }
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html lang="en" dir="ltr" data-theme="${capture.theme ?? "light"}"${capture.family ? ` data-theme-family="${capture.family}"` : ""} data-density="${capture.density ?? "comfortable"}"><head><meta charset="utf-8"><title>UI baseline</title><style>${code.css}\n${styles}\n${kitFrame}\nbody{margin:0}*{box-sizing:border-box}</style></head><body><div id="root" style="${surface.hostStyle ?? ""}"></div></body></html>`,
    });
  });
  await page.goto(`https://ui.test${surface.path}`);
  await page.evaluate(code.js);
  await surface.ready(page);
  await surface.open?.(page, capture);
  await page.evaluate(() => document.fonts.ready);
  expect(errors).toEqual([]);
}

test.use({ locale: "en-GB", timezoneId: "UTC" });

for (const surface of SURFACES) {
  test.describe(`${surface.name} page type`, () => {
    for (const capture of CAPTURES) {
      test(`${capture.name} matches its baseline and adds no accessibility violations`, async ({
        page,
      }) => {
        await mount(page, surface, capture);
        const key = `${surface.name}/${capture.name}`;
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        const serious = violations.filter(
          (item) => item.impact === "critical" || item.impact === "serious",
        );
        const found = [...new Set(serious.map((item) => item.id))].sort();
        if (updateA11y) {
          // Only known debt is recorded; a clean capture has no entry.
          const baseline: Record<string, readonly string[]> = {
            ...readA11yBaseline(),
          };
          if (found.length) baseline[key] = found;
          else delete baseline[key];
          const sorted = Object.fromEntries(
            Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)),
          );
          // Written in repository format so an update never churns formatting.
          writeFileSync(
            A11Y_BASELINE,
            await format(JSON.stringify(sorted, null, 2), {
              ...(await resolveConfig(A11Y_BASELINE)),
              filepath: A11Y_BASELINE,
            }),
          );
        } else {
          const known = readA11yBaseline()[key] ?? [];
          const added = serious
            .filter((item) => !known.includes(item.id))
            .map(
              (item) =>
                `${item.id}: ${item.nodes.map((node) => node.target.join(" ")).join(", ")}`,
            );
          expect(
            added,
            `new serious or critical accessibility violations on ${key}`,
          ).toEqual([]);
        }
        // Renders are deterministic (pinned font, fixed data and clock), so the
        // tolerance is absolute: one recoloured label must show up as a diff.
        await expect(page).toHaveScreenshot(
          `${surface.name}-${capture.name}.png`,
          {
            maxDiffPixels: 20,
            maxDiffPixelRatio: 1,
          },
        );
      });
    }
  });
}

test.describe("activity feed behaviour", () => {
  test("identical notifications collapse, dates read as words, and unread is announced", async ({ page }) => {
    const surface = SURFACES.find((item) => item.name === "activity-page")!;
    await mount(page, surface, { name: "behaviour", width: 1440 });
    const unavailable = page.locator(".athyper-activity-row", { hasText: "Record update unavailable" }).filter({ visible: true });
    await expect(unavailable).toHaveCount(1);
    const toggle = page.getByRole("button", { name: "Show 2 similar" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(page.getByRole("button", { name: "Hide similar" })).toHaveAttribute("aria-expanded", "true");
    await expect(unavailable).toHaveCount(3);
    // Server calendar dates become words; no ISO date reaches the heading.
    await expect(page.locator(".athyper-activity-center__group > header strong")).toHaveText(["Today", "Yesterday", "This week"]);
    // Unread is a dot visually and words for assistive technology.
    await expect(page.locator(".athyper-activity-row", { hasText: "Alex Tan mentioned you" })).toHaveAttribute("data-unread", "true");
    await expect(page.getByText(", Unread").first()).toBeAttached();
    await expect(page.getByText("Record no longer available").first()).toBeVisible();
  });
});

test.describe("activity filters and settings", () => {
  test("view filters are not applied chips; settings stay out of the list toolbar", async ({ page }) => {
    // The Inbox system view limits statuses to open work: that is the view, not a filter the person applied.
    await mount(page, SURFACES.find((item) => item.name === "activity-inbox")!, { name: "filters", width: 1440 });
    await expect(page.getByText("Applied filters")).toHaveCount(0);
    await expect(page.getByText(/in_progress|open,claimed/)).toHaveCount(0);
    // Browser alerts are a device setting in Notification preferences, not a list action.
    await mount(page, SURFACES.find((item) => item.name === "activity-panel")!, { name: "settings", width: 1440 });
    await expect(page.getByText(/Browser alerts/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark all read" })).toBeVisible();
  });
});

test.describe("child list inside a record section", () => {
  test("one card: title, count and action on row 1, a compact toolbar on row 2, table to the edges", async ({ page }) => {
    await mount(page, { name: "section-list", bundle: "surfaces", path: "/?surface=section-list", hostStyle: pagePadding, ready: (p) => expect(p.getByRole("link", { name: "Afghanistan" })).toBeVisible() }, { name: "section-list", width: 1440 });
    const card = page.locator(".a-record-detail-content");
    const panel = card.locator(".a-entity-list__panel");
    // No box inside the box.
    expect(await panel.evaluate((node) => getComputedStyle(node).borderTopStyle)).toBe("none");
    // Row 1: heading, count, action share one line; the action sits at the end edge.
    const box = async (locator: import("@playwright/test").Locator) => (await locator.boundingBox())!;
    const heading = await box(card.getByRole("heading", { level: 2, name: "Countries" }));
    const count = card.locator(".a-related-section__count");
    await expect(count).toHaveText("12");
    const add = await box(card.getByRole("button", { name: "Add country" }));
    const centre = (b: { y: number; height: number }) => b.y + b.height / 2;
    expect(Math.abs(centre(await box(count)) - centre(heading))).toBeLessThanOrEqual(3);
    expect(Math.abs(centre(add) - centre(heading))).toBeLessThanOrEqual(3);
    // Row 2 below row 1; the table meets the card's edges.
    const toolbar = await box(panel.locator(".a-entity-list__query-row"));
    expect(toolbar.y).toBeGreaterThan(heading.y + heading.height);
    const cardBox = await box(card), table = await box(panel.locator(".a-entity-list__table-wrap"));
    expect(Math.abs(table.x - cardBox.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(table.x + table.width - (cardBox.x + cardBox.width))).toBeLessThanOrEqual(2);
    // One page: the summary stays, rows-per-page and Previous / Next do not.
    await expect(panel.locator(".a-entity-list__pagination")).toContainText("1–12");
    await expect(panel.locator(".a-entity-list__page-controls")).toHaveCount(0);
    await expect(panel.locator(".a-entity-list__view-trigger")).toBeVisible();
  });

  test("a child list has the full-page list's toolbar and table type in every density", async ({ page }) => {
    const read = () => page.evaluate(() => {
      const panel = document.querySelector(".a-entity-list__panel")!;
      const controls = [...panel.querySelectorAll<HTMLElement>(".a-entity-list__query-row :is(button,input)")]
        .filter((node) => node.getClientRects().length && !node.closest("[role=menu]"))
        .map((node) => `${(node.getAttribute("aria-label") ?? node.textContent ?? node.getAttribute("placeholder") ?? "").trim().replace(/\s+/g, " ")}@${Math.round(node.getBoundingClientRect().height)}`);
      const font = (selector: string) => { const node = panel.querySelector(selector)!; const css = getComputedStyle(node); return `${css.fontSize}/${css.fontWeight}`; };
      return { controls, cell: font("tbody td:nth-child(3)"), header: font("thead th:nth-child(3)") };
    });
    for (const density of ["compact", "comfortable", "spacious"] as const) {
      await mount(page, SURFACES.find((item) => item.name === "list")!, { name: `toolbar-page-${density}`, width: 1440, density });
      const full = await read();
      await mount(page, { name: "section-list", bundle: "surfaces", path: "/?surface=section-list", hostStyle: pagePadding, ready: (p) => expect(p.getByRole("link", { name: "Afghanistan" })).toBeVisible() }, { name: `toolbar-section-${density}`, width: 1440, density });
      const section = await read();
      // Same functions, same order, same heights; same table text.
      expect(section).toEqual(full);
      expect(section.controls.some((control) => control.startsWith("Select view"))).toBe(true);
      expect(section.controls.some((control) => control.startsWith("Filters"))).toBe(true);
    }
  });
});

test.describe("density type roles", () => {
  test("values, labels and sections scale together with density; chrome does not", async ({ page }) => {
    const font = (selector: string) => page.locator(selector).first().evaluate((node) => { const css = getComputedStyle(node); return `${css.fontSize}/${css.lineHeight}/${css.fontWeight}`; });
    const results: Record<string, Record<string, string>> = {};
    for (const density of ["compact", "comfortable", "spacious"] as const) {
      await mount(page, SURFACES.find((item) => item.name === "list")!, { name: `type-list-${density}`, width: 1440, density });
      const cell = await font(".a-entity-list__table tbody td"), column = await font(".a-entity-list__table thead th");
      await mount(page, SURFACES.find((item) => item.name === "record")!, { name: `type-record-${density}`, width: 1440, density });
      const input = await font(".a-data-surface__field input[type=text], .a-data-surface__field input:not([type])"), label = await font(".a-data-surface__field > label");
      // Every text control in the form shares that size (inputs, textareas, selects).
      expect(new Set(await page.locator(".a-data-surface__field :is(input:not([type=checkbox],[type=radio]), textarea)").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fontSize))).size).toBe(1);
      await mount(page, SURFACES.find((item) => item.name === "workspace")!, { name: `type-chrome-${density}`, width: 1440, density });
      const title = await font("h1"), tab = await font(".athyper-experience__module-tabs--primary > a[aria-current=page]");
      // A value reads the same in a list cell and an edit control; a label the same as a column header.
      // Same size; a cell's height is the density row rhythm, so only the size is shared.
      expect(input.split("/")[0]).toEqual(cell.split("/")[0]);
      const [labelSize, , labelWeight] = label.split("/"), [columnSize, , columnWeight] = column.split("/");
      expect([labelSize, labelWeight]).toEqual([columnSize, columnWeight]);
      results[density] = { cell, label, title, tab };
    }
    const size = (value: string) => parseFloat(value);
    expect(size(results.compact!.cell!)).toBeLessThan(size(results.comfortable!.cell!));
    expect(size(results.comfortable!.cell!)).toBeLessThan(size(results.spacious!.cell!));
    expect(size(results.compact!.label!)).toBeLessThan(size(results.spacious!.label!));
    // Chrome is fixed: page title and navigation bar type never change with density.
    expect(new Set(Object.values(results).map((item) => item.title)).size).toBe(1);
    expect(new Set(Object.values(results).map((item) => item.tab)).size).toBe(1);
  });
});

test.describe("workspace and module homes", () => {
  test("workspace home: page frame, module cards with authorized entities, recent records and actions", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "workspace")!, { name: "workspace", width: 1440 });
    await expect(page.getByRole("heading", { level: 1, name: "Master Data Governance" })).toBeVisible();
    await expect(page.locator(".athyper-workspace-landing__counts")).toHaveText("6 modules · 9 entities");
    const org = page.getByRole("article", { name: "Organization & Reference Data" });
    await expect(org.locator(".athyper-module-card__entities li")).toHaveCount(4);
    await expect(org.getByRole("link", { name: /Countries/ })).toHaveAttribute("href", "/app/entity/country");
    await expect(org.getByRole("link", { name: "1 more entity" })).toHaveAttribute("href", "/mdg/organization-reference");
    await expect(org.getByRole("link", { name: "Afghanistan" })).toBeVisible();
    await expect(org.getByRole("link", { name: /New Country/ })).toHaveAttribute("href", "/app/entity/country/new");
    // Only entities the server authorizes appear: Address Uses is placed here but not listable.
    const location = page.getByRole("article", { name: "Location & Address Governance" });
    await expect(location.getByText("Address Uses")).toHaveCount(0);
    await expect(location.locator(".athyper-module-card__entities li")).toHaveCount(2);
    // Modules without authorized entities say so plainly; no placeholder links.
    await expect(page.getByRole("article", { name: "Data Quality & Stewardship" }).getByText("No entities are available to you in this module yet.")).toBeVisible();
    await expect(page.getByRole("link", { name: "ToDo" })).toHaveCount(0);
    await expect(page.getByRole("article", { name: "Business Partners" }).getByRole("link", { name: "3 to do" })).toHaveAttribute("href", "/inbox?workspace=mdg&module=business-partner");
    const pin = page.getByRole("button", { name: "Pin Business Partners first" });
    await pin.click();
    await expect(page.getByRole("button", { name: "Unpin Business Partners" })).toHaveAttribute("aria-pressed", "true");
  });

  test("module home: one card per authorized entity; the card opens the list, create stays", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "workspace-module")!, { name: "module", width: 1440 });
    await expect(page.getByRole("heading", { level: 1, name: "Organization & Reference Data" })).toBeVisible();
    await expect(page.locator(".athyper-module-card--entity")).toHaveCount(5);
    const countries = page.getByRole("article", { name: "Countries" });
    await expect(countries.getByRole("link", { name: "Countries", exact: true })).toHaveAttribute("href", "/app/entity/country");
    await expect(countries.getByRole("link", { name: "Afghanistan" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^(Open list|Open module)$/ })).toHaveCount(0);
    // Exact authorized counts only; an entity the server did not count shows none (never "0").
    await expect(countries.locator(".athyper-module-card__count")).toHaveText("247 records");
    await expect(page.getByRole("article", { name: "Currencies" }).locator(".athyper-module-card__count")).toHaveText("1 record");
    await expect(page.getByRole("article", { name: "Languages" }).locator(".athyper-module-card__count")).toHaveCount(0);
    await expect(page.locator("nav[aria-label='Master Data Governance modules'] > a[aria-current=page]")).toContainText("Organization & Reference Data");
  });

  test("workspace, module and activity navigation bars share the record bar's type and height", async ({ page }) => {
    const read = (selector: string) => page.evaluate((target) => {
      const element = document.querySelector(target)!; const style = getComputedStyle(element);
      return { size: style.fontSize, weight: style.fontWeight, height: Math.round(element.getBoundingClientRect().height) };
    }, selector);
    const results: Record<string, unknown>[] = [];
    for (const density of ["compact", "comfortable", "spacious"] as const) {
      await mount(page, SURFACES.find((item) => item.name === "workspace")!, { name: `nav-${density}`, width: 1440, density });
      const workspace = await read(".athyper-experience__module-tabs--primary > a[aria-current=page]");
      const other = await read(".athyper-experience__module-tabs--primary > a:not([aria-current])");
      await mount(page, SURFACES.find((item) => item.name === "activity-page")!, { name: `nav-act-${density}`, width: 1440, density });
      const activity = await read(".a-management-navigation[data-appearance=flat] > a[aria-current=page]");
      expect(workspace).toEqual(other);
      expect(activity).toEqual(workspace);
      results.push(workspace);
    }
    // Body-size labels at regular weight; height follows density.
    expect(results[1]).toMatchObject({ size: "15px", weight: "500" });
    expect((results[0] as { height: number }).height).toBeLessThan((results[2] as { height: number }).height);
  });

  test("cards are one link: anywhere on a card opens it; rows, chips, pins and create work on their own", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "workspace")!, { name: "card-link", width: 1440 });
    const card = page.getByRole("article", { name: "Data Quality & Stewardship" });
    // Empty modules are compact: no footer, no dashed box.
    await expect(card).toHaveAttribute("data-empty", "true");
    await expect(card.locator("footer")).toBeHidden();
    const org = page.getByRole("article", { name: "Organization & Reference Data" });
    // The title is the only card link; its focus outlines the whole card.
    await org.getByRole("link", { name: "Organization & Reference Data" }).focus();
    expect(await org.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
    // Inner controls sit above the card link.
    const hit = async (locator: import("@playwright/test").Locator) => { const box = (await locator.boundingBox())!; return page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("a,button")?.textContent?.trim(), [box.x + box.width / 2, box.y + box.height / 2]); };
    expect(await hit(org.getByRole("link", { name: /Countries/ }))).toContain("Countries");
    expect(await hit(org.getByRole("link", { name: "Afghanistan" }))).toBe("Afghanistan");
    expect(await hit(org.getByRole("link", { name: /New Country/ }))).toContain("New Country");
    // Empty card space resolves to the card's own link.
    const description = org.locator(".athyper-module-card__identity p");
    expect(await hit(description)).toBe("Organization & Reference Data");
  });

  test("labels give up only the width the row lacks, longest first, before any module folds", async ({ page }) => {
    const bar = page.locator("nav.athyper-experience__module-tabs--primary");
    const truncated = (name: string) => bar.getByRole("link", { name }).locator("span").evaluate((node) => node.scrollWidth > node.clientWidth + 1);
    const slack = () => bar.evaluate((node) => { const last = [...node.children].filter((child) => child.getClientRects().length).at(-1)!; return Math.round(node.getBoundingClientRect().right - last.getBoundingClientRect().right); });
    // Wide enough for every full name: nothing is cut.
    await mount(page, SURFACES.find((item) => item.name === "workspace")!, { name: "tabs-wide", width: 1920 });
    await expect(bar.locator(".athyper-experience__module-more")).toHaveCount(0);
    expect(await truncated("Organization & Reference Data")).toBe(false);
    // Slightly short: every module stays, short labels stay whole, long ones are cut just enough.
    await mount(page, SURFACES.find((item) => item.name === "workspace")!, { name: "tabs-fit", width: 1440 });
    await expect(bar.locator(".athyper-experience__module-more")).toHaveCount(0);
    await expect(bar.locator("> a")).toHaveCount(7);
    expect(await truncated("Business Partners")).toBe(false);
    expect(await truncated("Organization & Reference Data")).toBe(true);
    await expect(bar.getByRole("link", { name: "Organization & Reference Data" })).toHaveAttribute("title", "Organization & Reference Data");
    expect(await slack()).toBeLessThan(24);
    // Too narrow even at the floor: modules fold into More.
    await mount(page, SURFACES.find((item) => item.name === "workspace")!, { name: "tabs-fold", width: 768 });
    await expect(bar.locator(".athyper-experience__module-more")).toHaveCount(1);
  });

  for (const width of [360, 390]) test(`phones switch modules from one sheet and nothing clips at ${width}px`, async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "workspace-module")!, { name: `phone-switch-${width}`, width });
    const bar = page.locator("nav.athyper-experience__module-tabs--primary");
    // No tabs and no More: one switcher naming the current module.
    await expect(bar.locator("> a").first()).toBeHidden();
    await expect(bar.locator(".athyper-experience__module-more")).toBeHidden();
    const switcher = bar.locator(".athyper-experience__module-switcher > summary");
    await expect(switcher).toHaveAccessibleName("Switch module, current: Organization & Reference Data");
    await switcher.click();
    const sheet = bar.locator(".athyper-experience__module-switcher > section");
    await expect(sheet.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(sheet.locator("li > a[aria-current=page]")).toContainText("Organization & Reference Data");
    // Home plus every module, each a 44px row, in a bottom sheet inside the viewport.
    expect(await sheet.locator("ul[aria-label='All modules'] li").count()).toBe(6);
    const box = (await sheet.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(Math.round(900 - (box.y + box.height))).toBeLessThanOrEqual(16);
    for (const row of await sheet.locator("li > a").all()) expect(Math.round((await row.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
    // Entities are compact rows: the whole row opens the list.
    await page.keyboard.press("Escape");
    const countries = page.getByRole("article", { name: "Countries" });
    await expect(countries.getByRole("link", { name: "Open list" })).toHaveCount(0);
    // Recent records and the create action stay reachable on the row.
    await expect(countries.getByRole("link", { name: "Afghanistan" })).toBeVisible();
    await expect(countries.getByRole("link", { name: /New Country/ })).toBeVisible();
    // A plain entity is a single compact row.
    expect(Math.round((await page.getByRole("article", { name: "Languages" }).boundingBox())!.height)).toBeLessThan(72);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("on phones an icon-led header action becomes an icon button in the title row", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "activity-page")!, { name: "phone-header-action", width: 390 });
    const action = page.getByRole("button", { name: "Notification preferences" });
    const box = (await action.boundingBox())!, title = (await page.locator(".athyper-page-header__heading").boundingBox())!;
    expect(Math.round(box.width)).toBe(44);
    expect(box.y).toBeLessThan(title.y + title.height);
    expect(box.x).toBeGreaterThan(title.x);
  });

  test("a short More is a plain list; search, count and Recent appear only in a long one", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "workspace")!, { name: "more-short", width: 768 });
    const more = page.locator(".athyper-experience__module-more");
    const count = Number(await more.locator("summary > b").textContent());
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(6);
    await more.locator("summary").click();
    await expect(more.getByRole("searchbox")).toHaveCount(0);
    await expect(more.locator("section > p, section > h3")).toHaveCount(0);
    await expect(more.locator("section li")).toHaveCount(count);
    // Opening a short More focuses its first module instead of a missing search field.
    await expect(more.locator("section li > a").first()).toBeFocused();
  });

  test("Notifications | Inbox tabs carry their icons at the bar's size", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "activity-page")!, { name: "activity-icons", width: 1440 });
    for (const name of ["Notifications", "Inbox"]) {
      const icon = page.locator("nav.a-management-navigation[data-appearance=flat] > a", { hasText: name }).locator("svg").first();
      await expect(icon).toBeVisible();
      expect(Math.round((await icon.boundingBox())!.width)).toBe(18);
    }
  });

  test("workspace home reads in Arabic", async ({ page }) => {
    await mount(page, { ...SURFACES.find((item) => item.name === "workspace")!, path: "/mdg?surface=workspace&locale=ar" }, { name: "workspace-ar", width: 1440 });
    await expect(page.getByRole("heading", { level: 2, name: "وحداتك" })).toBeVisible();
    await expect(page.getByRole("article").first().getByRole("heading", { level: 3 }).getByRole("link")).toBeVisible();
  });
});

test.describe("notification preferences", () => {
  test("shared panel anatomy: tabs, one row per channel with a plain status, footer pinned, Save only after a change", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "notification-preferences")!, { name: "preferences", width: 1440 });
    const panel = page.getByRole("dialog", { name: "Notification preferences" });
    // No repeated title or collapsible boxes; tabs like the other side panels.
    await expect(panel.locator("details, summary")).toHaveCount(0);
    await expect(panel.getByRole("tab", { name: "Preferences" })).toHaveAttribute("aria-selected", "true");
    // Channel names stay the accessible name; the status describes them.
    const email = panel.getByRole("checkbox", { name: "Email", exact: true });
    await expect(email).toBeChecked();
    await expect(email).toHaveAccessibleDescription("Saved, but not delivered");
    await expect(panel.getByRole("checkbox", { name: "Browser / device push", exact: true })).toHaveAccessibleDescription("Needs browser alerts on this device");
    const sms = panel.getByRole("checkbox", { name: "SMS", exact: true });
    await expect(sms).toBeDisabled();
    await expect(sms).toHaveAccessibleDescription("Not set up for your organisation");
    // Save and Discard sit in the footer pinned to the bottom, enabled only after a change.
    const save = panel.getByRole("button", { name: "Save preferences" });
    const discard = panel.getByRole("button", { name: "Discard changes" });
    await expect(save).toBeDisabled();
    await expect(discard).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Reload" })).toHaveCount(0);
    const footer = (await panel.locator(".a-panel-footer").boundingBox())!;
    const box = (await panel.boundingBox())!;
    expect(Math.abs(footer.y + footer.height - (box.y + box.height))).toBeLessThanOrEqual(1);
    await email.uncheck();
    await expect(save).toBeEnabled();
    await expect(panel.getByText("Unsaved changes")).toBeVisible();
    await discard.click();
    await expect(email).toBeChecked();
    await expect(save).toBeDisabled();
    // Delivery status reads as activity rows with a status pill.
    await panel.getByRole("tab", { name: "Delivery status" }).click();
    await expect(panel.locator(".athyper-notification-controls__pill")).toHaveText(["Failed", "Delivered"]);
    await expect(panel.getByRole("button", { name: "Retry delivery" })).toHaveCount(1);
    await expect(panel.getByText("email · failed")).toHaveCount(0);
  });
});

test.describe("activity controls", () => {
  test("Notifications open the same controls panel and filter editor as entity lists", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "activity-page")!, { name: "controls", width: 1440 });
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Notifications list controls" });
    await expect(panel.getByRole("tab", { name: "Quick filters" })).toHaveAttribute("aria-selected", "true");
    await expect(panel.getByRole("button", { name: "Pin panel to the side" })).toBeVisible();
    await expect(panel.getByText("Read status", { exact: true })).toBeVisible();
    // No bespoke native selects: field choice is the shared ChoiceSelect.
    await panel.getByRole("tab", { name: "All filters" }).click();
    await expect(panel.locator("select")).toHaveCount(0);
    await expect(panel.getByText("No filters configured")).toBeVisible();
    await panel.getByRole("button", { name: "Add filter" }).click();
    await page.getByRole("menuitem", { name: "Read status" }).click();
    await expect(panel.getByRole("combobox", { name: "Field for filter 1" })).toBeVisible();
    await expect(panel.getByRole("tab", { name: "All filters · 1" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });
});

test.describe("activity reading pane", () => {
  test("at 80rem and wider the selected item reads in full beside the list; narrower stays one column", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "activity-page")!, { name: "reading", width: 1440 });
    const pane = page.locator("#athyper-activity-detail-notifications");
    // The first row is shown until another is picked.
    await expect(pane.getByRole("heading", { level: 2 })).toHaveText("Alex Tan mentioned you");
    await expect(page.getByRole("button", { name: "Alex Tan mentioned you" })).toHaveAttribute("aria-current", "true");
    await expect(pane.getByRole("link", { name: "View comment" })).toHaveAttribute("href", "/records/bp-1?panel=collaboration#comment-1");
    // Title click, then arrow keys move the selection.
    await page.getByRole("button", { name: "Approval requested" }).click();
    await expect(pane.getByRole("heading", { level: 2 })).toHaveText("Approval requested");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("button", { name: "Northwind Industrial was updated" })).toBeFocused();
    await expect(pane.getByRole("heading", { level: 2 })).toHaveText("Northwind Industrial was updated");
    // A click on the row body selects too; collapsed copies are listed in the pane.
    await page.locator(".athyper-activity-row", { hasText: "Record update unavailable" }).first().locator("p").click();
    await expect(pane.getByRole("heading", { level: 2 })).toHaveText("Record update unavailable");
    await expect(pane.getByRole("heading", { name: "Received 2 more times" })).toBeVisible();
    // Below 80rem: rows only, no selection controls.
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(pane).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Alex Tan mentioned you" })).toHaveCount(0);
  });
});

test.describe("activity empty state", () => {
  test("an empty Inbox sits flat on the list panel, without a second box", async ({ page }) => {
    const inbox = SURFACES.find((item) => item.name === "activity-inbox")!;
    await mount(
      page,
      { ...inbox, ready: (p) => expect(p.getByRole("heading", { name: "Your inbox is empty" })).toBeVisible() },
      { name: "empty", width: 1440, emptyInbox: true },
    );
    const empty = page.locator(".athyper-activity-page__content .a-panel-empty-state");
    await expect(empty.getByRole("heading", { name: "Your inbox is empty" })).toBeVisible();
    await expect(empty).toHaveCSS("border-top-width", "0px");
    await expect(empty).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.locator("#athyper-activity-detail-inbox")).toHaveCount(0);
  });
});

test.describe("activity panel parity", () => {
  test("the activity centre uses the page's toolbar, controls sections, group bands and count", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "activity-panel")!, { name: "parity", width: 1440 });
    const panel = page.locator("#athyper-activity-center");
    // Count lives in the context row, like the collection controls panel.
    await expect(panel.getByText("6 notifications", { exact: true })).toBeVisible();
    await expect(panel.getByText(/matching notifications/)).toHaveCount(0);
    // Narrow toolbar: search, then icon-only Filters and Controls; views move under Controls.
    const controls = panel.getByRole("button", { name: "Controls", exact: true });
    await expect(panel.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Select view" })).toBeHidden();
    await controls.click();
    await expect(controls).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getByRole("tab", { name: "Sort" })).toHaveAttribute("aria-selected", "true");
    for (const name of ["Filters", "Group", "Display", "Views"]) await expect(panel.getByRole("tab", { name })).toBeVisible();
    // Open controls take the panel body: the feed steps aside and Apply stays in view.
    await expect(panel.locator(".athyper-activity-center__content")).toBeHidden();
    await expect(panel.getByRole("button", { name: "Apply sort" })).toBeInViewport();
    await panel.getByRole("tab", { name: "Filters" }).click();
    await expect(panel.getByText("Read status", { exact: true })).toBeVisible();
    await expect(panel.locator("select")).toHaveCount(0);
    await panel.getByRole("tab", { name: "Quick filters" }).press("Escape");
    await expect(panel.getByRole("tab", { name: "Sort" })).toHaveCount(0);
    await expect(panel.locator(".athyper-activity-center__content")).toBeVisible();
    // No Notifications | Inbox tabs: the app bar switches sections, the header names it.
    await expect(panel.getByRole("tab", { name: /^(Notifications|Inbox)/ })).toHaveCount(0);
    // Group headings are the list's bands, as on the full page.
    await expect(panel.locator(".athyper-activity-feed .athyper-activity-center__group > header strong")).toHaveText(["Today", "Yesterday", "This week"]);
  });
});

test.describe("activity group actions", () => {
  test("a row with collapsed copies marks and dismisses every copy", async ({ page }) => {
    const actions: string[] = [];
    await mount(page, SURFACES.find((item) => item.name === "activity-page")!, { name: "group", width: 1440, actions });
    await page.getByRole("button", { name: "Record update unavailable" }).click();
    const pane = page.locator("#athyper-activity-detail-notifications");
    await pane.getByRole("button", { name: "Mark all 3 as read" }).click();
    await expect.poll(() => [...actions].sort()).toEqual(["read n3", "read n4", "read n5"]);
    actions.length = 0;
    await page.locator('summary[aria-label="Actions for Record update unavailable"]').first().click();
    await page.getByRole("button", { name: "Dismiss all 3" }).first().click();
    await expect.poll(() => [...actions].sort()).toEqual(["dismiss n3", "dismiss n4", "dismiss n5"]);
  });
});

test.describe("activity in Arabic", () => {
  test("the page and the centre read right to left with Arabic text", async ({ page }) => {
    const pageSurface = SURFACES.find((item) => item.name === "activity-page")!;
    await mount(
      page,
      { ...pageSurface, path: `${pageSurface.path}&locale=ar`, ready: (p) => expect(p.getByRole("heading", { level: 1, name: "الإشعارات" })).toBeVisible() },
      { name: "arabic", width: 1440 },
    );
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("button", { name: "تفضيلات الإشعارات" })).toBeVisible();
    await expect(page.getByRole("button", { name: "عوامل التصفية", exact: true })).toBeVisible();
    await expect(page.locator(".athyper-activity-center__group > header strong").first()).toHaveText("اليوم");
    // The selection bar sits on the leading (right) edge.
    await expect(page.locator(".athyper-activity-row[data-selected=true]").first()).toHaveCSS("box-shadow", /-3px 0px 0px 0px inset/);
    // English record text keeps its own direction (punctuation stays put) but aligns with the interface.
    await expect(page.locator(".athyper-activity-detail h2")).toHaveAttribute("dir", "auto");
    await expect(page.locator(".athyper-activity-detail h2")).toHaveCSS("text-align", "right");
    await page.screenshot({ path: test.info().outputPath("activity-page-ar.png") });
    const panelSurface = SURFACES.find((item) => item.name === "activity-panel")!;
    await mount(
      page,
      { ...panelSurface, path: `${panelSurface.path}&locale=ar`, ready: (p) => expect(p.getByText("عرض كل الإشعارات")).toBeVisible() },
      { name: "arabic-panel", width: 1440 },
    );
    await expect(page.getByRole("button", { name: "تعليم الكل كمقروء" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("activity-panel-ar.png") });
  });
});

test.describe("activity control sections", () => {
  test("Sort, Group by, Display and Views use the entity list's sections", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "activity-controls")!, { name: "sections", width: 1440 });
    const panel = page.getByRole("dialog", { name: "Notifications list controls" });
    await panel.getByRole("tab", { name: "Sort", exact: true }).click();
    await expect(panel.getByRole("button", { name: /Add sort level · 1 of/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Actions for sort 1" })).toBeVisible();
    await panel.getByText("Oldest first").click();
    await expect(panel.getByRole("button", { name: "Apply sort" })).toBeEnabled();
    await panel.getByRole("button", { name: "Reset sort" }).click();
    await panel.getByRole("tab", { name: "Group", exact: true }).click();
    await expect(panel.getByRole("combobox", { name: "Grouping field" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Apply grouping" })).toBeVisible();
    await panel.getByRole("tab", { name: "Display", exact: true }).click();
    const follow = panel.getByRole("checkbox", { name: /Use app density/ });
    await expect(follow).toBeChecked();
    await follow.uncheck();
    await expect(panel.getByRole("radio", { name: "Spacious" })).toBeEnabled();
    await panel.getByRole("tab", { name: "Views", exact: true }).click();
    await expect(panel.getByRole("tab", { name: "Available views" })).toHaveAttribute("aria-selected", "true");
    await expect(panel.getByRole("heading", { name: "Standard views" })).toBeVisible();
    await expect(panel.getByRole("button", { name: /^All activity/ })).toHaveAttribute("aria-current", "true");
    await expect(panel.locator("select")).toHaveCount(0);
  });
});

test.describe("Atlas on the shared side panel", () => {
  test("Atlas uses the same frame as every side panel: modal overlay, backdrop and resize", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "atlas")!, { name: "atlas-frame", width: 1440 });
    const atlas = page.locator(".athyper-atlas-workspace");
    await expect(atlas).toHaveClass(/a-tool-panel/);
    await expect(atlas).toHaveAttribute("data-mode", "drawer");
    await expect(page.getByRole("dialog", { name: "Atlas AI workspace" })).toBeVisible();
    await expect(page.locator(".a-tool-panel-backdrop")).toHaveCount(1);
    const resize = atlas.getByRole("separator", { name: "Resize Atlas" });
    await resize.focus();
    await resize.press("Home");
    await expect(resize).toHaveAttribute("aria-valuenow", "360");
    await resize.press("End");
    await expect(resize).toHaveAttribute("aria-valuenow", "560");
    await expect(atlas.getByRole("button", { name: "New Atlas conversation" })).toBeVisible();
    await expect(atlas.getByRole("button", { name: "Pin Atlas to the right side" })).toBeVisible();
  });

  test("History closes on an outside click and Escape before Escape closes Atlas", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "atlas")!, { name: "atlas-history-escape", width: 1440 });
    const atlas = page.locator(".athyper-atlas-workspace");
    const trigger = atlas.getByRole("button", { name: "Conversation history" });
    const history = atlas.locator(".athyper-atlas-workspace__history");
    const closed = () => page.evaluate(() => (window as unknown as { atlasClosed?: number }).atlasClosed ?? 0);
    if (!(await history.isVisible())) await trigger.click();
    await history.click({ position: { x: 5, y: 5 } });
    await expect(history).toBeVisible();
    const conversation = (await atlas.locator(".athyper-atlas-workspace__conversation").boundingBox())!;
    await page.mouse.click(conversation.x + conversation.width - 8, conversation.y + conversation.height / 2);
    await expect(history).toHaveCount(0);
    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(history).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await closed()).toBe(0);
    await page.keyboard.press("Escape");
    await expect.poll(closed).toBe(1);
  });
});

test.describe("Atlas full view", () => {
  test("header toggles, business-language context, searchable history and readable actions", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "atlas-full")!, { name: "atlas-full-behaviour", width: 1440 });
    const atlas = page.locator(".athyper-atlas-workspace--fullscreen");
    // One header row: Context sits beside History; no separate toolbar row.
    await expect(atlas.locator(".athyper-atlas-workspace__tools")).toHaveCount(0);
    const context = atlas.getByRole("button", { name: "Hide context" });
    await expect(context).toHaveAttribute("aria-pressed", "true");
    await expect(atlas.getByText("What Atlas can see")).toBeVisible();
    await expect(atlas.getByText("Technical details")).toHaveCount(0);
    await context.click();
    await expect(atlas.getByRole("button", { name: "Show context" })).toBeVisible();
    await expect(atlas.getByText("What Atlas can see")).toHaveCount(0);
    // History: day groups, two-line titles, search on the server, ⋯ actions.
    await expect(atlas.locator(".athyper-atlas-history__groups h3")).toHaveText(["Today", "Yesterday", "Earlier"]);
    await atlas.getByRole("searchbox", { name: "Search conversations" }).fill("supplier");
    await expect(atlas.locator(".athyper-atlas-history__groups li")).toHaveCount(1);
    await atlas.getByRole("button", { name: "Actions for Which suppliers are waiting for approval?" }).click();
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Archive" })).toBeVisible();
    await page.keyboard.press("Escape");
    await atlas.getByRole("button", { name: "Clear search" }).click();
    // Actions in plain words, with a support reference; details are for administrators only.
    await atlas.getByRole("tab", { name: "Atlas actions" }).click();
    await expect(atlas.getByText("Couldn’t complete")).toBeVisible();
    await expect(atlas.getByText("Reference A1B2C3D4")).toBeVisible();
    await expect(atlas.getByText("Details for administrators")).toHaveCount(0);
    await atlas.getByRole("button", { name: /^Needs attention/ }).click();
    await expect(atlas.locator(".athyper-atlas-audit-list li")).toHaveCount(1);
  });
});

test.describe("composer tooltips", () => {
  test("Attach leaves no tooltip behind after the file picker; keyboard focus still explains it", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "atlas")!, { name: "attach-tooltip", width: 1440 });
    const attach = page.getByRole("button", { name: "Attach files", exact: true });
    const chooser = page.waitForEvent("filechooser");
    await attach.click();
    await (await chooser).setFiles([]);
    await page.mouse.move(10, 10);
    await expect(attach).toBeFocused();
    await expect(page.getByRole("tooltip")).toBeHidden();
    // Keyboard users still get the explanation.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("tooltip", { name: /Attach files/ })).toBeVisible();
  });
});

test.describe("Atlas answers", () => {
  test("answer first, readable data, collapsed scope, grouped sources and plain actions", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "atlas-full")!, { name: "atlas-answers", width: 1440 });
    const atlas = page.locator(".athyper-atlas-workspace--fullscreen");
    await atlas.locator(".athyper-atlas-history__row > button", { hasText: "Compare snapshots of Acme Trading" }).click();
    const messages = atlas.locator(".athyper-atlas-workspace__messages");
    // A1: a headline sentence instead of a field dump.
    await expect(messages.getByText("No saved comments you can see.")).toBeVisible();
    await expect(messages.getByText(/HASMORE|Saved comments —|COVERAGE/i)).toHaveCount(0);
    // A2: data as a table, changed rows first.
    await expect(messages.getByText("1 field changed between the two snapshots.")).toBeVisible();
    await expect(messages.locator("tr[data-changed] th")).toHaveText(["Region"]);
    await expect(messages.getByRole("cell", { name: "Not captured" })).toBeVisible();
    // Scope notes stay collapsed until asked for.
    const about = messages.locator("details.athyper-atlas-answer__about").first();
    await expect(about).not.toHaveAttribute("open", "");
    await expect(about.getByText("Only saved comments you can see")).toBeHidden();
    // A3: repeated versions of one record merge into one linked chip.
    const workspace = messages.getByRole("link", { name: "Country record" }).first();
    await expect(messages.locator(".athyper-atlas-answer__sources li").first()).toContainText("3 versions");
    await expect(workspace).toHaveAttribute("href", "/app/entity/country/AF");
    // A4: mixed answers split workspace and outside sources and number each statement.
    await expect(messages.getByText("From outside")).toBeVisible();
    await expect(messages.getByRole("link", { name: /ITU-T E.164 country codes/ })).toHaveAttribute("href", /^https:\/\//);
    await expect(messages.locator("sup.athyper-atlas-answer__marker")).toHaveText([" source 1", " source 2"]);
    // Technical details are for administrators only.
    await expect(messages.getByText("Details for administrators")).toHaveCount(0);
    // A5: plain actions; "Not helpful" asks what was wrong.
    const last = messages.locator(".athyper-atlas-answer__actions").last();
    await expect(last.getByRole("button", { name: "Copy answer" })).toBeVisible();
    await expect(last.getByRole("button", { name: "Helpful", exact: true })).toBeVisible();
    await last.getByRole("button", { name: "Not helpful" }).click();
    await expect(messages.getByRole("group", { name: "What was wrong?" })).toBeVisible();
  });

  test("follow-up suggestions fill the composer", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "atlas-full")!, { name: "atlas-follow-ups", width: 1440 });
    const atlas = page.locator(".athyper-atlas-workspace--fullscreen");
    await atlas.locator(".athyper-atlas-history__row > button", { hasText: "Compare snapshots of Acme Trading" }).click();
    const followUp = atlas.getByRole("button", { name: /^(Explain what changed|Show the saved snapshots|Summarize this record)$/ }).first();
    const text = (await followUp.textContent())!.trim();
    await followUp.click();
    await expect(atlas.getByRole("textbox", { name: "Ask Atlas to search, create, or take action" })).toHaveText(text);
  });
});

test.describe("shell chrome", () => {
  test("every app bar action stays on a 320px phone; the tenant name gives way", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "shell")!, { name: "chrome-320", width: 320 });
    const actions = page.locator(".athyper-shell__actions");
    await expect(actions.locator("button:visible")).toHaveCount(3);
    const context = await page.locator(".athyper-shell__business-context").boundingBox();
    const bar = await actions.boundingBox();
    expect(context!.x + context!.width).toBeLessThanOrEqual(bar!.x + 0.5);
    expect(bar!.x + bar!.width).toBeLessThanOrEqual(320);
  });

  test("icon-only app bar buttons keep their icon (Atlas mark included) below extraWide", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "shell")!, { name: "chrome-1200", width: 1200 });
    const icons = await page.locator(".athyper-shell__actions>button:visible").evaluateAll((buttons) =>
      buttons.map((button) => {
        const icon = button.querySelector("svg, [aria-hidden=true]");
        return { name: button.getAttribute("aria-label"), width: icon ? icon.getBoundingClientRect().width : 0 };
      }),
    );
    expect(icons.length).toBeGreaterThan(3);
    for (const icon of icons) expect(icon.width, icon.name ?? "").toBeGreaterThan(8);
  });

  test("header bar and sidebar have three sizes: Spacious, Comfortable between, Compact tightest", async ({ page }) => {
    const sizes: Record<string, { bar: number; row: number; page: number }> = {};
    for (const density of ["compact", "comfortable", "spacious"] as const) {
      await mount(page, SURFACES.find((item) => item.name === "shell")!, { name: `chrome-${density}`, width: 1440, density });
      sizes[density] = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.height = "var(--a-control-height)";
        document.querySelector(".athyper-shell__body")!.append(probe);
        return {
          bar: document.querySelector(".athyper-shell__topbar")!.getBoundingClientRect().height,
          row: document.querySelector(".athyper-shell__navigation a")!.getBoundingClientRect().height,
          page: probe.getBoundingClientRect().height,
        };
      });
    }
    expect(sizes.compact!.bar).toBeLessThan(sizes.comfortable!.bar);
    expect(sizes.compact!.row).toBeLessThan(sizes.comfortable!.row);
    expect(sizes.comfortable!.row).toBeLessThan(sizes.spacious!.row);
    expect(sizes.comfortable!.bar).toBeLessThan(sizes.spacious!.bar);
    expect(sizes.compact!.page).toBeLessThan(sizes.spacious!.page);
  });

  test("side panel headers step down with the Compact frame", async ({ page }) => {
    const heights: Record<string, number> = {};
    for (const density of ["compact", "comfortable", "spacious"] as const) {
      await mount(page, SURFACES.find((item) => item.name === "list-controls")!, { name: `panel-${density}`, width: 1440, density });
      heights[density] = await page.evaluate(() => document.querySelector(".a-panel-header")!.getBoundingClientRect().height);
    }
    expect(heights.compact!).toBeLessThan(heights.comfortable!);
    expect(heights.comfortable!).toBeLessThan(heights.spacious!);
  });

  test("Home's Atlas section follows density like other page content", async ({ page }) => {
    const sizes: Record<string, { hero: number; title: number; send: number }> = {};
    for (const density of ["compact", "comfortable", "spacious"] as const) {
      await mount(page, SURFACES.find((item) => item.name === "home")!, { name: `home-${density}`, width: 1440, density });
      sizes[density] = await page.evaluate(() => ({
        hero: document.querySelector(".athyper-home__hero")!.getBoundingClientRect().height,
        title: parseFloat(getComputedStyle(document.querySelector(".athyper-home__welcome h1")!).fontSize),
        send: document.querySelector(".athyper-home__composer-submit")!.getBoundingClientRect().height,
      }));
    }
    expect(sizes.compact!.hero).toBeLessThan(sizes.comfortable!.hero);
    expect(sizes.comfortable!.hero).toBeLessThan(sizes.spacious!.hero);
    expect(sizes.compact!.title).toBeLessThan(sizes.comfortable!.title);
    expect(sizes.compact!.send).toBeLessThan(sizes.comfortable!.send);
    expect(sizes.spacious!.send).toBeGreaterThan(sizes.comfortable!.send);
  });

  test("Mono dark: rail text is readable and the rail is not lighter than the page", async ({ page }) => {
    await mount(page, SURFACES.find((item) => item.name === "shell")!, { name: "chrome-mono-dark", width: 1440, theme: "dark", family: "atlas-mono" });
    const result = await page.evaluate(() => {
      const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const luminance = (value: string) => {
        const [r, g, b] = rgb(value).map((channel) => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05); };
      const rail = document.querySelector(".athyper-shell__rail")!;
      // The rail is a gradient: check text against both ends.
      const stops = getComputedStyle(rail).backgroundImage.match(/rgba?\([^)]*\)/g) ?? [];
      const links = [...document.querySelectorAll(".athyper-shell__navigation a")].map((link) => getComputedStyle(link).color);
      const pageColor = getComputedStyle(document.querySelector(".athyper-shell")!).backgroundColor;
      return {
        worst: Math.min(...links.flatMap((color) => stops.map((stop) => contrast(color, stop)))),
        railLighter: stops.some((stop) => luminance(stop) > luminance(pageColor) + 0.01),
        wordmark: getComputedStyle(document.querySelector(".athyper-shell__product-wordmark img")!).filter,
      };
    });
    expect(result.worst).toBeGreaterThanOrEqual(4.5);
    expect(result.railLighter).toBe(false);
    expect(result.wordmark).toContain("invert(1)");
  });

});
test("page headers and navigation bars match whether or not a page has header actions", async ({ page }) => {
  const read = () => page.evaluate(() => {
    const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return [Math.round(r.y), Math.round(r.height)]; };
    const current = document.querySelector("a[aria-current=page]")!, style = getComputedStyle(current);
    return {
      header: box(".athyper-page-header"), icon: box(".athyper-page-header__icon"), title: box(".athyper-page-header__heading"),
      description: box(".athyper-page-header__description"),
      underline: style.borderBottomWidth, shadow: style.boxShadow, tabHeight: Math.round(current.getBoundingClientRect().height),
    };
  });
  for (const density of ["compact", "comfortable", "spacious"] as const) {
    await mount(page, SURFACES.find((item) => item.name === "workspace")!, { name: `hdr-ws-${density}`, width: 1440, density });
    const workspace = await read();
    // Notifications has a header action (Notification preferences); it must not move the title or grow the header.
    await mount(page, SURFACES.find((item) => item.name === "activity-page")!, { name: `hdr-act-${density}`, width: 1440, density });
    expect(await read()).toEqual(workspace);
    expect(workspace).toMatchObject({ underline: "2px", shadow: "none" });
  }
});
