import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test(
  "storage console requires login and supports bucket upload/download",
  {
    skip: process.env.ATHYPER_STORAGE_CONSOLE_TESTS !== "true",
    timeout: 90000,
  },
  async () => {
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    const origin =
      process.env.ATHYPER_STORAGE_CONSOLE_ORIGIN ??
      "https://objects.dev.athyper.test";
    const password = readFileSync(
      process.env.ATHYPER_STORAGE_CONSOLE_PASSWORD_FILE ??
        join(
          homedir(),
          ".athyper/instances/dev/secrets/storage-console-password",
        ),
      "utf8",
    ).trim();
    const name = `console-check-${randomUUID()}.txt`;
    const body = Buffer.from("Athyper storage console upload/download check\n");
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    let uploaded = false;
    const bucketUrl = `${origin}/console/files?path=/buckets/athyper-documents`;
    try {
      await page.goto(bucketUrl);
      assert.equal(new URL(page.url()).pathname, "/console/login");
      await page.locator('[name="username"]').fill("admin");
      await page.locator('[name="password"]').fill("incorrect-password");
      await page.getByRole("button", { name: "Sign In" }).click();
      await page.waitForLoadState("load");
      assert.equal(new URL(page.url()).pathname, "/console/login");
      await page.locator('[name="username"]').fill("admin");
      await page.locator('[name="password"]').fill(password);
      await page.getByRole("button", { name: "Sign In" }).click();
      await page.waitForURL("**/console/admin");
      const cookie = (await context.cookies()).find(
        ({ name }) => name === "admin-session",
      );
      assert.ok(cookie?.secure && cookie.httpOnly);
      assert.equal(cookie.path, "/console/");

      await page.goto(`${origin}/console/object-store/buckets`);
      for (const bucket of [
        "athyper-documents",
        "athyper-artifacts",
        "athyper-transfers",
      ]) {
        assert.ok(
          await page.getByRole("link", { name: bucket, exact: false }).count(),
        );
      }
      await page.goto(bucketUrl);
      await page.locator('[onclick="uploadFile()"]').click();
      await page
        .locator("#fileInput")
        .setInputFiles({ name, mimeType: "text/plain", buffer: body });
      await page.locator('[onclick="submitUploadFile()"]').click();
      const row = page.locator("tr").filter({ hasText: name });
      await row.waitFor();
      uploaded = true;
      const pending = page.waitForEvent("download");
      await row.locator('[data-action="download"]').click();
      const download = await pending;
      assert.equal(download.suggestedFilename(), name);
      assert.deepEqual(readFileSync(await download.path()), body);
      const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        const denied = await anonymous.request.get(download.url(), {
          maxRedirects: 0,
        });
        assert.equal(denied.status(), 401);
      } finally {
        await anonymous.close();
      }
      // The S3 API still rejects an unsigned request to the uploaded object.
      const unsigned = await context.request.get(
        `${origin}/athyper-documents/${name}`,
      );
      assert.equal(unsigned.status(), 403);
      assert.match(await unsigned.text(), /AccessDenied/);
    } finally {
      try {
        if (uploaded) {
          await page.goto(bucketUrl);
          page.on("dialog", (dialog) => dialog.accept());
          const row = page.locator("tr").filter({ hasText: name });
          await row.locator('[data-action="delete"]').click();
          await page.locator("#globalDeleteConfirmBtn").click();
          await row.waitFor({ state: "detached" });
        }
      } finally {
        await browser.close();
      }
    }
  },
);
