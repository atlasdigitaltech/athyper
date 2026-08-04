import { createHash } from "node:crypto";

import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Record<string, any>;

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

export interface JitPrincipalInput {
  /** Validated provider subject; opaque and case-sensitive. */
  sub: string;
  username: string;
  display_name: string;
  email?: string;
  tenant_id: string;
  realm_key?: string;
  issuer?: string;
  audience?: string;
}

export interface JitPrincipalResult {
  principal_id: string;
  created: boolean;
}

/**
 * Creates identity only. Plane membership and authorization are deliberately
 * left to explicit reconciliation, so a newly provisioned actor has zero
 * application access until approved authority exists.
 */
export async function jitProvisionPrincipal(
  db: Kysely<AnyDb>,
  input: JitPrincipalInput,
): Promise<JitPrincipalResult | null> {
  const subject = input.sub.trim();
  const realmKey = (input.realm_key ?? "athyper").trim().toLowerCase();
  if (!subject || !realmKey || !input.tenant_id) return null;

  return db.transaction().execute(async (trx) => {
    await sql`
      SELECT
        set_config('app.current_tenant_id', ${input.tenant_id}, true),
        set_config('app.current_principal_id', ${SYSTEM_UUID}, true),
        pg_advisory_xact_lock(
          hashtextextended(
            ${`${input.tenant_id}|keycloak|${realmKey}|${subject}`},
            0
          )
        )
    `.execute(trx);

    const tenant = await sql<{ active: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM master.tenant
        WHERE id = ${input.tenant_id}::uuid AND status = 'active'
      ) AS active
    `.execute(trx);
    if (!tenant.rows[0]?.active) return null;

    const existing = await sql<{ principal_id: string }>`
      SELECT binding.principal_id::text
      FROM master.principal_identity_binding AS binding
      JOIN master.principal AS principal
        ON principal.tenant_id = binding.tenant_id
       AND principal.id = binding.principal_id
      WHERE binding.tenant_id = ${input.tenant_id}::uuid
        AND binding.provider_code = 'keycloak'
        AND binding.realm_key = ${realmKey}
        AND binding.subject_id = ${subject}
        AND binding.status = 'active'
        AND principal.status = 'active'
      LIMIT 1
    `.execute(trx);
    if (existing.rows[0]) {
      return { principal_id: existing.rows[0].principal_id, created: false };
    }

    // A revoked/disabled coordinate is retained as security history. JIT must
    // not evade that decision by creating another principal for the same sub.
    const retained = await sql<{ retained: boolean }>`
      SELECT EXISTS (
        SELECT 1
        FROM master.principal_identity_binding
        WHERE tenant_id = ${input.tenant_id}::uuid
          AND provider_code = 'keycloak'
          AND realm_key = ${realmKey}
          AND subject_id = ${subject}
      ) AS retained
    `.execute(trx);
    if (retained.rows[0]?.retained) return null;

    const code = principalCode(input.username, subject);
    const principal = await trx
      .insertInto("master.principal")
      .values({
        tenant_id: input.tenant_id,
        code,
        name: normalizedDisplayName(input.display_name, input.username, subject),
        principal_type: "user",
        provisioning_source: "jit",
        metadata: {},
        status: "active",
        created_by: SYSTEM_UUID,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const principalId = principal.id as string;

    await trx
      .insertInto("master.principal_profile")
      .values({
        tenant_id: input.tenant_id,
        principal_id: principalId,
        display_name: normalizedDisplayName(input.display_name, input.username, subject),
        attributes: {},
        metadata: {},
        created_by: SYSTEM_UUID,
      })
      .execute();

    await trx
      .insertInto("master.principal_identity_binding")
      .values({
        tenant_id: input.tenant_id,
        principal_id: principalId,
        provider_code: "keycloak",
        realm_key: realmKey,
        subject_id: subject,
        issuer: optionalText(input.issuer),
        audience: optionalText(input.audience),
        username: optionalText(input.username),
        is_primary: true,
        status: "active",
        last_verified_at: new Date(),
        synced_at: new Date(),
        sync_status: "synced",
        provider_attributes: input.email ? { email: input.email } : {},
        metadata: {},
        created_by: SYSTEM_UUID,
      })
      .execute();

    return { principal_id: principalId, created: true };
  });
}

function principalCode(username: string, subject: string): string {
  const stem = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.@-]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .slice(0, 100) || "user";
  const digest = createHash("sha256").update(subject).digest("hex").slice(0, 16);
  return `${stem}-${digest}`.slice(0, 127);
}

function normalizedDisplayName(displayName: string, username: string, subject: string): string {
  return (displayName.trim() || username.trim() || subject).slice(0, 256);
}

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}
