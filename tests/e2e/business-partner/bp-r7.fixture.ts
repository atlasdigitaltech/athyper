import { test as bpTest } from "./bp-v1-009.fixture";

type Environment = Readonly<Record<string, string | undefined>>;
const environment =
  (globalThis as typeof globalThis & { process?: { env?: Environment } })
    .process?.env ?? {};

export const test = bpTest.extend<{
  r7: {
    requisitionId: string;
    supplierId: string;
    expectedVersion: number;
    engagementId: string;
    engagementVersion: number;
    companyCodeId: string;
    placementEffectiveFrom: string;
  };
}>({
  r7: async ({}, use) =>
    use(
      Object.freeze({
        requisitionId: requiredUuid("PLAYWRIGHT_BP_R7_REQUISITION_ID"),
        supplierId: requiredUuid("PLAYWRIGHT_BP_R7_SUPPLIER_ID"),
        expectedVersion: requiredVersion(
          "PLAYWRIGHT_BP_R7_REQUISITION_VERSION",
        ),
        engagementId: requiredUuid("PLAYWRIGHT_BP_R7_ENGAGEMENT_ID"),
        engagementVersion: requiredVersion(
          "PLAYWRIGHT_BP_R7_ENGAGEMENT_VERSION",
        ),
        companyCodeId: requiredUuid("PLAYWRIGHT_BP_R7_COMPANY_CODE_ID"),
        placementEffectiveFrom: requiredDate(
          "PLAYWRIGHT_BP_R7_PLACEMENT_EFFECTIVE_FROM",
        ),
      }),
    ),
});

function required(name: string) {
  const value = environment[name]?.trim();
  if (!value)
    throw new Error(
      `R7 target fixture is mandatory: configure ${name}; it never skips`,
    );
  return value;
}

function requiredUuid(name: string) {
  const value = required(name);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error(`${name} must be a UUID`);
  return value;
}

function requiredVersion(name: string) {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer`);
  return value;
}

function requiredDate(name: string) {
  const value = required(name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error(`${name} must be an ISO date`);
  return value;
}
