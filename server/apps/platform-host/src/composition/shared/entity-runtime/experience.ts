import { KyselyExperiencePlaneRepository } from "@athyper/server-adapter-experience-postgres";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation";
import {
  createExperienceService,
  createMemoryExperienceCache,
  createExperienceInvalidationHooks,
} from "@athyper/server-platform-experience";
import type { Kysely } from "kysely";
import { readPublishedEntityRouteCandidates } from "./route-admission.js";

type Database = Kysely<Record<string, never>>;
export interface EntityExperienceOptions {
  readonly databases: Readonly<Partial<Record<PlaneKey, Database>>>;
  readonly run: <Result>(
    plane: PlaneKey,
    work: (database: Database) => Promise<Result>,
  ) => Promise<Result>;
  /** Metadata is installed after composition; resolve it at request time. */
  readonly metadata: () => MetadataReader | undefined;
  readonly readRuntimeDefaults?: Parameters<
    typeof createExperienceService
  >[0]["readRuntimeDefaults"];
}

export function createEntityExperienceRuntime(
  options: EntityExperienceOptions,
) {
  const databases = { ...options.databases };
  const repositories = createExactPlaneRepositoryProvider(
    Object.fromEntries(
      Object.entries(databases).map(([plane, database]) => [
        plane,
        new KyselyExperiencePlaneRepository(database, (_context, work) =>
          options.run(plane as PlaneKey, work),
        ),
      ]),
    ) as Partial<Record<PlaneKey, KyselyExperiencePlaneRepository>>,
    { unavailableCode: "EXPERIENCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE" },
  );
  const cache = createMemoryExperienceCache();
  const service = createExperienceService({
    repositories,
    cache,
    readPublishedEntityRoutes: async (context) => {
      const metadata = options.metadata();
      if (!databases[context.planeKey] || !metadata) return [];
      return readPublishedEntityRouteCandidates(context, metadata, (work) =>
        options.run(context.planeKey, work),
      );
    },
    ...(options.readRuntimeDefaults
      ? { readRuntimeDefaults: options.readRuntimeDefaults }
      : {}),
  });
  return {
    service,
    invalidation: createExperienceInvalidationHooks(cache),
    health: (plane: PlaneKey) => repositories.health(plane),
  };
}
