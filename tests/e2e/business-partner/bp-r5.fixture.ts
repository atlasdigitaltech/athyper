import { test as bpTest } from "./bp-v1-009.fixture";

type Environment = Readonly<Record<string, string | undefined>>;
const environment =
  (globalThis as typeof globalThis & { process?: { env?: Environment } })
    .process?.env ?? {};
export const test = bpTest.extend<{
  r5: {
    customerBusinessPartnerId: string;
    customerId: string;
    companyCodeId: string;
  };
}>({
  r5: async ({}, use) =>
    use(
      Object.freeze({
        customerBusinessPartnerId: required(
          "PLAYWRIGHT_BP_R5_CUSTOMER_BUSINESS_PARTNER_ID",
        ),
        customerId: required("PLAYWRIGHT_BP_R5_CUSTOMER_ID"),
        companyCodeId: required("PLAYWRIGHT_BP_R5_COMPANY_CODE_ID"),
      }),
    ),
});
function required(name: string) {
  const value = environment[name]?.trim();
  if (!value)
    throw new Error(
      `R5 target fixture is mandatory: configure ${name}; it never skips`,
    );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error(`${name} must be a UUID`);
  return value;
}
