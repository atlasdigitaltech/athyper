#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import pg from "pg";

const apply = process.argv.includes("--apply");
const realm = process.env.KEYCLOAK_REALM?.trim() || "athyper";
const keycloakBaseUrl = required("KEYCLOAK_BASE_URL").replace(/\/+$/, "");
const adminRealm = process.env.KEYCLOAK_ADMIN_REALM?.trim() || "master";
const adminUsername = required("KEYCLOAK_ADMIN_USERNAME");
const adminPassword = (await readFile(required("KEYCLOAK_ADMIN_PASSWORD_FILE"), "utf8")).trim();
const postgresPassword = (await readFile(required("POSTGRES_PASSWORD_FILE"), "utf8")).trim();

const token = await adminToken(keycloakBaseUrl, adminRealm, adminUsername, adminPassword);
const users = await allUsers(keycloakBaseUrl, realm, token);
const subjectByUsername = new Map<string, string>();
for (const user of users) {
  const username = text(user.username).toLowerCase();
  const subject = text(user.id);
  if (subjectByUsername.has(username)) throw new Error(`duplicate Keycloak username: ${username}`);
  subjectByUsername.set(username, subject);
}

const databases = [
  ["studio", "athyper_studio"],
  ["neon", "athyper_neon"],
  ["mesh", "athyper_mesh"],
] as const;
const results = [];
for (const [plane, database] of databases) {
  const client = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(postgresPassword)}@db:5432/${database}`,
    application_name: "iam-runtime-subject-reconciliation",
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    const bindings = await client.query<{
      id: string;
      tenantId: string;
      username: string;
      subjectId: string;
    }>(`
      SELECT id::text, tenant_id::text AS "tenantId", lower(username) AS username,
             subject_id AS "subjectId"
      FROM master.principal_identity_binding
      WHERE provider_code='keycloak' AND realm_key=$1 AND status='active'
      ORDER BY tenant_id, username
      FOR UPDATE
    `, [realm]);
    const unresolved = bindings.rows.filter(({ username }) => !subjectByUsername.has(username));
    if (unresolved.length > 0) {
      throw new Error(`${plane}: ${unresolved.length} active bindings have no unique runtime Keycloak subject`);
    }
    const changes = bindings.rows
      .map((binding) => ({ ...binding, runtimeSubjectId: subjectByUsername.get(binding.username)! }))
      .filter(({ subjectId, runtimeSubjectId }) => subjectId !== runtimeSubjectId);
    const targetCoordinates = new Set<string>();
    for (const change of changes) {
      const coordinate = `${change.tenantId}\0${change.runtimeSubjectId}`;
      if (targetCoordinates.has(coordinate)) throw new Error(`${plane}: duplicate runtime subject target for tenant`);
      targetCoordinates.add(coordinate);
    }
    if (apply) {
      for (const change of changes) {
        await client.query(`
          WITH retired AS (
            DELETE FROM master.principal_identity_binding
            WHERE id=$1::uuid
            RETURNING *
          )
          INSERT INTO master.principal_identity_binding (
            tenant_id, principal_id, provider_code, realm_key, subject_id, issuer,
            audience, username, service_client_id, is_primary, status,
            last_verified_at, synced_at, sync_status, sync_error_message,
            sync_retry_count, provider_attributes, metadata, status_changed_at,
            status_changed_by, created_at, created_by, updated_at, updated_by
          )
          SELECT tenant_id, principal_id, provider_code, realm_key, $2, issuer,
            audience, username, service_client_id, is_primary, status,
            clock_timestamp(), clock_timestamp(), 'synced', NULL,
            sync_retry_count,
            coalesce(provider_attributes,'{}'::jsonb) || '{"runtimeSubjectReconciled":true}'::jsonb,
            metadata, status_changed_at, status_changed_by, created_at, created_by,
            clock_timestamp(), created_by
          FROM retired
        `, [change.id, change.runtimeSubjectId]);
      }
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
    results.push({ plane, bindingCount: bindings.rowCount, changedCount: changes.length });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

process.stdout.write(`${JSON.stringify({
  contractVersion: "athyper.iam-runtime-subject-reconciliation.v1",
  mode: apply ? "apply" : "dry-run",
  realm,
  keycloakUserCount: users.length,
  results,
}, null, 2)}\n`);

async function adminToken(baseUrl: string, targetRealm: string, username: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/realms/${encodeURIComponent(targetRealm)}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: "admin-cli", grant_type: "password", username, password }),
  });
  if (!response.ok) throw new Error(`Keycloak admin authentication failed: ${response.status}`);
  const body = await response.json() as { access_token?: unknown };
  return text(body.access_token);
}

async function allUsers(baseUrl: string, targetRealm: string, token: string): Promise<Array<Record<string, unknown>>> {
  const output: Array<Record<string, unknown>> = [];
  for (let first = 0; ; first += 500) {
    const response = await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(targetRealm)}/users?first=${first}&max=500`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Keycloak user inventory failed: ${response.status}`);
    const page = await response.json() as Array<Record<string, unknown>>;
    output.push(...page);
    if (page.length < 500) return output;
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Keycloak identity field is missing");
  return value.trim();
}
