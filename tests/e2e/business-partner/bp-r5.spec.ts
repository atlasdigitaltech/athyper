import { expect, type Page } from "@playwright/test";
import { test } from "./bp-r5.fixture";

// This suite consumes a disposable prospect and ends with it archived. A failed
// mutation run needs a fresh fixture; automatic retries cannot reset authority.
test.describe.configure({ retries: 0 });

test("BP-CUS-001 creates, approves and materializes a new Customer with lineage", async ({
  bpActors,
}, testInfo) => {
  const {
    requesterPage: maker,
    approverPage: checker,
    materializerPage: materializer,
    config,
  } = bpActors;
  const name = `R5 Customer ${crypto.randomUUID().slice(0, 8)}`;
  await maker.goto("/mdg/business-partner/customer/new");
  await maker
    .getByLabel("Operating organization ID")
    .fill(config.operatingOrganizationId);
  await maker.getByLabel("Legal name", { exact: true }).fill(name);
  await maker
    .getByLabel("Registration country")
    .fill(config.registrationCountryCode);
  const creation = maker.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        "/api/relay/neon/business-partner-cases",
  );
  await maker.getByRole("button", { name: "Create customer draft" }).click();
  const created = await creation;
  const envelope = await created.json();
  if (!created.ok())
    await testInfo.attach("bp-cus-001-create-failure.json", {
      body: JSON.stringify({
        schema: "athyper.business-partner-target-failure/1",
        scenario: "BP-CUS-001",
        stage: "create_customer_case",
        httpStatus: created.status(),
        code:
          typeof envelope.code === "string"
            ? envelope.code.slice(0, 120)
            : "UNKNOWN",
        productionQualified: false,
      }),
      contentType: "application/json",
    });
  expect(created.ok()).toBe(true);
  const caseId = envelope.request.id;
  expect(envelope.request.requestedRole).toBe("customer");
  expect(caseId).toMatch(/^[0-9a-f-]{36}$/i);
  await maker.getByRole("button", { name: "Validate", exact: true }).click();
  await maker.getByRole("button", { name: "Submit for approval" }).click();
  await expect(
    maker.getByText("Pending Approval", { exact: true }),
  ).toBeVisible();
  await checker.goto(`/mdg/business-partner/requests/${caseId}`);
  await checker.getByRole("button", { name: "Approve", exact: true }).click();
  const dialog = checker.getByRole("dialog", { name: "Approve request" });
  await dialog
    .getByLabel("Reason")
    .fill("R5 independent Customer organization review");
  await dialog.getByRole("button", { name: "Confirm approval" }).click();
  await expect(checker.getByText("Approved", { exact: true })).toBeVisible();
  await materializer.goto(`/mdg/business-partner/requests/${caseId}`);
  await materializer
    .getByRole("button", { name: "Create Business Partner" })
    .click();
  await expect(
    materializer.getByText("Applied", { exact: true }),
  ).toBeVisible();
  const response = await materializer.request.get(
    `/api/relay/neon/business-partner-cases/${caseId}`,
  );
  expect(response.ok()).toBe(true);
  const body = await response.json();
  const proof = body.materializationProof;
  expect(proof).toMatchObject({
    status: "succeeded",
    result: { partnerRole: "customer" },
  });
  expect(proof.applicationFingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(proof.sourceSnapshot.snapshotId).not.toBe(
    proof.resultSnapshot.snapshotId,
  );
  expect(proof.lineage.length).toBeGreaterThan(0);
  const aggregateResponse = await maker.request.get(
    `/api/relay/neon/business-partners/${proof.result.businessPartnerId}`,
    { params: { operatingOrganizationId: config.operatingOrganizationId } },
  );
  expect(aggregateResponse.ok()).toBe(true);
  const aggregate = await aggregateResponse.json();
  expect(aggregate.customers).toHaveLength(1);
  expect(aggregate.customers[0]).toMatchObject({
    id: proof.result.roleId,
    status: "prospect",
  });
  expect(aggregate.suppliers).toHaveLength(0);
  await testInfo.attach("bp-cus-001-materialization.json", {
    body: JSON.stringify(
      {
        scenario: "BP-CUS-001",
        caseId,
        materializationId: proof.materializationId,
        result: proof.result,
        sourceSnapshotId: proof.sourceSnapshot.snapshotId,
        resultSnapshotId: proof.resultSnapshot.snapshotId,
        applicationFingerprint: proof.applicationFingerprint,
        lineage: proof.lineage.map(
          (edge: { lineageId: string; evidenceHash: string }) => ({
            lineageId: edge.lineageId,
            evidenceHash: edge.evidenceHash,
          }),
        ),
        customerStatus: "prospect",
        customerCount: 1,
        supplierCount: 0,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});

test("BP-CUS-004/005/006/007/008 decides controls and reconciles all five lifecycle actions", async ({
  bpActors,
  r5,
}, testInfo) => {
  const { requesterPage: maker, approverPage: checker } = bpActors;
  const path = `/api/relay/neon/business-partners/${r5.customerBusinessPartnerId}`;
  const scope = {
    operatingOrganizationId: bpActors.config.operatingOrganizationId,
    companyCodeId: r5.companyCodeId,
  };
  const businessDate = new Date().toISOString().slice(0, 10);
  const base = { ...scope, customerId: r5.customerId };
  const proof: Record<string, unknown>[] = [];
  const aggregate = async () => {
    const response = await maker.request.get(path, { params: scope });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const customer = (value: {
    customers: { id: string; status: string; recordVersion: number }[];
  }) => {
    const row = value.customers.find((item) => item.id === r5.customerId);
    expect(
      row,
      "The target must expose the exact disposable Customer",
    ).toBeDefined();
    return {
      id: row!.id,
      status: row!.status,
      recordVersion: row!.recordVersion,
    };
  };
  const before = await aggregate();
  const initial = customer(before);
  expect(
    initial.status,
    "Rebuild the disposable prospect before rerunning R5",
  ).toBe("prospect");
  const credits = await maker.request.get(`${path}/customer-credit-reviews`, {
    params: scope,
  });
  expect(credits.ok()).toBe(true);
  expect(await credits.json(), "R5 requires a fresh credit scope").toEqual([]);
  try {
    const opened = await command(maker, `${path}/customer-credit-reviews`, {
      ...base,
      reviewTypeCode: "target-negative",
      requestedCreditLimit: 1000,
      requestedCurrencyCode: "MYR",
      effectiveFrom: businessDate,
    });
    const rejected = await command(
      checker,
      `/api/relay/neon/customer-credit-reviews/${opened.review.id}/decisions`,
      {
        expectedVersion: opened.review.rowVersion,
        decision: "rejected",
        reason: "R5 negative journey",
      },
    );
    expect(rejected.review).toMatchObject({
      decision: "rejected",
      rowVersion: 2,
    });
    expect(rejected.review.approvedCreditLimit).toBeUndefined();
    await command(
      checker,
      `/api/relay/neon/customer-credit-reviews/${opened.review.id}/decisions`,
      {
        expectedVersion: 1,
        decision: "approved",
        reason: "Stale reversal",
      },
      409,
    );
    await command(
      checker,
      `${path}/customer-lifecycle`,
      {
        ...base,
        action: "activate",
        expectedVersion: initial.recordVersion,
        reasonCode: "R5_BLOCKED_ACTIVATION",
        businessDate,
      },
      409,
    );
    expect(customer(await aggregate())).toEqual(initial);
    proof.push({
      scenario: "BP-CUS-004",
      reviewId: opened.review.id,
      decision: "rejected",
      staleStatus: 409,
      blockedActivationStatus: 409,
    });

    const credit = await command(maker, `${path}/customer-credit-reviews`, {
      ...base,
      reviewTypeCode: "target-approved",
      requestedCreditLimit: 1000,
      requestedCurrencyCode: "MYR",
      effectiveFrom: businessDate,
    });
    const approved = await command(
      checker,
      `/api/relay/neon/customer-credit-reviews/${credit.review.id}/decisions`,
      {
        expectedVersion: credit.review.rowVersion,
        decision: "approved",
        reason: "R5 approved credit",
        approvedCreditLimit: 800,
        approvedCurrencyCode: "MYR",
      },
    );
    expect(Number(approved.review.approvedCreditLimit)).toBe(800);
    expect(approved.review.decision).toBe("approved");
    const designation = await command(maker, `${path}/customer-designations`, {
      ...base,
      countryCode: "MY",
      channelCode: "direct",
      designationType: "strategic",
      priorityTier: 1,
      effectiveFrom: businessDate,
      rationale: "R5 scoped designation",
    });
    const designationPath = `/api/relay/neon/customer-designations/${designation.designation.id}/decisions`;
    const designated = await command(checker, designationPath, {
      expectedVersion: designation.designation.rowVersion,
      decision: "approved",
      reason: "R5 designation approval",
    });
    expect(designated.designation).toMatchObject({
      ...base,
      countryCode: "MY",
      channelCode: "direct",
      status: "approved",
      rowVersion: 2,
    });
    await command(
      checker,
      designationPath,
      { expectedVersion: 1, decision: "revoked", reason: "Stale revocation" },
      409,
    );
    expect(customer(await aggregate())).toEqual(initial);
    proof.push({
      scenario: "BP-CUS-005",
      designationId: designation.designation.id,
      status: "approved",
      version: 2,
      ...scope,
      countryCode: "MY",
      channelCode: "direct",
    });

    const readiness = await checker.request.get(`${path}/eligibility`, {
      params: {
        ...scope,
        role: "customer",
        operationCode: "activation",
        businessDate,
      },
    });
    expect(readiness.ok()).toBe(true);
    const ready = await readiness.json();
    expect(ready).toMatchObject({ eligible: true, reasons: [] });
    expect(ready.decisionFingerprint).toMatch(/^[a-f0-9]{64}$/);
    proof.push({
      scenario: "BP-CUS-006",
      eligible: true,
      decisionFingerprint: ready.decisionFingerprint,
    });

    await checker.goto(
      `/mdg/business-partner/${r5.customerBusinessPartnerId}/customer`,
    );
    await checker
      .getByLabel("Sales organization")
      .selectOption(scope.operatingOrganizationId);
    await expect(checker.getByLabel("AR company")).toHaveValue(
      r5.companyCodeId,
    );
    let version = initial.recordVersion;
    for (const [label, status] of [
      ["Activate", "active"],
      ["Suspend", "suspended"],
      ["Reactivate", "active"],
      ["Deactivate", "inactive"],
      ["Archive", "archived"],
    ] as const) {
      const button = checker.getByRole("button", { name: label, exact: true });
      await expect(button).toBeEnabled();
      const pending = checker.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === `${path}/customer-lifecycle`,
      );
      await button.click();
      const response = await pending;
      expect(response.status()).toBe(201);
      const result = await response.json();
      expect(result).toMatchObject({
        customerId: r5.customerId,
        status,
        resultingVersion: ++version,
        replayed: false,
      });
      expect(result.eventId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(customer(await aggregate())).toEqual({
        id: r5.customerId,
        status,
        recordVersion: version,
      });
      if (label === "Suspend") {
        const original = response.request().postDataJSON();
        const replayResponse = await checker.request.post(
          `${path}/customer-lifecycle`,
          {
            headers: { ...await unsafeHeaders(checker), "Idempotency-Key": original.idempotencyKey },
            data: original,
          },
        );
        expect(replayResponse.status()).toBe(200);
        expect(await replayResponse.json()).toMatchObject({
          eventId: result.eventId,
          status,
          resultingVersion: version,
          replayed: true,
        });
        const conflicting = await checker.request.post(
          `${path}/customer-lifecycle`,
          {
            headers: { ...await unsafeHeaders(checker), "Idempotency-Key": original.idempotencyKey },
            data: { ...original, reasonCode: "R5_CHANGED_REASON" },
          },
        );
        expect(conflicting.status()).toBe(409);
        await command(
          checker,
          `${path}/customer-lifecycle`,
          { ...original, expectedVersion: version - 1 },
          409,
        );
        await command(
          checker,
          `${path}/customer-lifecycle`,
          { ...original, expectedVersion: version },
          409,
        );
        expect(customer(await aggregate())).toEqual({
          id: r5.customerId,
          status,
          recordVersion: version,
        });
        proof.push({
          scenario: "lifecycle_negative",
          eventId: result.eventId,
          outcomes: [
            "exact_replay",
            "conflicting_key_denied",
            "stale_version_denied",
            "invalid_transition_denied",
          ],
        });
      }
      proof.push({
        scenario: "BP-CUS-007",
        action: label.toLowerCase(),
        status,
        version,
        eventId: result.eventId,
      });
    }
    const revoked = await command(checker, designationPath, {
      expectedVersion: 2,
      decision: "revoked",
      reason: "R5 independent reconciliation",
    });
    expect(revoked.designation).toMatchObject({
      status: "revoked",
      rowVersion: 3,
    });
    const after = await aggregate();
    expect(customer(after)).toEqual({
      id: r5.customerId,
      status: "archived",
      recordVersion: version,
    });
    expect(after.businessPartner).toEqual(before.businessPartner);
    expect(after.suppliers).toEqual(before.suppliers);
    const history = await maker.request.get(`${path}/customer-credit-reviews`, {
      params: scope,
    });
    expect(history.ok()).toBe(true);
    expect(await history.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: opened.review.id, decision: "rejected" }),
        expect.objectContaining({
          id: credit.review.id,
          decision: "approved",
          rowVersion: 2,
        }),
      ]),
    );
    await checker.reload();
    await checker
      .getByLabel("Sales organization")
      .selectOption(scope.operatingOrganizationId);
    const table = checker.locator("#customer-control-history");
    await expect(
      table
        .getByRole("row")
        .filter({ hasText: "designation" })
        .filter({ hasText: "revoked" }),
    ).toHaveCount(1);
    await expect(table).toContainText(`archived · version ${version}`);
    proof.push({
      scenario: "BP-CUS-008",
      customer: customer(after),
      designationStatus: "revoked",
      creditStatus: "approved",
      identityAndSupplierUnchanged: true,
    });
  } finally {
    await testInfo.attach("bp-r5-control-journey.json", {
      body: JSON.stringify(proof, null, 2),
      contentType: "application/json",
    });
  }
});

async function command(
  page: Page,
  path: string,
  data: Record<string, unknown>,
  expectedStatus?: number,
) {
  const idempotencyKey = `bp-r5-${crypto.randomUUID()}`;
  const response = await page.request.post(path, {
    headers: { ...await unsafeHeaders(page), "Idempotency-Key": idempotencyKey },
    data: { ...data, idempotencyKey },
  });
  if (expectedStatus) expect(response.status()).toBe(expectedStatus);
  else expect(response.ok()).toBe(true);
  return response.json();
}

async function unsafeHeaders(page: Page): Promise<Record<string, string>> {
  const origin = new URL(page.url()).origin;
  const cookies = await page.context().cookies(origin);
  const csrf = cookies.find(cookie => cookie.name === "__Host-athyper-csrf")
    ?? cookies.find(cookie => cookie.name === "athyper-csrf");
  if (!csrf?.value) throw new Error("Authenticated Customer journey requires a CSRF cookie");
  return { Origin: origin, "X-CSRF-Token": csrf.value };
}
