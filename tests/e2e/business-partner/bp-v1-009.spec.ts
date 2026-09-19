import AxeBuilder from "@axe-core/playwright";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { test } from "./bp-v1-009.fixture";

test.setTimeout(180_000);

test("BP-SUP-001 requester, approver, and materializer complete native Supplier onboarding", async ({
  bpActors,
}, testInfo) => {
  const { requesterPage, approverPage, materializerPage, config } = bpActors;
  const evidence: Array<Readonly<Record<string, unknown>>> = [];
  for (const page of [requesterPage, approverPage, materializerPage])
    retainApiEvidence(page, evidence);
  const fixtureSuffix = globalThis.crypto
    .randomUUID()
    .slice(0, 8)
    .toUpperCase();
  const registeredName = `BP-V1-009 ${fixtureSuffix}`;

  await requesterPage.goto("/mdg/business-partner/new");
  await expect(
    requesterPage.getByRole("heading", {
      name: "New supplier onboarding request",
    }),
  ).toBeVisible();
  await expect(requesterPage.getByLabel("Registered name")).toBeVisible();
  await assertAccessible(requesterPage, "supplier-create");
  await assertReflow(requesterPage, 2);
  await requesterPage
    .getByLabel("Operating organization")
    .selectOption(config.operatingOrganizationId);
  await requesterPage.getByLabel("Registered name").fill(registeredName);
  await requesterPage
    .getByLabel("Legal name")
    .fill(`${registeredName} Sdn Bhd`);
  await requesterPage
    .getByLabel("Registration country")
    .selectOption(config.registrationCountryCode);
  await requesterPage.getByLabel("Ownership").selectOption("external");
  await requesterPage.getByLabel("Supplier type").selectOption("strategic");
  await requesterPage
    .getByLabel("Qualification type")
    .selectOption("compliance");
  await requesterPage
    .getByLabel("Country", { exact: true })
    .selectOption(config.registrationCountryCode);
  await requesterPage
    .getByLabel("Address line 1")
    .fill(`Release 2 ${fixtureSuffix} Street`);
  await requesterPage.getByLabel("City").fill("Kuala Lumpur");
  await requesterPage.getByLabel("Postal code").fill("50000");
  await requesterPage
    .getByLabel("Contact name")
    .fill(`Release 2 Contact ${fixtureSuffix}`);
  await requesterPage.getByLabel("Channel type").selectOption("email");
  await requesterPage
    .getByLabel("Channel value")
    .fill(`release-${fixtureSuffix.toLowerCase()}@example.test`);
  await expect(
    requesterPage.locator("form[data-definition-release]"),
  ).toHaveAttribute("data-definition-release", /.+/);

  const createResponse = requesterPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        "/api/relay/neon/business-partner-cases",
  );
  await requesterPage
    .getByRole("button", { name: "Create draft request" })
    .click();
  const created = await createResponse;
  expect(created.ok()).toBe(true);
  const envelope = asRecord(await created.json());
  const request = asRecord(envelope.request);
  const governedCase = asRecord(envelope.case);
  const caseId = requiredString(request, "id");
  expect(requiredString(governedCase, "id")).toBe(caseId);
  await expect(requesterPage).toHaveURL(
    new RegExp(`/mdg/business-partner/requests/${caseId}$`),
  );

  await requesterPage.getByRole("button", { name: "Validate" }).click();
  await expect(
    requesterPage.getByRole("button", { name: "Submit for approval" }),
  ).toBeVisible();
  await requesterPage
    .getByRole("button", { name: "Submit for approval" })
    .click();
  await expect(
    requesterPage
      .getByLabel("Governed case summary")
      .getByText("Pending Approval", { exact: true }),
  ).toBeVisible();
  await expect(
    requesterPage.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await assertAccessible(requesterPage, "requester-pending-case");

  if (!new URL(approverPage.url()).pathname.endsWith(`/requests/${caseId}`))
    await approverPage.goto(`/mdg/business-partner/requests/${caseId}`, {
      waitUntil: "domcontentloaded",
    });
  const workflowTab = approverPage.getByRole("tab", { name: "Workflow" });
  await expect(async () => {
    await workflowTab.click();
    await expect(
      approverPage.getByRole("heading", { name: "Approval workflow" }),
    ).toBeVisible();
  }).toPass();
  await expect(
    approverPage.getByText("Data Stewardship", { exact: false }),
  ).toBeVisible();
  await expect(
    approverPage.getByText("Compliance And Tax", { exact: false }),
  ).toBeVisible();
  await expect(
    approverPage.getByText("Procurement Owner", { exact: false }),
  ).toBeVisible();
  await expect(
    approverPage.getByRole("heading", { name: "Approval workflow" }),
  ).toBeVisible();
  await expect(approverPage.getByText(/^Definition$/)).toBeVisible();
  await expect(approverPage.getByText(/^Work item$/)).toBeVisible();
  await expect(approverPage.getByText(/^Task owner$/)).toBeVisible();
  await expect(approverPage.getByText(/^Task status$/)).toBeVisible();
  await expect(approverPage.getByText(/^Task version$/)).toBeVisible();

  const approveButton = approverPage.getByRole("button", {
    name: "Approve",
    exact: true,
  });
  await approveButton.focus();
  await approverPage.keyboard.press("Enter");
  const approvalDialog = approverPage.getByRole("dialog", {
    name: "Approve request",
  });
  await expect(approvalDialog).toBeVisible();
  await assertAccessible(approverPage, "approval-dialog");
  await approverPage.keyboard.press("Escape");
  await expect(approvalDialog).toBeHidden();
  await expect(approveButton).toBeFocused();
  await approverPage.keyboard.press("Enter");
  await approvalDialog
    .getByLabel("Reason")
    .fill("Independent review completed against pinned evidence.");
  await approvalDialog
    .getByRole("button", { name: "Confirm approval" })
    .click();
  const verifyWithMfa = approverPage.getByRole("button", {
    name: "Verify with MFA",
  });
  await expect(verifyWithMfa).toBeVisible();
  await elevateWithTotp(
    approverPage,
    config.approver,
    config.approverTotpSecretFile,
  );
  if (!new URL(approverPage.url()).pathname.endsWith(`/requests/${caseId}`))
    await approverPage.goto(`/mdg/business-partner/requests/${caseId}`, {
      waitUntil: "domcontentloaded",
    });
  await expect(async () => {
    await workflowTab.click();
    await expect(
      approverPage.getByRole("heading", { name: "Approval workflow" }),
    ).toBeVisible();
  }).toPass();
  for (const stage of ["stewardship", "compliance-tax", "procurement-owner"]) {
    await approverPage
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    const dialog = approverPage.getByRole("dialog", {
      name: "Approve request",
    });
    await dialog
      .getByLabel("Reason")
      .fill(`Independent ${stage} review completed with elevated assurance.`);
    await dialog.getByRole("button", { name: "Confirm approval" }).click();
  }
  await expect(
    approverPage
      .getByLabel("Governed case summary")
      .getByText("Approved", { exact: true }),
  ).toBeVisible();

  await materializerPage.goto(`/mdg/business-partner/requests/${caseId}`);
  await materializerPage
    .getByRole("button", { name: "Create Business Partner" })
    .click();
  await expect(
    materializerPage
      .getByLabel("Governed case summary")
      .getByText("Applied", { exact: true }),
  ).toBeVisible();
  await materializerPage.getByRole("tab", { name: "Result" }).click();
  await expect(
    materializerPage.getByRole("heading", { name: "Result coordinates" }),
  ).toBeVisible();
  await expect(
    materializerPage.getByText(/at most the 25 newest coordinate edges/i),
  ).toBeVisible();
  await assertAccessible(materializerPage, "materialized-result-proof");
  const partnerLink = materializerPage.getByRole("link", {
    name: "Open partner",
  });
  const partnerHref = await partnerLink.getAttribute("href");
  expect(partnerHref).toMatch(/^\/mdg\/business-partner\/[0-9a-f-]{36}$/i);

  await requesterPage.goto(partnerHref!);
  await expect(
    requesterPage
      .getByRole("heading", { name: registeredName, exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    requesterPage.getByText(`Release 2 ${fixtureSuffix} Street`, {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    requesterPage.getByText(`Release 2 Contact ${fixtureSuffix}`, {
      exact: true,
    }),
  ).toBeVisible();
  await requesterPage.getByRole("button", { name: /^Roles & scope/ }).click();
  await expect(
    requesterPage.getByRole("heading", { name: "Roles", exact: true }),
  ).toBeVisible();
  await expect(
    requesterPage.getByText("supplier", { exact: true }).first(),
  ).toBeVisible();
  await requesterPage
    .getByRole("button", { name: /^Procurement & AP/ })
    .click();
  await expect(
    requesterPage.getByRole("heading", { name: "Supplier role" }),
  ).toBeVisible();
  await expect(
    requesterPage.getByRole("heading", {
      name: "Accounts payable configuration",
    }),
  ).toBeVisible();
  await expect(
    requesterPage.getByRole("button", { name: /activate/i }),
  ).toHaveCount(0);
  await assertAccessible(
    requesterPage,
    "materialized-supplier-procurement-desktop",
  );
  await assertReflow(requesterPage, 2);
  await requesterPage.setViewportSize({ width: 412, height: 915 });
  await assertAccessible(
    requesterPage,
    "materialized-supplier-procurement-phone",
  );
  await assertReflow(requesterPage, 1);
  const qualificationEvidence = JSON.stringify(
    {
      schema: "athyper.business-partner-v1-e2e-evidence/1",
      scenario: "BP-SUP-001",
      project: testInfo.project.name,
      actors: {
        requesterApproverDistinct: true,
        approverMaterializerDistinct: true,
        requesterMaterializerDistinct: true,
      },
      caseId,
      partnerPath: sanitizePath(partnerHref!),
      accessibility: [
        "supplier-create",
        "requester-pending-case",
        "approval-dialog",
        "materialized-result-proof",
        "materialized-supplier-procurement-desktop",
        "materialized-supplier-procurement-phone",
      ],
      reflow: [
        "supplier-create@200%",
        "materialized-supplier-procurement-desktop@200%",
        "materialized-supplier-procurement-phone",
      ],
      operations: evidence,
    },
    null,
    2,
  );
  const qualificationEvidencePath = testInfo.outputPath(
    "business-partner-v1-qualification-evidence.json",
  );
  writeFileSync(qualificationEvidencePath, `${qualificationEvidence}\n`, {
    mode: 0o600,
  });
  await testInfo.attach("business-partner-v1-qualification-evidence.json", {
    path: qualificationEvidencePath,
    contentType: "application/json",
  });
});

async function assertAccessible(page: Page, surface: string): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .exclude("[data-axe-exclude]")
    .analyze();
  expect(accessibility.violations, `${surface} WCAG violations`).toEqual([]);
}

async function assertReflow(page: Page, zoom: 1 | 2): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.style.zoom = String(value);
  }, zoom);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      { message: `Page must reflow at ${zoom * 100}% zoom` },
    )
    .toBeTruthy();
  if (zoom !== 1)
    await page.evaluate(() => {
      document.documentElement.style.zoom = "1";
    });
}

function retainApiEvidence(
  page: Page,
  evidence: Array<Readonly<Record<string, unknown>>>,
): void {
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.includes("/api/relay/neon/business-partner")) return;
    const timing = response.request().timing();
    evidence.push(
      Object.freeze({
        method: response.request().method(),
        path: sanitizePath(url.pathname),
        status: response.status(),
        durationMs: Math.max(0, Math.round(timing.responseEnd)),
      }),
    );
  });
}

async function elevateWithTotp(
  page: Page,
  actor: Readonly<{ username: string; password: string }>,
  secretFile: string,
): Promise<void> {
  await page.getByRole("button", { name: "Verify with MFA" }).click();
  await page.waitForLoadState("domcontentloaded");
  const username = page.locator('input[name="username"]');
  if (await username.isVisible().catch(() => false))
    await username.fill(actor.username);
  const password = page.getByLabel(/^password$/i);
  if (await password.isVisible().catch(() => false)) {
    await password.fill(actor.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
  }
  const setupSecret = page.locator("#totpSecret");
  const encodedSetupSecret = page.locator(
    "#kc-totp-secret-key .kc-totp-secret-value",
  );
  const otp = page.locator('#totp, input[name="otp"]').first();
  await expect(otp).toBeVisible();
  let secret: string;
  if ((await setupSecret.count()) > 0) {
    secret = ((await encodedSetupSecret.textContent()) ?? "").replaceAll(
      /[^A-Z2-7]/gi,
      "",
    );
    if (secret.length < 16)
      throw new Error("BP-V1-009 encoded TOTP seed is invalid");
    writeFileSync(secretFile, `${secret}\n`, { mode: 0o600 });
  } else {
    if (!existsSync(secretFile))
      throw new Error("BP-V1-009 approver TOTP seed is not available");
    secret = readFileSync(secretFile, "utf8").trim();
  }
  await otp.fill(totp(secret));
  await page.getByRole("button", { name: /submit|sign in|continue/i }).click();
  await page.waitForURL(
    (url) =>
      url.hostname === "neon.dev.athyper.test" &&
      !url.pathname.startsWith("/api/auth/"),
  );
  await page.waitForLoadState("domcontentloaded");
}

function totp(secret: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.toUpperCase().replaceAll(/[^A-Z2-7]/g, "")) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("BP-V1-009 TOTP seed is invalid");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let index = 0; index < bytes.length; index += 1)
    bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, "0");
}

function sanitizePath(path: string): string {
  return path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Readonly<Record<string, unknown>>;
}

function requiredString(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  expect(typeof value[key]).toBe("string");
  expect(value[key]).not.toBe("");
  return value[key] as string;
}
