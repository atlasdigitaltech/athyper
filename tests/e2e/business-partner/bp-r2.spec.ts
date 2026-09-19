import { expect, type Page, type TestInfo } from "@playwright/test";
import { test, type R2ScenarioId, type R2Target } from "./bp-r2.fixture";
import type { BusinessPartnerJourneyFixture } from "./bp-v1-009.fixture";

const scenarios: readonly R2ScenarioId[] = [
  "BP-SUP-002",
  "BP-SUP-003",
  "BP-CUS-002",
  "BP-CUS-003",
];

test.describe("R2 existing and dual-role organizations", () => {
  for (const scenario of scenarios) {
    test(`${scenario} reuses identity and preserves independent authority`, async ({
      bpActors,
      r2Targets,
    }, testInfo) => {
      await runRoleExtension(r2Targets[scenario], scenario, bpActors, testInfo);
    });
  }
});

async function runRoleExtension(
  target: R2Target,
  scenario: R2ScenarioId,
  actors: BusinessPartnerJourneyFixture,
  testInfo: TestInfo,
) {
  const { requesterPage, approverPage, materializerPage, config } = actors;
  const before = await readAggregate(
    requesterPage,
    target.businessPartnerId,
    config.operatingOrganizationId,
  );
  assertFixtureState(before, target);
  const beforeProof = authorityProof(before);

  await requesterPage.goto(
    `/mdg/business-partner/${target.businessPartnerId}/roles/new`,
  );
  await expect(
    requesterPage.getByRole("heading", { name: "Add Business Partner role" }),
  ).toBeVisible();
  await requesterPage
    .getByLabel("Operating organization")
    .selectOption(config.operatingOrganizationId);
  await expect(
    requesterPage.getByRole("heading", {
      name: "Identity and existing authority",
    }),
  ).toBeVisible();
  await expect(
    requesterPage.getByText(beforeProof.businessPartner.code, { exact: true }),
  ).toBeVisible();
  await requesterPage
    .getByLabel("Role", { exact: true })
    .selectOption(target.requestedRole);
  const suffix = globalThis.crypto.randomUUID().slice(0, 8).toUpperCase();
  await requesterPage
    .getByLabel(`${title(target.requestedRole)} code`)
    .fill(`${target.requestedRole === "supplier" ? "SUP" : "CUS"}.${suffix}`);

  const createResponse = requesterPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        "/api/relay/neon/business-partner-cases",
  );
  await requesterPage
    .getByRole("button", { name: "Create extension request" })
    .click();
  const createdResponse = await createResponse;
  expect(createdResponse.ok()).toBe(true);
  const created = asRecord(await createdResponse.json());
  const request = asRecord(created.request);
  const caseId = requiredString(request, "id");
  expect(request.targetBusinessPartnerId).toBe(target.businessPartnerId);
  expect(request.requestedRole).toBe(target.requestedRole);

  await requesterPage.getByRole("button", { name: "Validate" }).click();
  await requesterPage
    .getByRole("button", { name: "Submit for approval" })
    .click();
  await expect(
    requesterPage.getByText("Pending Approval", { exact: true }),
  ).toBeVisible();

  await approverPage.goto(`/mdg/business-partner/requests/${caseId}`);
  await approverPage
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  const dialog = approverPage.getByRole("dialog", { name: "Approve request" });
  await dialog
    .getByLabel("Reason")
    .fill(`${scenario} independent role review completed.`);
  await dialog.getByRole("button", { name: "Confirm approval" }).click();
  await expect(
    approverPage.getByText("Approved", { exact: true }),
  ).toBeVisible();

  await materializerPage.goto(`/mdg/business-partner/requests/${caseId}`);
  await materializerPage
    .getByRole("button", {
      name: /Create Business Partner|Apply role extension/,
    })
    .click();
  await expect(
    materializerPage.getByText("Applied", { exact: true }),
  ).toBeVisible();
  await materializerPage.getByRole("tab", { name: "Result" }).click();
  await expect(
    materializerPage.getByText(target.businessPartnerId, { exact: true }),
  ).toBeVisible();

  const after = await readAggregate(
    requesterPage,
    target.businessPartnerId,
    config.operatingOrganizationId,
  );
  const afterProof = authorityProof(after);
  expect(afterProof.businessPartner).toEqual(beforeProof.businessPartner);
  if (target.existingRole === "supplier")
    expect(afterProof.suppliers).toEqual(beforeProof.suppliers);
  if (target.existingRole === "customer")
    expect(afterProof.customers).toEqual(beforeProof.customers);
  expect(
    afterProof[target.requestedRole === "supplier" ? "suppliers" : "customers"],
  ).toHaveLength(
    beforeProof[target.requestedRole === "supplier" ? "suppliers" : "customers"]
      .length + 1,
  );

  await testInfo.attach(`${scenario.toLowerCase()}-identity-reuse.json`, {
    body: JSON.stringify(
      {
        schema: "athyper.business-partner-r2-evidence/1",
        scenario,
        targetBusinessPartnerId: target.businessPartnerId,
        requestedRole: target.requestedRole,
        existingRole: target.existingRole,
        identityReused: true,
        oppositeAuthorityPreserved: true,
        before: beforeProof,
        after: afterProof,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
}

async function readAggregate(
  page: Page,
  businessPartnerId: string,
  operatingOrganizationId: string,
): Promise<Readonly<Record<string, unknown>>> {
  const response = await page.request.get(
    `/api/relay/neon/business-partners/${businessPartnerId}?operatingOrganizationId=${encodeURIComponent(operatingOrganizationId)}`,
  );
  expect(response.ok()).toBe(true);
  return asRecord(await response.json());
}

function assertFixtureState(
  aggregate: Readonly<Record<string, unknown>>,
  target: R2Target,
) {
  const suppliers = array(aggregate.suppliers);
  const customers = array(aggregate.customers);
  if (target.existingRole === "none") {
    expect(suppliers).toHaveLength(0);
    expect(customers).toHaveLength(0);
  } else if (target.existingRole === "supplier") {
    expect(suppliers).toHaveLength(1);
    expect(customers).toHaveLength(0);
  } else {
    expect(customers).toHaveLength(1);
    expect(suppliers).toHaveLength(0);
  }
}

function authorityProof(aggregate: Readonly<Record<string, unknown>>) {
  const businessPartner = asRecord(aggregate.businessPartner);
  return Object.freeze({
    businessPartner: Object.freeze({
      id: requiredString(businessPartner, "id"),
      code: requiredString(businessPartner, "code"),
      name: requiredString(businessPartner, "name"),
      status: requiredString(businessPartner, "status"),
    }),
    suppliers: Object.freeze(
      array(aggregate.suppliers).map((item) => {
        const role = asRecord(item);
        return Object.freeze({
          id: requiredString(role, "id"),
          code: requiredString(role, "supplierCode"),
          status: requiredString(role, "status"),
        });
      }),
    ),
    customers: Object.freeze(
      array(aggregate.customers).map((item) => {
        const role = asRecord(item);
        return Object.freeze({
          id: requiredString(role, "id"),
          code: requiredString(role, "customerCode"),
          status: requiredString(role, "status"),
          designations: role.designations,
        });
      }),
    ),
  });
}

function array(value: unknown): readonly unknown[] {
  expect(Array.isArray(value)).toBe(true);
  return value as readonly unknown[];
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Readonly<Record<string, unknown>>;
}

function requiredString(value: Readonly<Record<string, unknown>>, key: string) {
  expect(typeof value[key]).toBe("string");
  expect(value[key]).not.toBe("");
  return value[key] as string;
}

function title(value: string) {
  return value.replace(/^./, (letter) => letter.toUpperCase());
}
