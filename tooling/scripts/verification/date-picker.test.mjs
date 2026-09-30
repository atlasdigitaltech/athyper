import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

test(
  "date picker preserves form semantics and loads the keyboard-accessible calendar on demand",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "athyper-date-picker-"));
    const result = await build({
      stdin: {
        contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { Input } from './packages/platform/foundation/ui/src/index';
    import './packages/platform/foundation/ui/src/styles.css';
    import { EntityDataSurface } from './packages/platform/entity/runtime/form-detail/src/data-surface';
    import { DataValidationProvider, useDataValidation } from './packages/platform/entity/runtime/form-detail/src/data-validation';
    function Certificate() {
      const [answers, setAnswers] = useState({ effectiveFrom: '2026-09-15', effectiveUntil: '2026-09-14' });
      const [saved, setSaved] = useState(false);
      const validation = useDataValidation();
      const surface = { schemaVersion: 1, key: 'certificate', title: 'Certificate', columns: 1, sections: [{ key: 'dates', columns: 12, fields: [
        { control: 'input', key: 'from', valueKey: 'effectiveFrom', label: 'Certificate start', widget: 'date', required: false },
        { control: 'input', key: 'until', valueKey: 'effectiveUntil', label: 'Certificate expiry', widget: 'date', required: false }
      ] }] };
      return <section><EntityDataSurface surface={surface} surfaces={[]} answers={answers} onChange={setAnswers}/><button type="button" onClick={() => setSaved(validation.validate())}>Save certificate</button><span data-testid="saved">{String(saved)}</span></section>;
    }

    function App() {
      const [value, setValue] = useState('2026-09-15');
      return <form><label htmlFor="date">Valid until</label><Input id="date" name="date" type="date" value={value} min="2026-09-13" max="2028-02-15" onChange={event => setValue(event.currentTarget.value)}/>
        <output>{value}</output><Input aria-label="Uncontrolled" name="other" type="date" defaultValue="2026-09-16"/>
        <Input aria-label="Disabled" type="date" disabled/><Input aria-label="Read only" type="date" readOnly value="2026-09-15"/>
        <button type="reset">Reset</button><button type="button">After</button></form>;
    } createRoot(document.getElementById('root')).render(<><App/><DataValidationProvider><Certificate/></DataValidationProvider></>);
  `,
        resolveDir: resolve("."),
        loader: "tsx",
      },
      bundle: true,
      splitting: true,
      format: "esm",
      outdir: directory,
      entryNames: "entry",
      minify: true,
      metafile: true,
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const files = Object.keys(result.metafile.outputs);
    const css = files
      .filter((file) => file.endsWith(".css"))
      .map(
        (file) => `<link rel="stylesheet" href="/${file.split("/").at(-1)}">`,
      )
      .join("");
    const requests = [];
    const server = createServer(async (req, res) => {
      requests.push(req.url);
      if (req.url === "/") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          `<html><head>${css}</head><body tabindex="-1"><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`,
        );
        return;
      }
      try {
        const file = join(directory, req.url.slice(1));
        res.setHeader(
          "Content-Type",
          file.endsWith(".css") ? "text/css" : "text/javascript",
        );
        res.end(await readFile(file));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator("#date").waitFor();
      const calendarFile = files.find(
        (file) => file.includes("date-picker-calendar") && file.endsWith(".js"),
      );
      assert.ok(calendarFile);
      assert.ok(!requests.includes("/" + calendarFile.split("/").at(-1)));
      await page.getByRole("button", { name: "Choose date" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Choose date" });
      await dialog.getByRole("grid").waitFor();
      assert.ok(requests.includes("/" + calendarFile.split("/").at(-1)));
      assert.ok(await dialog.locator(":focus").count());
      // Blank areas must stay inside the dismissal boundary even when the page
      // body can receive focus (as in an application shell).
      for (const area of ["padding", "heading", "weekday"]) {
        await dialog
          .getByRole("button", { name: /September 15th, 2026/ })
          .focus();
        if (area === "padding")
          await dialog.click({ position: { x: 5, y: 5 } });
        else if (area === "heading")
          await dialog
            .locator(".a-date-picker__heading")
            .click({ position: { x: 195, y: 3 } });
        else await dialog.locator(".rdp-weekday").first().click();
        assert.equal(
          await dialog.isVisible(),
          true,
          `Clicking ${area} keeps the popup open`,
        );
        assert.equal(await page.locator("#date").inputValue(), "2026-09-15");
      }
      await page.locator("body").click({ position: { x: 700, y: 500 } });
      assert.equal(
        await dialog.isVisible(),
        false,
        "Outside whitespace dismisses the popup",
      );
      await page.getByRole("button", { name: "Choose date" }).first().click();
      await dialog.getByRole("grid").waitFor();
      await dialog.getByRole("button", { name: "Clear", exact: true }).focus();
      await page.keyboard.press("Tab");
      assert.equal(
        await dialog.isVisible(),
        false,
        "Tab out dismisses the popup",
      );
      assert.equal(
        await page
          .getByLabel("Uncontrolled")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.getByRole("button", { name: "Choose date" }).first().click();
      await dialog.getByRole("grid").waitFor();
      const dayBounds = await dialog.boundingBox();
      await dialog
        .getByRole("button", { name: "Choose month, September" })
        .click();
      const months = dialog.getByRole("group", {
        name: "Choose month",
        exact: true,
      });
      assert.equal(await months.getByRole("button").count(), 12);
      assert.equal(
        await months
          .getByRole("button", { name: "August", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await months
          .getByRole("button", { name: "September", exact: true })
          .evaluate((el) => el === document.activeElement),
        true,
      );
      const monthBounds = await dialog.boundingBox();
      assert.equal(monthBounds.height, dayBounds.height);
      assert.equal(monthBounds.width, dayBounds.width);
      if (process.env.DATE_PICKER_SCREENSHOT)
        await page.screenshot({
          path: process.env.DATE_PICKER_SCREENSHOT.replace(
            ".png",
            "-months.png",
          ),
        });
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await dialog
        .getByRole("button", { name: "Choose month, October" })
        .waitFor();
      assert.equal(await page.locator("#date").inputValue(), "2026-09-15");
      await dialog
        .getByRole("button", { name: "Choose month, October" })
        .click();
      await months
        .getByRole("button", { name: "September", exact: true })
        .click();
      await dialog.getByRole("button", { name: "Choose year, 2026" }).click();
      const years = dialog.getByRole("group", {
        name: "Choose year",
        exact: true,
      });
      assert.equal(await years.getByRole("button").count(), 12);
      assert.equal(
        await years
          .getByRole("button", { name: "2025", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await dialog
          .getByRole("button", { name: "Previous 12 years" })
          .isDisabled(),
        true,
      );
      const yearBounds = await dialog.boundingBox();
      assert.equal(yearBounds.height, dayBounds.height);
      assert.equal(yearBounds.width, dayBounds.width);
      if (process.env.DATE_PICKER_SCREENSHOT)
        await page.screenshot({
          path: process.env.DATE_PICKER_SCREENSHOT.replace(
            ".png",
            "-years.png",
          ),
        });
      await dialog.getByRole("button", { name: "Next 12 years" }).click();
      assert.equal(
        await years
          .getByRole("button", { name: "2028", exact: true })
          .isVisible(),
        true,
      );
      assert.equal(
        await years
          .getByRole("button", { name: "2029", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await dialog
          .getByRole("button", { name: "Next 12 years" })
          .isDisabled(),
        true,
      );
      await dialog.getByRole("button", { name: "Previous 12 years" }).click();
      await years.getByRole("button", { name: "2027", exact: true }).click();
      await dialog.getByRole("button", { name: "Choose year, 2027" }).waitFor();
      assert.equal(await page.locator("#date").inputValue(), "2026-09-15");
      await dialog.getByRole("button", { name: "Choose year, 2027" }).click();
      await years.getByRole("button", { name: "2026", exact: true }).click();
      await dialog.getByRole("button", { name: "Choose year, 2026" }).click();
      await page.keyboard.press("Escape");
      await dialog.getByRole("grid").waitFor();
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute("aria-label") ===
          "Choose year, 2026",
      );
      assert.equal(await dialog.isVisible(), true);
      await dialog
        .getByRole("button", { name: "Choose month, September" })
        .click();
      await dialog.getByRole("button", { name: "Back to calendar" }).click();
      await dialog.getByRole("grid").waitFor();

      await page.keyboard.press("Escape");
      assert.equal(await dialog.isVisible(), false);
      assert.equal(
        await page
          .getByRole("button", { name: "Choose date" })
          .first()
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.locator("#date").focus();
      await page.keyboard.press("Alt+ArrowDown");
      await dialog.getByRole("grid").waitFor();
      await dialog
        .getByRole("button", { name: /September 12th, 2026/ })
        .isDisabled()
        .then((value) => assert.equal(value, true));
      await dialog
        .getByRole("button", { name: /September 18th, 2026/ })
        .click();
      assert.equal(await page.locator("#date").inputValue(), "2026-09-18");
      assert.equal(await page.locator("output").textContent(), "2026-09-18");
      assert.equal(
        await page
          .locator("form")
          .evaluate((el) => new FormData(el).get("date")),
        "2026-09-18",
      );
      await page.getByRole("button", { name: "Choose date" }).first().click();
      await dialog.getByRole("grid").waitFor();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("output").textContent(), "2026-09-19");
      await page.getByRole("button", { name: "Choose date" }).first().click();
      await dialog.getByRole("button", { name: "Clear", exact: true }).click();
      assert.equal(await page.locator("output").textContent(), "");
      await page.locator("#date").fill("2026-10-01");
      assert.equal(await page.locator("output").textContent(), "2026-10-01");
      await page.getByRole("button", { name: "Choose date" }).nth(1).click();
      await dialog
        .getByRole("button", { name: /September 18th, 2026/ })
        .click();
      assert.equal(
        await page.getByLabel("Uncontrolled").inputValue(),
        "2026-09-18",
      );
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      assert.equal(
        await page.getByLabel("Uncontrolled").inputValue(),
        "2026-09-16",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Choose date" })
          .nth(2)
          .isDisabled(),
        true,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Choose date" })
          .nth(3)
          .isDisabled(),
        true,
      );
      await page.setViewportSize({ width: 375, height: 640 });
      await page.getByRole("button", { name: "Choose date" }).first().click();
      await dialog.getByRole("grid").waitFor();
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 375);
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 640);
      await page.screenshot({
        path:
          process.env.DATE_PICKER_SCREENSHOT ??
          join(directory, "date-picker.png"),
      });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Save certificate" }).click();
      assert.equal(await page.getByTestId("saved").textContent(), "false");
      assert.equal(
        await page
          .getByLabel("Certificate expiry")
          .getAttribute("aria-invalid"),
        "true",
      );
      assert.equal(
        await page.getByLabel("Certificate expiry").getAttribute("min"),
        "2026-09-15",
      );
      await page.getByLabel("Certificate expiry").fill("2026-09-15");
      await page.getByRole("button", { name: "Save certificate" }).click();
      assert.equal(await page.getByTestId("saved").textContent(), "true");
      await page.getByLabel("Certificate start").fill("2026-09-16");
      await page.getByRole("button", { name: "Save certificate" }).click();
      assert.equal(await page.getByTestId("saved").textContent(), "false");
      assert.deepEqual(errors, []);
      console.log(
        `Deferred calendar chunk: ${gzipSync(await readFile(calendarFile)).length} gzip bytes (fixture build).`,
      );
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  },
);
