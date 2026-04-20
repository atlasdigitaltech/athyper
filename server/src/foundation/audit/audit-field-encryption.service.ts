/**
 * AuditFieldEncryptionService — Phase 4.1
 *
 * Wraps Phase 1.7 CredentialEncryptionService for audit-specific encryption
 * of sensitive fields in log.audit_log.
 *
 * Per PLATFORM_MIGRATION.md Phase 4.1:
 *   - Uses CredentialEncryptionService (Phase 1.7) — do NOT reimplement encryption
 *   - Encrypts old_values/new_values JSON fields for audit rows containing PII
 *   - Decrypts on authorised read (Phase 4.2 audit query API)
 *
 * Key rotation worker:
 *   auditKeyRotation.worker.ts re-encrypts only the current hot partition (current month).
 *   Full historical re-encryption is impractical on high-volume partitions — this is a
 *   known limitation documented here.
 *
 * Which fields to encrypt:
 *   Configured via AuditEncryptionConfig.sensitiveEntityTypes — a Set of entity_type
 *   values whose old_values/new_values columns should be encrypted.
 *   Default: ['master.principal', 'master.identity_document', 'log.security_event_log'].
 */

import type { CredentialEncryptionService } from "../crypto/credential-encryption.service.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditEncryptionConfig {
  /**
   * Entity types whose audit old_values/new_values should be encrypted.
   * All others are stored in plain JSON.
   */
  sensitiveEntityTypes: Set<string>;
}

export interface AuditRow {
  id:          string;
  tenantId:    string;
  entityType:  string;
  oldValues:   Record<string, unknown> | null;
  newValues:   Record<string, unknown> | null;
}

export interface EncryptedAuditRow {
  id:         string;
  tenantId:   string;
  entityType: string;
  /** Serialised JSON (possibly encrypted): old_values column value */
  oldValues:  string | null;
  /** Serialised JSON (possibly encrypted): new_values column value */
  newValues:  string | null;
  encrypted:  boolean;
}

// ── AuditFieldEncryptionService ───────────────────────────────────────────────

export class AuditFieldEncryptionService {
  private readonly encryption: CredentialEncryptionService;
  private readonly config: AuditEncryptionConfig;

  constructor(
    encryption: CredentialEncryptionService,
    config?: Partial<AuditEncryptionConfig>,
  ) {
    this.encryption = encryption;
    this.config = {
      sensitiveEntityTypes: config?.sensitiveEntityTypes ?? new Set([
        "master.principal",
        "master.identity_document",
        "master.user_profile",
        "log.security_event_log",
        "master.bank_account",
      ]),
    };
  }

  /**
   * Check if an entity type requires encryption.
   */
  requiresEncryption(entityType: string): boolean {
    return this.config.sensitiveEntityTypes.has(entityType);
  }

  /**
   * Encrypt old_values and new_values for an audit row if the entity type
   * is in the sensitive list. Returns null for non-sensitive types.
   *
   * Returns the encrypted column values as strings to be stored in DB.
   */
  async encryptRow(row: AuditRow): Promise<EncryptedAuditRow> {
    if (!this.requiresEncryption(row.entityType)) {
      return {
        id:        row.id,
        tenantId:  row.tenantId,
        entityType: row.entityType,
        oldValues:  row.oldValues ? JSON.stringify(row.oldValues) : null,
        newValues:  row.newValues ? JSON.stringify(row.newValues) : null,
        encrypted:  false,
      };
    }

    const [encOld, encNew] = await Promise.all([
      row.oldValues
        ? this.encryption.encrypt(row.tenantId, JSON.stringify(row.oldValues))
            .then((p) => JSON.stringify(p))
        : Promise.resolve(null),
      row.newValues
        ? this.encryption.encrypt(row.tenantId, JSON.stringify(row.newValues))
            .then((p) => JSON.stringify(p))
        : Promise.resolve(null),
    ]);

    return {
      id:        row.id,
      tenantId:  row.tenantId,
      entityType: row.entityType,
      oldValues:  encOld,
      newValues:  encNew,
      encrypted:  true,
    };
  }

  /**
   * Decrypt an audit row's old_values/new_values.
   * Returns the row as-is if the fields are not encrypted.
   */
  async decryptRow(
    tenantId:  string,
    entityType: string,
    oldValues:  string | null,
    newValues:  string | null,
  ): Promise<{
    oldValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
  }> {
    if (!this.requiresEncryption(entityType)) {
      return {
        oldValues: oldValues ? JSON.parse(oldValues) as Record<string, unknown> : null,
        newValues: newValues ? JSON.parse(newValues) as Record<string, unknown> : null,
      };
    }

    const [decOld, decNew] = await Promise.all([
      oldValues
        ? this.encryption.decrypt(tenantId, oldValues)
            .then((v) => v ? JSON.parse(v) as Record<string, unknown> : null)
        : Promise.resolve(null),
      newValues
        ? this.encryption.decrypt(tenantId, newValues)
            .then((v) => v ? JSON.parse(v) as Record<string, unknown> : null)
        : Promise.resolve(null),
    ]);

    return { oldValues: decOld, newValues: decNew };
  }

  /**
   * Batch encrypt multiple audit rows (for bulk insert efficiency).
   */
  async encryptBatch(rows: AuditRow[]): Promise<EncryptedAuditRow[]> {
    return Promise.all(rows.map((r) => this.encryptRow(r)));
  }

  /**
   * Add a custom entity type to the sensitive list at runtime.
   * Used by modules that handle PII data not covered by the default list.
   */
  addSensitiveEntityType(entityType: string): void {
    this.config.sensitiveEntityTypes.add(entityType);
  }
}

// ── Key rotation worker helper ────────────────────────────────────────────────

/**
 * Re-encrypts audit rows in the current hot partition using the latest key version.
 * Called by auditKeyRotation.worker.ts after a key rotation.
 *
 * Known limitation: only re-encrypts the current month's partition.
 * Historical partitions are not re-encrypted (impractical on high volume).
 */
export async function reEncryptHotPartition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("kysely").Kysely<any>,
  encryption: CredentialEncryptionService,
  tenantId: string,
  service: AuditFieldEncryptionService,
  batchSize = 100,
): Promise<{ processed: number; errors: number }> {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  let processed = 0;
  let errors    = 0;
  let offset    = 0;

  while (true) {
    const rows = await db
      .selectFrom("log.audit_log as al" as never)
      .select(["al.id", "al.entity_type", "al.old_values", "al.new_values"] as never[])
      .where("al.tenant_id" as never, "=", tenantId as never)
      .where("al.created_at" as never, ">=", startOfMonth.toISOString() as never)
      .orderBy("al.id" as never, "asc" as never)
      .limit(batchSize)
      .offset(offset)
      .execute() as Array<{
        id: string;
        entity_type: string;
        old_values: string | null;
        new_values: string | null;
      }>;

    if (rows.length === 0) break;

    for (const row of rows) {
      if (!service.requiresEncryption(row.entity_type)) {
        offset++;
        continue;
      }

      try {
        const reEncOld = await encryption.reEncrypt(tenantId, row.old_values);
        const reEncNew = await encryption.reEncrypt(tenantId, row.new_values);

        if (reEncOld !== null || reEncNew !== null) {
          await db
            .updateTable("log.audit_log" as never)
            .set({
              ...(reEncOld !== null ? { old_values: reEncOld as never } : {}),
              ...(reEncNew !== null ? { new_values: reEncNew as never } : {}),
            } as never)
            .where("id" as never, "=", row.id as never)
            .where("tenant_id" as never, "=", tenantId as never)
            .execute();
        }
        processed++;
      } catch {
        errors++;
      }
      offset++;
    }
  }

  return { processed, errors };
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAuditFieldEncryptionService(
  encryption: CredentialEncryptionService,
  config?: Partial<AuditEncryptionConfig>,
): AuditFieldEncryptionService {
  return new AuditFieldEncryptionService(encryption, config);
}
