// Phase 5 — Three-Plane Permission Stack.
//
// Direct (un-pooled) PG client helper. Required because PgBouncer transaction
// mode (the standard Kysely pool target) does not support LISTEN/NOTIFY. The
// cache-invalidation listener and grant-revoke listener both need a long-lived
// session-mode connection so they can subscribe to pg_notify channels.
//
// Resolution order for the connection string:
//   1. ATHYPER_LISTEN_DATABASE_URL  — explicit override (preferred in prod)
//   2. DATABASE_ADMIN_URL           — already used by db tooling
//   3. DATABASE_URL                 — last-ditch fallback
//
// In production the LISTEN URL must point at the un-pooled Postgres port
// (5432) — never PgBouncer.

import pg from "pg";

const { Client } = pg;

export interface DirectPgClientOptions {
  /** Override the env-resolved connection string. Useful for tests. */
  connectionString?: string;
  /** Tag the connection for `CLIENT LIST` / incident triage. */
  applicationName?: string;
}

export function resolveListenConnectionString(): string {
  const direct = process.env["ATHYPER_LISTEN_DATABASE_URL"]
    ?? process.env["DATABASE_ADMIN_URL"]
    ?? process.env["DATABASE_URL"];
  if (!direct) {
    throw new Error(
      "createDirectPgClient: set ATHYPER_LISTEN_DATABASE_URL (or DATABASE_ADMIN_URL / DATABASE_URL) " +
        "to a session-mode Postgres connection string. PgBouncer transaction mode does not support LISTEN.",
    );
  }
  return direct;
}

/**
 * Construct a connected pg.Client for the cache-invalidation listener.
 * Caller is responsible for calling `.end()` on shutdown.
 */
export async function createDirectPgClient(options: DirectPgClientOptions = {}): Promise<pg.Client> {
  const connectionString = options.connectionString ?? resolveListenConnectionString();
  const applicationName = options.applicationName ?? "athyper-cache-listener";

  const client = new Client({
    connectionString,
    application_name: applicationName,
    keepAlive: true,
    keepAliveInitialDelayMillis: 60_000,
  });

  await client.connect();
  return client;
}
