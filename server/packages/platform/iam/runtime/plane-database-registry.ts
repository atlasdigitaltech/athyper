import { sql, type Kysely } from "kysely";

export type RuntimePlaneKey = "admin" | "neon" | "mesh";
export type DatabasePlane = "athyper" | "neon" | "mesh";

// IAM is intentionally schema-agnostic at the TypeScript boundary. The
// desired-state DDL is validated by contract/integration tests rather than a
// generated mega-schema type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RuntimeDatabase = Kysely<Record<string, any>>;

export interface PlaneDatabaseBinding {
  readonly runtimePlane: RuntimePlaneKey;
  readonly databasePlane: DatabasePlane;
  readonly expectedDatabaseName: string;
  readonly db: RuntimeDatabase;
}

export interface PlaneDatabaseRegistryInput {
  readonly admin: RuntimeDatabase;
  readonly neon: RuntimeDatabase;
  readonly mesh: RuntimeDatabase;
}

const BINDING_METADATA: Record<RuntimePlaneKey, Omit<PlaneDatabaseBinding, "db">> = {
  admin: {
    runtimePlane: "admin",
    databasePlane: "athyper",
    expectedDatabaseName: "athyper_platform",
  },
  neon: {
    runtimePlane: "neon",
    databasePlane: "neon",
    expectedDatabaseName: "athyper_neon",
  },
  mesh: {
    runtimePlane: "mesh",
    databasePlane: "mesh",
    expectedDatabaseName: "athyper_mesh",
  },
};

/**
 * The sole IAM database router.
 *
 * Runtime plane names are API vocabulary (`admin`, `neon`, `mesh`); database
 * plane names are desired-state DDL vocabulary (`athyper`, `neon`, `mesh`).
 * Keeping the translation here prevents an Admin request from silently using
 * the Neon authority database.
 */
export class PlaneDatabaseRegistry {
  readonly #bindings: Readonly<Record<RuntimePlaneKey, PlaneDatabaseBinding>>;

  constructor(input: PlaneDatabaseRegistryInput) {
    if (!input.admin || !input.neon || !input.mesh) {
      throw new Error("ALL_PLANE_DATABASES_REQUIRED");
    }
    this.#bindings = Object.freeze({
      admin: Object.freeze({ ...BINDING_METADATA.admin, db: input.admin }),
      neon: Object.freeze({ ...BINDING_METADATA.neon, db: input.neon }),
      mesh: Object.freeze({ ...BINDING_METADATA.mesh, db: input.mesh }),
    });
  }

  forPlane(plane: RuntimePlaneKey): PlaneDatabaseBinding {
    const binding = this.#bindings[plane];
    if (!binding) throw new Error(`UNSUPPORTED_RUNTIME_PLANE:${String(plane)}`);
    return binding;
  }

  async assertReady(): Promise<void> {
    await Promise.all(
      (Object.keys(this.#bindings) as RuntimePlaneKey[]).map(async (plane) => {
        const binding = this.#bindings[plane];
        const result = await sql<{ database_name: string; database_plane: string | null }>`
          SELECT
            current_database()::text AS database_name,
            nullif(current_setting('app.database_plane', true), '') AS database_plane
        `.execute(binding.db);
        const actual = result.rows[0];
        if (
          !actual
          || actual.database_name !== binding.expectedDatabaseName
          || actual.database_plane !== binding.databasePlane
        ) {
          throw new Error(
            `PLANE_DATABASE_MISMATCH:${plane}:expected=${binding.expectedDatabaseName}/${binding.databasePlane}`
            + `:actual=${actual?.database_name ?? "unknown"}/${actual?.database_plane ?? "unset"}`,
          );
        }
      }),
    );
  }
}

export function createPlaneDatabaseRegistry(
  input: PlaneDatabaseRegistryInput,
): PlaneDatabaseRegistry {
  return new PlaneDatabaseRegistry(input);
}
