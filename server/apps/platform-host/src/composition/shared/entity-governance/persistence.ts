import { sql, type Kysely, type Transaction } from "kysely";
import {
  createExactPlaneRepositoryProvider,
  createExactPlaneTransactionCoordinator,
  type PlaneTransactionCoordinator,
} from "@athyper/server-foundation";
import type { PlaneKey } from "@athyper/server-foundation/context";
import {
  createChannelConsentService,
  createModerationService,
  KyselyChannelConsentRepository,
  KyselyCommentModerationRepository,
  KyselyCycleExecutionRepository,
  KyselyLegalHoldRepository,
  KyselyReportPackRepository,
} from "@athyper/server-platform-governance";

type RecordTransaction = Transaction<Record<string, never>>;
export interface GovernancePersistenceOptions {
  readonly databases: Readonly<
    Partial<Record<PlaneKey, Kysely<Record<string, never>>>>
  >;
  readonly transactions: PlaneTransactionCoordinator<RecordTransaction>;
  readonly audit: Parameters<
    typeof createChannelConsentService<RecordTransaction>
  >[0]["audit"];
  readonly outbox: Parameters<
    typeof createChannelConsentService<RecordTransaction>
  >[0]["outbox"];
}

/** Owns exact-plane persistence; the caller supplies the active transaction and audit ports. */
export function createGovernancePersistence(
  options: GovernancePersistenceOptions,
) {
  const { transactions, audit, outbox } = options;
  const metadataDatabases = { ...options.databases };
  const exactTransactions =
    createExactPlaneTransactionCoordinator(transactions);
  const governanceDatabases = createExactPlaneRepositoryProvider(
    metadataDatabases,
    {
      unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE",
      health: {
        ...(metadataDatabases.studio
          ? { studio: governanceDatabaseHealth }
          : {}),
        ...(metadataDatabases.neon ? { neon: governanceDatabaseHealth } : {}),
        ...(metadataDatabases.mesh ? { mesh: governanceDatabaseHealth } : {}),
      },
    },
  );
  const consentRepositories = createExactPlaneRepositoryProvider(
    {
      ...(metadataDatabases.studio
        ? { studio: new KyselyChannelConsentRepository() }
        : {}),
      ...(metadataDatabases.neon
        ? { neon: new KyselyChannelConsentRepository() }
        : {}),
      ...(metadataDatabases.mesh
        ? { mesh: new KyselyChannelConsentRepository() }
        : {}),
    },
    { unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
  );
  const moderationRepositories = createExactPlaneRepositoryProvider(
    {
      ...(metadataDatabases.studio
        ? { studio: new KyselyCommentModerationRepository() }
        : {}),
      ...(metadataDatabases.neon
        ? { neon: new KyselyCommentModerationRepository() }
        : {}),
      ...(metadataDatabases.mesh
        ? { mesh: new KyselyCommentModerationRepository() }
        : {}),
    },
    { unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
  );
  const executionRepositories = createExactPlaneRepositoryProvider(
    {
      ...(metadataDatabases.studio
        ? { studio: new KyselyCycleExecutionRepository("studio", transactions) }
        : {}),
      ...(metadataDatabases.neon
        ? { neon: new KyselyCycleExecutionRepository("neon", transactions) }
        : {}),
      ...(metadataDatabases.mesh
        ? { mesh: new KyselyCycleExecutionRepository("mesh", transactions) }
        : {}),
    },
    { unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
  );
  const legalHoldRepositories = createExactPlaneRepositoryProvider(
    {
      ...(metadataDatabases.studio
        ? { studio: new KyselyLegalHoldRepository(metadataDatabases.studio) }
        : {}),
      ...(metadataDatabases.neon
        ? { neon: new KyselyLegalHoldRepository(metadataDatabases.neon) }
        : {}),
      ...(metadataDatabases.mesh
        ? { mesh: new KyselyLegalHoldRepository(metadataDatabases.mesh) }
        : {}),
    },
    { unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
  );
  const reportPackRepositories = createExactPlaneRepositoryProvider(
    {
      ...(metadataDatabases.studio
        ? { studio: new KyselyReportPackRepository(metadataDatabases.studio) }
        : {}),
      ...(metadataDatabases.neon
        ? { neon: new KyselyReportPackRepository(metadataDatabases.neon) }
        : {}),
      ...(metadataDatabases.mesh
        ? { mesh: new KyselyReportPackRepository(metadataDatabases.mesh) }
        : {}),
    },
    { unavailableCode: "GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
  );
  const hasGovernanceDatabase = Object.keys(metadataDatabases).length > 0;
  const consent = hasGovernanceDatabase
    ? createChannelConsentService({
        transactions: exactTransactions,
        repositories: consentRepositories,
        audit,
        outbox: outbox,
      })
    : undefined;
  const moderation = hasGovernanceDatabase
    ? createModerationService({
        transactions: exactTransactions,
        repositories: moderationRepositories,
        audit,
        outbox: outbox,
      })
    : undefined;
  return {
    governanceDatabases,
    executionRepositories,
    legalHoldRepositories,
    reportPackRepositories,
    hasGovernanceDatabase,
    consent,
    moderation,
  };
}

async function governanceDatabaseHealth(
  database: Kysely<Record<string, never>>,
) {
  await sql`SELECT 1 FROM governance.channel_consent LIMIT 1`.execute(database);
  return { status: "healthy" as const };
}
