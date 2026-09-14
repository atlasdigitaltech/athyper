import { describe, expect, it } from "vitest";
import {
  Kysely,
  DummyDriver,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
} from "kysely";
import { createKyselyInvalidationRepository } from "../invalidation.js";

describe("invalidation timestamp mapping", () => {
  it.each([new Date("2026-09-12T01:00:00Z"), "2026-09-12T01:00:00.000Z"])(
    "preserves an ISO instant for authorization and metadata: %s",
    async (created_at) => {
      const connection: DatabaseConnection = {
        async executeQuery<R>(query: CompiledQuery) {
          const row = query.sql.includes("fn_authorization_claim_invalidations")
            ? {
                id: "10000000-0000-4000-8000-000000000001",
                scope_kind: "plane",
                plane_code: "neon",
                tenant_id: null,
                authority_table: "authz.role",
                authority_operation: "U",
                source_row_key: {},
                created_at,
                attempts: 1,
              }
            : {
                id: "10000000-0000-4000-8000-000000000002",
                entity_code: "invoice",
                plane_key: "neon",
                tenant_id: null,
                reason: "changed",
                source_table: null,
                source_id: null,
                payload: {},
                created_at,
                attempts: 1,
              };
          return { rows: [row] as R[] };
        },
        async *streamQuery<R>() {
          yield { rows: [] as R[] };
        },
      };
      class Driver extends DummyDriver {
        override async acquireConnection() {
          return connection;
        }
      }
      const db = new Kysely<Record<string, never>>({
        dialect: {
          createDriver: () => new Driver(),
          createAdapter: () => new PostgresAdapter(),
          createQueryCompiler: () => new PostgresQueryCompiler(),
          createIntrospector: (value) => new PostgresIntrospector(value),
        },
      });
      try {
        const rows = await createKyselyInvalidationRepository(db, "neon").claim(
          { workerId: "test", limit: 2, leaseSeconds: 60 },
        );
        expect(rows.map((row) => row.kind)).toEqual([
          "authorization",
          "metadata",
        ]);
        expect(rows.map((row) => row.createdAt)).toEqual([
          "2026-09-12T01:00:00.000Z",
          "2026-09-12T01:00:00.000Z",
        ]);
      } finally {
        await db.destroy();
      }
    },
  );
});
