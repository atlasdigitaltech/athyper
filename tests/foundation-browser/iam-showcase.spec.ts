import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const theme = path.resolve("deploy/config/iam/themes/neon/login");
async function render(page: Page, plane: string, script = true) {
  const markup = (
    await readFile(`${theme}/_showcase-${plane}.ftl`, "utf8")
  ).replace(/<#--[\s\S]*?-->/g, "");
  const styles = await Promise.all(
    [
      "iam.tokens.css", "public-identity-layout.css", "public-identity-showcase.css",
      "iam.generated.css",
      "workspace-showcase.css",
      "login.css",
    ].map((name) => readFile(`${theme}/resources/css/${name}`, "utf8")),
  );
  await page.setContent(
    `<!doctype html><html lang="en"><head><title>IAM preview fixture</title><style>${styles.join("\n").replace(/@import[^;]+;/g, "")}</style></head><body><div class="iam-shell"><header class="kc-page-header">Sign in</header><main class="kc-panel-right"><form><label for="username">Username</label><input id="username" name="username"><button>Continue</button></form></main><aside class="kc-story-panel" aria-label="Product preview">${markup}</aside></div></body></html>`,
  );
  if (script)
    await page.addScriptTag({
      path: `${theme}/resources/js/workspace-showcase.js`,
    });
}

for (const plane of ["neon", "mesh", "studio"]) {
  test(`${plane}: static fallback and responsive form`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await render(page, plane, false);
    await expect(page.locator(".kc-ws-answer")).not.toBeEmpty();
    await expect(
      page.getByRole("button", { name: "Pause workspace animation" }),
    ).toBeHidden();
    await expect(page.locator(".kc-ws-card")).toBeVisible();
    const layout = await page.evaluate(() => {
      const form = document.querySelector(".kc-panel-right")!;
      const story = document.querySelector(".kc-story-panel")!;
      return { formX: form.getBoundingClientRect().x, storyX: story.getBoundingClientRect().x, formFirst: !!(form.compareDocumentPosition(story) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    expect(layout.formX).toBe(0);
    expect(layout.storyX).toBeCloseTo(1440 * .42, 0);
    expect(layout.formFirst).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .include(".kc-story-panel")
      .analyze();
    expect(accessibility.violations).toEqual([]);
    for (const width of [900, 800, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 850 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.getByLabel("Username")).toBeVisible();
    }
    await expect(page.locator(".kc-story-panel")).toBeHidden();
  });
}

test("playback pauses, resumes, and respects live motion preferences", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.install();
  await render(page, "studio");
  const root = page.locator(".kc-ws");
  await expect(root).toHaveAttribute("data-running", "true");
  await page.clock.runFor(2200);
  await expect(page.locator('.kc-ws-chain li[data-active="true"]')).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "Pause workspace animation" }).click();
  await expect(page.locator(".kc-ws-play-icon")).toBeVisible();
  await expect(page.locator(".kc-ws-pause-icon")).toBeHidden();
  await expect(page.locator(".kc-ws-pause")).toHaveAttribute("title", "Resume workspace animation");
  const paused = await page.locator(".kc-ws-answer").textContent();
  await page.clock.runFor(3000);
  expect(await page.locator(".kc-ws-answer").textContent()).toBe(paused);
  await expect(root).toHaveAttribute("data-running", "false");
  await page.getByRole("button", { name: "Resume workspace animation" }).click();
  await expect(root).toHaveAttribute("data-running", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(root).toHaveAttribute("data-running", "false");
  expect(await page.locator(".kc-ws-answer").textContent()).toBe(
    await page.locator(".kc-ws-answer").getAttribute("data-answer"),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 850 });
  await expect(root).toHaveAttribute("data-running", "false");
});

test("hidden document suspends playback", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await render(page, "mesh");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".kc-ws")).toHaveAttribute("data-running", "false");
});

for (const plane of ["neon", "mesh", "studio"]) {
  test(`${plane}: selected question updates and persists without autoplay`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.clock.install();
    await render(page, plane);
    const choices = page.locator(".kc-ws-options button");
    await expect(choices).toHaveCount(3);
    await expect(page.locator(".kc-ws-atlas-head .kc-ws-pause")).toHaveCount(1);
    for (let i = 0; i < 3; i++) {
      const choice = choices.nth(i);
      await choice.focus();
      await page.keyboard.press("Enter");
      await expect(choice).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator('.kc-ws-options [aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator(".kc-ws-prompt")).toHaveText(await choice.getAttribute("data-question") ?? "");
      const answer = await choice.getAttribute("data-response") ?? "";
      await expect(page.locator(".kc-ws-answer")).toHaveText(answer);
      await expect(page.locator(".kc-ws-result")).toHaveText("Sample records · " + await choice.getAttribute("data-records"));
      await page.clock.runFor(21000);
      await expect(page.locator(".kc-ws-answer")).toHaveText(answer);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await choices.first().click();
    await expect(choices.first()).toHaveAttribute("aria-pressed", "true");
  });
}
