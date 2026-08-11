import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

export type Plane = "studio" | "neon" | "mesh";
export type RequiredComponentState =
  | "loading"
  | "empty"
  | "partial"
  | "error"
  | "unauthorized"
  | "unavailable"
  | "stale"
  | "mutation-pending"
  | "mutation-success"
  | "mutation-conflict"
  | "mutation-failure";

export const REQUIRED_COMPONENT_STATES: readonly RequiredComponentState[] = [
  "loading",
  "empty",
  "partial",
  "error",
  "unauthorized",
  "unavailable",
  "stale",
  "mutation-pending",
  "mutation-success",
  "mutation-conflict",
  "mutation-failure",
];

export const CORE_SURFACES = [
  { code: "dashboard", route: "/dashboard" },
  { code: "inbox", route: "/inbox" },
  { code: "notifications", route: "/notifications" },
  { code: "settings", route: "/settings" },
  { code: "saved_views", route: "/saved-views" },
  { code: "setup", route: "/setup" },
  { code: "content", route: "/content" },
] as const;

export function productionContext(testInfo: TestInfo): {
  plane: Plane;
  formFactor: "desktop" | "mobile";
  enabled: boolean;
} {
  const metadata = testInfo.project.metadata as {
    plane?: Plane;
    formFactor?: "desktop" | "mobile";
  };
  const plane = metadata.plane ?? "neon";
  const suffix = plane.toUpperCase();
  const hasCredentials = Boolean(
    (process.env[`PLAYWRIGHT_${suffix}_USER`] ?? process.env.PLAYWRIGHT_USER)
    && (process.env[`PLAYWRIGHT_${suffix}_PASSWORD`] ?? process.env.PLAYWRIGHT_PASSWORD),
  );
  return {
    plane,
    formFactor: metadata.formFactor ?? "desktop",
    enabled: process.env.PLAYWRIGHT_PRODUCTION_MATRIX === "1" && hasCredentials,
  };
}

export async function assertSurfaceContract(page: Page, surfaceCode: string): Promise<void> {
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/coming soon|will appear here/i);
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 20_000 });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .exclude("[data-axe-exclude]")
    .analyze();
  expect(results.violations, `${surfaceCode} WCAG violations`).toEqual([]);
}

export async function assertKeyboardReachability(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  const first = page.locator(":focus");
  await expect(first).toBeVisible();
  await expect(first).not.toHaveAttribute("tabindex", "-1");
  for (let index = 0; index < 12; index += 1) await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
}

export async function observeWebVitals(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const values: Record<string, number[]> = { lcp: [], inp: [] };
    (window as unknown as { __athyperVitals: typeof values }).__athyperVitals = values;
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries.at(-1);
      if (last) values.lcp.push(last.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const duration = (entry as PerformanceEntry & { duration: number }).duration;
          if (duration > 0) values.inp.push(duration);
        }
      }).observe({ type: "event", buffered: true, durationThreshold: 16 });
    } catch {
      // Event Timing is unavailable in older browsers; Chromium CI supports it.
    }
  });
}

export async function assertWebVitalBudgets(page: Page): Promise<void> {
  const values = await page.evaluate(() =>
    (window as unknown as { __athyperVitals?: { lcp: number[]; inp: number[] } }).__athyperVitals);
  const lcp = percentile(values?.lcp ?? [], 0.75);
  const inp = percentile(values?.inp ?? [], 0.75);
  if (lcp !== undefined) expect(lcp, "LCP p75").toBeLessThanOrEqual(2_500);
  if (inp !== undefined) expect(inp, "INP p75").toBeLessThanOrEqual(200);
}

function percentile(values: readonly number[], fraction: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}
