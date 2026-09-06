import { test as base, type BrowserContext, type Page } from "@playwright/test";

type ActorCredentials = Readonly<{
  username: string;
  password: string;
}>;

export type BusinessPartnerJourneyConfig = Readonly<{
  operatingOrganizationId: string;
  registrationCountryCode: string;
  approverTotpSecretFile: string;
  requester: ActorCredentials;
  approver: ActorCredentials;
  materializer: ActorCredentials;
}>;

export type BusinessPartnerJourneyFixture = Readonly<{
  requesterPage: Page;
  approverPage: Page;
  materializerPage: Page;
  config: BusinessPartnerJourneyConfig;
}>;

type FixtureEnvironment = Readonly<Record<string, string | undefined>>;
const runtimeEnvironment =
  (
    globalThis as typeof globalThis & {
      readonly process?: { readonly env?: FixtureEnvironment };
    }
  ).process?.env ?? {};

export function readBusinessPartnerJourneyConfig(
  environment: FixtureEnvironment = runtimeEnvironment,
): BusinessPartnerJourneyConfig {
  const config = Object.freeze({
    operatingOrganizationId: required(
      environment,
      "PLAYWRIGHT_BP_V1_OPERATING_ORGANIZATION_ID",
    ),
    registrationCountryCode: (
      environment.PLAYWRIGHT_BP_V1_REGISTRATION_COUNTRY_CODE ?? "MY"
    ).toUpperCase(),
    approverTotpSecretFile:
      environment.PLAYWRIGHT_BP_V1_APPROVER_TOTP_SECRET_FILE ??
      "node_modules/.cache/bp-qualification/v1-approver-totp-secret",
    requester: Object.freeze({
      username: required(environment, "PLAYWRIGHT_BP_V1_REQUESTER_USER"),
      password: required(environment, "PLAYWRIGHT_BP_V1_REQUESTER_PASSWORD"),
    }),
    approver: Object.freeze({
      username: required(environment, "PLAYWRIGHT_BP_V1_APPROVER_USER"),
      password: required(environment, "PLAYWRIGHT_BP_V1_APPROVER_PASSWORD"),
    }),
    materializer: Object.freeze({
      username: required(environment, "PLAYWRIGHT_BP_V1_MATERIALIZER_USER"),
      password: required(environment, "PLAYWRIGHT_BP_V1_MATERIALIZER_PASSWORD"),
    }),
  });

  if (config.requester.username === config.approver.username) {
    throw new Error(
      "BP-V1-009 requires different requester and approver users",
    );
  }
  if (
    new Set([
      config.requester.username,
      config.approver.username,
      config.materializer.username,
    ]).size !== 3
  ) {
    throw new Error(
      "BP-V1-009 requires distinct requester, approver, and materializer users",
    );
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      config.operatingOrganizationId,
    )
  ) {
    throw new Error(
      "PLAYWRIGHT_BP_V1_OPERATING_ORGANIZATION_ID must be a UUID",
    );
  }
  if (!/^[A-Z]{2}$/.test(config.registrationCountryCode)) {
    throw new Error(
      "PLAYWRIGHT_BP_V1_REGISTRATION_COUNTRY_CODE must be an ISO alpha-2 code",
    );
  }
  return config;
}

export const test = base.extend<{
  bpActors: BusinessPartnerJourneyFixture;
}>({
  bpActors: async ({ browser }, use) => {
    const config = readBusinessPartnerJourneyConfig();
    const baseURL =
      runtimeEnvironment.PLAYWRIGHT_NEON_BASE_URL ??
      runtimeEnvironment.PLAYWRIGHT_BASE_URL ??
      "https://neon.athyper.local";
    const requesterContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 },
    });
    const approverContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 },
    });
    const materializerContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 },
    });

    try {
      const [requester, approver, materializer] = await Promise.all([
        authenticate(requesterContext, config.requester),
        authenticate(approverContext, config.approver),
        authenticate(materializerContext, config.materializer),
      ]);
      if (
        new Set([
          requester.principalId,
          approver.principalId,
          materializer.principalId,
        ]).size !== 3
      ) {
        throw new Error(
          "BP-V1-009 actors resolved to fewer than three principals",
        );
      }
      if (
        new Set([requester.tenantId, approver.tenantId, materializer.tenantId])
          .size !== 1
      ) {
        throw new Error(
          "BP-V1-009 requester and approver must use the same tenant",
        );
      }
      await use(
        Object.freeze({
          requesterPage: requester.page,
          approverPage: approver.page,
          materializerPage: materializer.page,
          config,
        }),
      );
    } finally {
      await Promise.allSettled([
        requesterContext.close(),
        approverContext.close(),
        materializerContext.close(),
      ]);
    }
  },
});

export async function authenticate(
  context: BrowserContext,
  actor: ActorCredentials,
): Promise<Readonly<{ page: Page; tenantId: string; principalId: string }>> {
  const page = await context.newPage();
  const applicationOrigin = new URL(
    (await context.request.get("/api/auth/session")).url(),
  ).origin;
  const identity = page.getByLabel(/email|username/i);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto("/login");
    const ready = await identity
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (ready) break;
    if (attempt === 3)
      throw new Error("BP-V1-009 login surface remained unavailable after 3 attempts");
  }
  await identity.fill(actor.username);
  const password = page.getByLabel(/^password$/i);
  if (!(await password.isVisible())) {
    await page
      .getByRole("button", { name: /sign in|log in|continue/i })
      .click();
  }
  await password.fill(actor.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expectSession(page, applicationOrigin);
  if (/\/login(?:\/|$)/.test(new URL(page.url()).pathname)) {
    await page.goto("/home");
  }
  const contextChoice = page
    .getByRole("button", { name: /continue|select|open/i })
    .first();
  if (await contextChoice.isVisible().catch(() => false)) {
    await contextChoice.click();
  }
  const sessionResponse = await page.request.get("/api/auth/session");
  if (!sessionResponse.ok()) {
    throw new Error(
      `BP-V1-009 could not resolve authenticated session (${sessionResponse.status()})`,
    );
  }
  const session = (await sessionResponse.json()) as Record<string, unknown>;
  return Object.freeze({
    page,
    tenantId: sessionValue(session, "tenantId"),
    principalId: sessionValue(session, "principalId"),
  });
}

async function expectSession(
  page: Page,
  applicationOrigin: string,
): Promise<void> {
  await page.waitForFunction(
    async (origin) => {
      const response = await fetch(`${origin}/api/auth/session`, {
        credentials: "same-origin",
      });
      if (!response.ok) return false;
      const session = (await response.json()) as Record<string, unknown>;
      return (
        typeof session.tenantId === "string" &&
        typeof session.principalId === "string"
      );
    },
    applicationOrigin,
    { timeout: 30_000 },
  );
}

function required(environment: FixtureEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(
      `BP-V1-009 fixture is mandatory: configure ${name}; this journey never skips`,
    );
  }
  return value;
}

function sessionValue(session: Record<string, unknown>, name: string): string {
  const value = session[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`BP-V1-009 authenticated session is missing ${name}`);
  }
  return value;
}
