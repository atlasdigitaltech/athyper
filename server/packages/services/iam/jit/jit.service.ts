/**
 * IAM JIT Provisioning Service — v4.2 (Phase 2 — binding primary)
 *
 * Creates a principal + profile + auth binding on first login for any
 * Keycloak user who has no pre-existing DB identity in a given tenant.
 *
 * Phase 2 change: principal_profile.keycloak_* columns are NO LONGER written
 * by this service. All IdP identity data is stored exclusively in
 * principal_identity_binding. The keycloak_* columns on principal_profile
 * are frozen for writes (controlled by app.iam_profile_kc_frozen setting).
 *
 * Design goals
 * ────────────
 *  • Idempotent — safe to call multiple times; ON CONFLICT guards every insert.
 *  • Handles pre-seeded principals — if a principal with the same `code`
 *    (username) already exists (e.g. seeded in demo data), we attach the
 *    auth binding to it rather than creating a duplicate principal.
 *  • Handles concurrent logins — ON CONFLICT (tenant_id, provider_code,
 *    subject_id) on principal_identity_binding prevents duplicate bindings under
 *    race conditions.
 *  • Single DB transaction — all three inserts (principal, profile, binding)
 *    succeed or fail together.
 *
 * Caller contract
 * ───────────────
 *  The caller (session.service.ts) must have already resolved tenant_id from
 *  the DB. This service takes tenant_id directly to avoid a redundant lookup.
 *
 * principal.code uniqueness
 * ─────────────────────────
 *  `code` is used for the principal's human-readable identifier and must be
 *  unique within the tenant. We use the KC `preferred_username`, but if that
 *  already exists for a *different* sub (KC UUID), we fall back to the KC
 *  `sub` UUID itself as the code — guaranteed unique.
 */

import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Record<string, any>;

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

export interface JitPrincipalInput {
  /** KC JWT `sub` claim — the IdP-assigned user UUID. */
  sub: string;
  /** KC `preferred_username`. Used as principal.code when available. */
  username: string;
  /** KC `name` claim — stored as principal.name and profile.display_name. */
  display_name: string;
  /** KC `email` claim — optional, stored on auth binding. */
  email?: string;
  /** Already-resolved tenant UUID from the session service. */
  tenant_id: string;
  /** Realm that issued the JWT subject. */
  realm_key?: string;
}

export interface JitPrincipalResult {
  principal_id: string;
  /** true = newly created this call; false = binding already existed. */
  created: boolean;
}

/**
 * Ensure a principal + auth binding exists for the given KC user in the
 * given tenant. Returns the resolved principal_id.
 *
 * Algorithm
 * ─────────
 * 1. Check if the auth binding already exists → return early (fast path).
 * 2. Find a pre-existing principal by username (code) in this tenant.
 *    If found, create only the missing auth binding.
 * 3. If no principal exists:
 *    a. INSERT principal with code=username (ON CONFLICT: use sub UUID as fallback code).
 *    b. INSERT principal_profile.
 *    c. INSERT principal_identity_binding.
 */
export async function jitProvisionPrincipal(
  db: Kysely<AnyDb>,
  input: JitPrincipalInput,
): Promise<JitPrincipalResult | null> {
  const { sub, username, display_name, email, tenant_id, realm_key = "athyper" } = input;

  // ── Step 1: Fast path — binding already exists ─────────────────────────────
  const existingBinding = await db
    .selectFrom("master.principal_identity_binding")
    .select("principal_id")
    .where("tenant_id", "=", tenant_id)
    .where("realm_key", "=", realm_key)
    .where("provider_code", "=", "keycloak")
    .where("subject_id", "=", sub)
    .executeTakeFirst();

  if (existingBinding) {
    const principalId = existingBinding.principal_id as string;
    // Backfill default persona for principals provisioned before persona
    // assignment was wired into JIT. Without a master.principal_persona row,
    // checkPermissionBatch resolves every permission to 'not_found' and the
    // ActionBar renders empty.
    await ensureDefaultPersona(db, tenant_id, principalId);
    return { principal_id: principalId, created: false };
  }

  // All remaining work runs inside a single transaction.
  // trg_set_updated_at reads app.current_principal_id to populate updated_by;
  // without it the trigger sets updated_by=null while updated_at=now(), which
  // violates pib_audit_pair_chk. Setting it to the system UUID here satisfies
  // the constraint for all system-initiated writes in this flow.
  return db.transaction().execute(async (trx) => {
    await sql`SELECT set_config('app.current_principal_id', ${SYSTEM_UUID}, true)`.execute(trx);

    // ── Step 2: Look for pre-seeded principal by username ────────────────────
    // Case-insensitive: the seed authors principal codes in upper case
    // (e.g. `ACFB.OWNER`) while KC ships `preferred_username` in lower case
    // (`acfb.owner`). A case-sensitive match would miss the seeded row and
    // Step 3 below would create a duplicate principal with no group
    // memberships, breaking the ActionBar for the user.
    const existingPrincipal = await trx
      .selectFrom("master.principal")
      .select("id")
      .where("tenant_id", "=", tenant_id)
      .where(sql`lower(code)`, "=", username.toLowerCase())
      .executeTakeFirst();

    let principalId: string;

    if (existingPrincipal) {
      // Pre-seeded principal found. Check if it already has a keycloak binding —
      // this happens when the seed used a placeholder UUID instead of the real KC sub.
      // In that case we must UPDATE rather than INSERT to avoid a unique constraint
      // violation on (tenant_id, principal_id, realm_key, provider_code).
      principalId = existingPrincipal.id as string;

      const existingKCBinding = await trx
        .selectFrom("master.principal_identity_binding")
        .select("subject_id")
        .where("tenant_id", "=", tenant_id)
        .where("principal_id", "=", principalId)
        .where("realm_key", "=", realm_key)
        .where("provider_code", "=", "keycloak")
        .executeTakeFirst();

      if (existingKCBinding) {
        if (existingKCBinding.subject_id === sub) {
          // Binding is already correct — only backfill persona if missing.
          await insertDefaultPersonaIfMissing(trx, tenant_id, principalId);
          return { principal_id: principalId, created: false };
        }
        // Wrong subject_id (seed mismatch) — update binding to the real KC UUID.
        // principal_profile.keycloak_* is intentionally NOT updated here (Phase 2:
        // binding table is the sole authority for IdP identity data).
        await trx
          .updateTable("master.principal_identity_binding")
          .set({
            subject_id: sub,
            username: username || null,
            sync_status: "synced",
            synced_at: new Date(),
          })
          .where("tenant_id", "=", tenant_id)
          .where("principal_id", "=", principalId)
          .where("realm_key", "=", realm_key)
          .where("provider_code", "=", "keycloak")
          .execute();

        await insertDefaultPersonaIfMissing(trx, tenant_id, principalId);
        return { principal_id: principalId, created: false };
      }
      // No binding yet — fall through to Step 3c to insert it.
    } else {
      // ── Step 3a: Create the principal ────────────────────────────────────
      // Try with username as code first. If a different user already claimed
      // that code in this tenant, fall back to the KC sub UUID (always unique).
      const nameParts = display_name.trim().split(/\s+/);
      const safeCode = username.trim() || sub;

      const inserted = await trx
        .insertInto("master.principal")
        .values({
          tenant_id,
          code: safeCode,
          name: display_name || username || sub,
          principal_type: "user",
          is_locked: false,
          is_service_account: false,
          principal_source: "oidc_jit",
          status: "active",
          created_by: SYSTEM_UUID,
        })
        .onConflict((oc) =>
          // Code already taken by a different user → use sub UUID as code instead.
          // We can't DO NOTHING here because we need the id regardless of conflict.
          oc.columns(["tenant_id", "code"]).doUpdateSet({
            // Update the name in case the display name changed (idempotent intent).
            // Only fires if code == safeCode matches an existing row for THIS sub.
            // If it's a different sub, the conflict means we must use sub as code.
            name: display_name || username || sub,
          }),
        )
        .returning("id")
        .executeTakeFirst();

      if (!inserted) {
        // Conflict — the same code exists for a DIFFERENT sub.
        // Re-insert with sub UUID as the code.
        const fallback = await trx
          .insertInto("master.principal")
          .values({
            tenant_id,
            code: sub,
            name: display_name || username || sub,
            principal_type: "user",
            is_locked: false,
            is_service_account: false,
            principal_source: "oidc_jit",
            status: "active",
            created_by: SYSTEM_UUID,
          })
          .onConflict((oc) => oc.columns(["tenant_id", "code"]).doNothing())
          .returning("id")
          .executeTakeFirst();

        if (!fallback) return null; // Should not happen; concurrent insert already won.

        principalId = fallback.id as string;
      } else {
        principalId = inserted.id as string;
      }

      // ── Step 3b: Create the principal_profile ────────────────────────────
      const givenName = nameParts[0] ?? username;
      const familyName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

      // Phase 2: keycloak_* columns are NOT written here — principal_identity_binding
      // is the sole authority for IdP identity data (inserted in Step 3c below).
      await trx
        .insertInto("master.principal_profile")
        .values({
          tenant_id,
          principal_id: principalId,
          given_name: givenName,
          family_name: familyName || null,
          display_name: display_name || username,
          created_by: SYSTEM_UUID,
        })
        .onConflict((oc) => oc.columns(["tenant_id", "principal_id"]).doNothing())
        .execute();
    }

    // ── Step 3c / Step 2b: Create the auth binding ──────────────────────────
    await trx
      .insertInto("master.principal_identity_binding")
      .values({
        tenant_id,
        principal_id: principalId,
        realm_key,
        provider_code: "keycloak",
        subject_id: sub,
        username: username || null,
        sync_status: "synced",
        idp_enabled: true,
        idp_email_verified: !!email,
        synced_at: new Date(),
        created_by: SYSTEM_UUID,
      })
      .onConflict((oc) =>
        oc.columns(["tenant_id", "realm_key", "provider_code", "subject_id"]).doNothing(),
      )
      .execute();

    // ── Step 3d: Assign default 'owner' persona ─────────────────────────────
    // Without this, checkPermissionBatch resolves every permission to
    // 'not_found' for this principal and the ActionBar renders empty.
    await insertDefaultPersonaIfMissing(trx, tenant_id, principalId);

    return { principal_id: principalId, created: true };
  });
}

// ─── Persona helpers ────────────────────────────────────────────────────────────

// Idempotent persona assignment for use inside an existing transaction.
// Caller must have already set app.current_principal_id on the transaction
// (jitProvisionPrincipal does this at the top of its main trx).
async function insertDefaultPersonaIfMissing(
  trx: Kysely<AnyDb>,
  tenant_id: string,
  principal_id: string,
): Promise<void> {
  const existing = await trx
    .selectFrom("master.principal_persona")
    .select("id")
    .where("tenant_id", "=", tenant_id)
    .where("principal_id", "=", principal_id)
    .executeTakeFirst();
  if (existing) return;

  const persona = await trx
    .selectFrom("shared.persona")
    .select("id")
    .where("code", "=", "owner")
    .executeTakeFirst();
  if (!persona) return;

  await trx
    .insertInto("master.principal_persona")
    .values({
      tenant_id,
      principal_id,
      persona_id: persona.id,
      assigned_by: SYSTEM_UUID,
      created_by: SYSTEM_UUID,
    })
    .onConflict((oc) => oc.columns(["tenant_id", "principal_id"]).doNothing())
    .execute();
}

// Standalone variant for the fast-path (binding-already-exists) branch.
// Wraps the work in its own transaction so app.current_principal_id stays
// in scope across the persona INSERT. Best-effort: any failure is logged
// but doesn't fail the login.
async function ensureDefaultPersona(
  db: Kysely<AnyDb>,
  tenant_id: string,
  principal_id: string,
): Promise<void> {
  try {
    await db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('app.current_principal_id', ${SYSTEM_UUID}, true)`.execute(trx);
      await insertDefaultPersonaIfMissing(trx, tenant_id, principal_id);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[jit] default persona backfill failed", err);
  }
}
