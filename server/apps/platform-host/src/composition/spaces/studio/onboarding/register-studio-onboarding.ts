import type { ProvisioningCommandTransport } from "@athyper/server-contract-integration";
import { createIamAuthenticationMiddleware, readVerifiedRequestContext } from "@athyper/server-platform-iam";
import { createCommandEnvelopeFactory, createGuestAccessExpiryHandler, createOnboardingSaga, EXPIRE_ONBOARDING_GUEST_ACCESS_JOB, KyselyOnboardingSagaRepository, OnboardingCaseLifecycleService, OnboardingMaintenanceService, ONBOARDING_MAINTENANCE_QUEUE, registerOnboardingRoutes } from "@athyper/server-plane-studio";
import { sql, type Kysely, type Transaction } from "kysely";
import type { Container } from "../../../../kernel/container.js";
import { createHash, randomUUID } from "node:crypto";
import type { ProcessRole } from "../../../../config/deployment-profile.js";

export function registerStudioOnboarding(
  container: Container,
  database: Kysely<Record<string, never>> | undefined,
  transport: ProvisioningCommandTransport | undefined,
  iam: NonNullable<Container["platform"]["iam"]>,
  authorizer: NonNullable<Container["platform"]["authorizer"]>,
  role?: ProcessRole,
): void {
  // This capability owns no scheduler work. Disabled capabilities must not add
  // readiness dependencies to unrelated processes.
  if (role === "scheduler" || !transport) return;
  container.runtimes.health.register(
    "studio.onboarding-authority",
    async () => {
      if (!database)
        return {
          status: "unhealthy",
          message: "Studio onboarding database is unavailable",
        };
      try {
        await sql`SELECT 1 FROM onboarding.onboarding_case LIMIT 1`.execute(
          database,
        );
        return { status: "healthy" };
      } catch {
        return {
          status: "unhealthy",
          message: "Studio onboarding schema is unavailable",
        };
      }
    },
  );
  if (!database || !container.adapters.athyperDatabase) return;
  const repository = new KyselyOnboardingSagaRepository(database);
  const transactions = {
    run: <Result>(
      actor: { tenantId: string; principalId: string },
      work: (
        transaction: Transaction<Record<string, never>>,
      ) => Promise<Result>,
    ) =>
      container.adapters.athyperDatabase!.withTenantTransaction((transaction) =>
        work(transaction as unknown as Transaction<Record<string, never>>),
      ),
  };
  const lifecycle = new OnboardingCaseLifecycleService(
    repository,
    transactions,
  );
  const maintenance = new OnboardingMaintenanceService(
    repository,
    transactions,
    authorizer,
  );
  const saga = createOnboardingSaga({
    repository,
    transport,
    envelopes: createCommandEnvelopeFactory({
      serviceId: "studio-onboarding",
      audienceFor: (plane) => `${plane}-provisioner`,
      newCommandId: randomUUID,
      fingerprint: (value) =>
        createHash("sha256").update(JSON.stringify(value)).digest("hex"),
      now: () => new Date().toISOString(),
    }),
  });
  if (role !== "worker") container.platform.httpRegistrars.push((application) =>
    registerOnboardingRoutes(application, {
      authenticate: createIamAuthenticationMiddleware(iam),
      readContext: readVerifiedRequestContext,
      authorize: async (context) =>
        Boolean(
          (
            await authorizer.authorize({
              context,
              permissionCode: "studio.onboarding.manage",
            })
          ).allowed,
        ),
      saga,
      lifecycle: lifecycle as OnboardingCaseLifecycleService<unknown>,
      maintenance: maintenance as OnboardingMaintenanceService<unknown>,
    }),
  );
  if (container.runtimes.jobs) {
    if (role !== "api") container.runtimes.jobs.register(
      ONBOARDING_MAINTENANCE_QUEUE,
      EXPIRE_ONBOARDING_GUEST_ACCESS_JOB,
      createGuestAccessExpiryHandler(maintenance),
    );
    container.runtimes.jobDefinitions.push({
      code: EXPIRE_ONBOARDING_GUEST_ACCESS_JOB,
      owner: "@athyper/server-plane-studio-onboarding",
      queue: ONBOARDING_MAINTENANCE_QUEUE,
      name: EXPIRE_ONBOARDING_GUEST_ACCESS_JOB,
      scope: "tenant",
      payloadSchema: { name: EXPIRE_ONBOARDING_GUEST_ACCESS_JOB, version: 1 },
      timeoutMs: 60_000,
      maxAttempts: 5,
      executionRetentionDays: 90,
    });
  }
}
