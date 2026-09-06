import { test as bpTest } from "./bp-v1-009.fixture";

export type R2ScenarioId =
  "BP-SUP-002" | "BP-SUP-003" | "BP-CUS-002" | "BP-CUS-003";

export type R2Target = Readonly<{
  businessPartnerId: string;
  requestedRole: "supplier" | "customer";
  existingRole: "none" | "supplier" | "customer";
}>;

type FixtureEnvironment = Readonly<Record<string, string | undefined>>;
const runtimeEnvironment =
  (
    globalThis as typeof globalThis & {
      readonly process?: { readonly env?: FixtureEnvironment };
    }
  ).process?.env ?? {};

export function readR2Targets(
  environment: FixtureEnvironment = runtimeEnvironment,
): Readonly<Record<R2ScenarioId, R2Target>> {
  const targets = Object.freeze({
    "BP-SUP-002": target(
      required(environment, "PLAYWRIGHT_BP_R2_SUPPLIER_EXTENSION_TARGET_ID"),
      "supplier",
      "none",
    ),
    "BP-SUP-003": target(
      required(environment, "PLAYWRIGHT_BP_R2_CUSTOMER_TO_DUAL_TARGET_ID"),
      "supplier",
      "customer",
    ),
    "BP-CUS-002": target(
      required(environment, "PLAYWRIGHT_BP_R2_CUSTOMER_EXTENSION_TARGET_ID"),
      "customer",
      "none",
    ),
    "BP-CUS-003": target(
      required(environment, "PLAYWRIGHT_BP_R2_SUPPLIER_TO_DUAL_TARGET_ID"),
      "customer",
      "supplier",
    ),
  });
  const ids = Object.values(targets).map((item) => item.businessPartnerId);
  if (new Set(ids).size !== ids.length)
    throw new Error("R2 requires one distinct resettable target per scenario");
  return targets;
}

export const test = bpTest.extend<{
  r2Targets: Readonly<Record<R2ScenarioId, R2Target>>;
}>({
  r2Targets: async ({}, use) => {
    await use(readR2Targets());
  },
});

function target(
  businessPartnerId: string,
  requestedRole: R2Target["requestedRole"],
  existingRole: R2Target["existingRole"],
): R2Target {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      businessPartnerId,
    )
  )
    throw new Error("R2 target IDs must be UUIDs");
  return Object.freeze({ businessPartnerId, requestedRole, existingRole });
}

function required(environment: FixtureEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value)
    throw new Error(
      `R2 fixture is mandatory: configure ${name}; it never skips`,
    );
  return value;
}
