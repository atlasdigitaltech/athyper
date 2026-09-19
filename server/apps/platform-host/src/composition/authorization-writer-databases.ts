import { readFileSync, statSync } from "node:fs";
import { sql, type Kysely } from "kysely";
import { createAthyperDatabaseAdapter } from "@athyper/server-adapter-db-athyper";
import { createNeonDatabaseAdapter } from "@athyper/server-adapter-db-neon";
import { createMeshDatabaseAdapter } from "@athyper/server-adapter-db-mesh";

type Plane = "studio" | "neon" | "mesh";
export function createAuthorizationWriterDatabases(path: string) {
  if (statSync(path).size > 65536)
    throw new Error("AUTHZ_WRITER_CONNECTIONS_INVALID");
  let input: any;
  try {
    input = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("AUTHZ_WRITER_CONNECTIONS_INVALID");
  }
  const factories = {
    studio: createAthyperDatabaseAdapter,
    neon: createNeonDatabaseAdapter,
    mesh: createMeshDatabaseAdapter,
  };
  if (
    input?.schemaVersion !== 1 ||
    !input.connections ||
    typeof input.connections !== "object" ||
    Array.isArray(input.connections) ||
    !Object.keys(input.connections).length
  )
    throw new Error("AUTHZ_WRITER_CONNECTIONS_INVALID");
  for (const [plane, connection] of Object.entries(input.connections)) {
    if (!Object.hasOwn(factories, plane) || typeof connection !== "string")
      throw new Error("AUTHZ_WRITER_CONNECTIONS_INVALID");
    let url: URL;
    try {
      url = new URL(connection);
    } catch {
      throw new Error("AUTHZ_WRITER_CONNECTIONS_INVALID");
    }
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.pathname !== `/athyper_${plane}` ||
      !url.username ||
      url.username === "postgres"
    )
      throw new Error("AUTHZ_WRITER_CONNECTIONS_INVALID");
  }
  const adapters = Object.entries(input.connections).map(
    ([plane, connectionString]) => ({
      plane: plane as Plane,
      adapter: factories[plane as Plane]({
        connectionString: connectionString as string,
        max: 2,
      }),
    }),
  );
  const databases = Object.fromEntries(
    adapters.map(({ plane, adapter }) => [plane, adapter.database]),
  ) as Partial<Record<Plane, Kysely<Record<string, never>>>>;
  return {
    databases,
    async qualify() {
      for (const { plane } of adapters) {
        const { rows } = await sql<{
          plane: string;
          writer: boolean;
          privileged: boolean;
        }>`SELECT current_setting('app.database_plane',true) AS plane, pg_has_role(current_user,'athyper_authorization_writer','MEMBER') AS writer, (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) AS privileged`.execute(
          databases[plane]!,
        );
        if (rows[0]?.plane !== plane || !rows[0].writer || rows[0].privileged)
          throw new Error("AUTHZ_WRITER_CONNECTION_NOT_QUALIFIED");
      }
    },
    async close() {
      await Promise.all(adapters.map(({ adapter }) => adapter.close()));
    },
  };
}
