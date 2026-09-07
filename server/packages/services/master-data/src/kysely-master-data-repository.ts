import { lockMasterDataOwner as lockOwner } from "./master-data-locks.js";
import type { AddressLink, AddressValue, ContactLink, MasterDataRepository, OwnerCoordinate, SignedProviderEvidence } from "@athyper/server-contract-master-data";
import { sql, type RawBuilder, type Transaction } from "kysely";
import { MasterDataError } from "./errors.js";

type Tx = Transaction<Record<string, never>>;
type Repo = MasterDataRepository<Tx>;
type Row = Record<string, any>;
const actor = sql`nullif(current_setting('app.current_principal_id', true), '')::uuid`;
const contactColumns = sql`c.*, o.code AS entity_code`;
const addressColumns = sql`l.*, l.effective_from::text AS effective_from, l.effective_until::text AS effective_until, o.code AS entity_code, row_to_json(a) AS address`;

/** Uses only the caller's plane transaction; never acquires an independent connection. */
export class KyselyMasterDataRepository implements Repo {
  async ownerExists(tenantId: string, owner: OwnerCoordinate, tx: Tx): Promise<boolean> {
    const type = (await query<Row>(sql`SELECT * FROM control.owner_type WHERE id=${owner.ownerTypeId}::uuid AND code=${owner.entityCode} AND status='active' AND (tenant_id IS NULL OR tenant_id=${tenantId}::uuid)`, tx))[0];
    if (!type) return false;
    // Identifiers come exclusively from the guarded registry and are quoted by Kysely.
    const rows = await query<Row>(sql`SELECT 1 FROM ${sql.id(type.target_schema, type.target_table)} WHERE ${sql.id(type.pk_column)}=${owner.ownerId}::uuid ${type.is_tenant_scoped ? sql`AND ${sql.id(type.tenant_column)}=${tenantId}::uuid` : sql``} LIMIT 1`, tx);
    return rows.length > 0;
  }

  async findContactDuplicate(input: Parameters<Repo["findContactDuplicate"]>[0], tx: Tx): Promise<ContactLink | null> {
    const rows = await query<Row>(sql`SELECT ${contactColumns} FROM master.contact_link c JOIN control.owner_type o ON o.id=c.owner_type_id
      WHERE ${contactOwner(input.tenantId, input.owner)} AND c.channel_type=${input.channelType} AND c.value=${input.value} AND c.purpose=${input.purpose}
      AND c.role_qualifier IS NOT DISTINCT FROM ${input.roleQualifier ?? null} AND c.status='active' AND c.effective_until IS NULL`, tx);
    return rows[0] ? contact(rows[0]) : null;
  }

  async createContact(input: Parameters<Repo["createContact"]>[0], tx: Tx): Promise<ContactLink> {
    await lockOwner(input.tenantId, input.owner, tx);
    await this.requireOwner(input.tenantId, input.owner, tx);
    const conflicts = await query<Row>(sql`SELECT value, is_primary FROM master.contact_link c
      WHERE c.tenant_id=${input.tenantId}::uuid AND c.owner_type_id=${input.owner.ownerTypeId}::uuid AND c.owner_id=${input.owner.ownerId}::uuid
      AND c.channel_type=${input.channelType} AND c.purpose=${input.purpose} AND c.role_qualifier IS NOT DISTINCT FROM ${input.roleQualifier ?? null}
      AND c.status <> 'deprecated' AND tstzrange(c.effective_from,c.effective_until,'[)') && tstzrange(${input.effectiveFrom}::timestamptz,${input.effectiveUntil ?? null}::timestamptz,'[)')
      AND (c.value=${input.value} OR (${input.isPrimary} AND c.is_primary))`, tx);
    if (conflicts.length) throw new MasterDataError(409, conflicts.some(r => r.value === input.value) ? "CONTACT_DUPLICATE" : "MASTER_DATA_PRIMARY_CONFLICT", "An equivalent contact or primary contact overlaps the requested period");
    const row = (await query<Row>(sql`INSERT INTO master.contact_link
      (tenant_id,owner_type_id,owner_id,channel_type,value,purpose,role_qualifier,is_primary,effective_from,effective_until,created_by)
      VALUES (${input.tenantId}::uuid,${input.owner.ownerTypeId}::uuid,${input.owner.ownerId}::uuid,${input.channelType},${input.value},${input.purpose},${input.roleQualifier ?? null},${input.isPrimary},${input.effectiveFrom}::timestamptz,${input.effectiveUntil ?? null}::timestamptz,${actor}) RETURNING *`, tx))[0]!;
    return contact({ ...row, entity_code: input.owner.entityCode });
  }

  async getContactForVerification(tenantId: string, contactId: string, tx: Tx): Promise<ContactLink | null> {
    const row = (await query<Row>(sql`SELECT ${contactColumns} FROM master.contact_link c JOIN control.owner_type o ON o.id=c.owner_type_id
      WHERE c.tenant_id=${tenantId}::uuid AND c.id=${contactId}::uuid AND (o.tenant_id IS NULL OR o.tenant_id=${tenantId}::uuid) FOR UPDATE OF c`, tx))[0];
    return row ? contact(row) : null;
  }

  async setContactVerification(tenantId: string, contactId: string, verified: boolean, verifiedAt: string, evidence: SignedProviderEvidence, tx: Tx): Promise<ContactLink | null> {
    const previous = (await query<Row>(sql`SELECT verification_evidence FROM master.contact_link WHERE tenant_id=${tenantId}::uuid AND id=${contactId}::uuid FOR UPDATE`, tx))[0];
    if (!previous) return null;
    const last = previous.verification_evidence as Partial<SignedProviderEvidence>;
    if (!Number.isFinite(Date.parse(evidence.issuedAt)) || (last.evidenceId === evidence.evidenceId && last.provider === evidence.provider) || (last.issuedAt && (!Number.isFinite(Date.parse(last.issuedAt)) || Date.parse(evidence.issuedAt) <= Date.parse(last.issuedAt)))) {
      throw new MasterDataError(409, "VERIFICATION_EVIDENCE_REPLAY", "Verification evidence must be newer than the last accepted evidence");
    }
    const row = (await query<Row>(sql`UPDATE master.contact_link c SET is_verified=${verified},verified_at=${verified ? verifiedAt : null}::timestamptz,
      verification_provider=${evidence.provider},verification_evidence=${JSON.stringify(evidence)}::jsonb,verification_signature=${evidence.signature},updated_at=now(),updated_by=${actor}
      FROM control.owner_type o WHERE c.tenant_id=${tenantId}::uuid AND c.id=${contactId}::uuid AND o.id=c.owner_type_id AND (o.tenant_id IS NULL OR o.tenant_id=${tenantId}::uuid)
      RETURNING ${contactColumns}`, tx))[0];
    return row ? contact(row) : null;
  }

  async deactivateContact(tenantId: string, contactId: string, effectiveUntil: string, tx: Tx): Promise<boolean> {
    if (!await lockTarget("contact_link", tenantId, contactId, tx)) return false;
    // Preserve status for historical reads and future-dated deactivation; the interval owns visibility.
    const rows = await query<Row>(sql`UPDATE master.contact_link SET effective_until=${effectiveUntil}::timestamptz,updated_at=now(),updated_by=${actor}
      WHERE tenant_id=${tenantId}::uuid AND id=${contactId}::uuid AND (effective_until IS NULL OR effective_until>${effectiveUntil}::timestamptz) RETURNING id`, tx);
    if (!rows.length) throw new MasterDataError(409, "MASTER_DATA_PERIOD_CLOSED", "Deactivation must shorten an existing effective period");
    return true;
  }

  async findAddressDuplicate(tenantId: string, hash: string, tx: Tx) {
    const row = (await query<Row>(sql`SELECT * FROM master.address WHERE tenant_id=${tenantId}::uuid AND normalized_hash=${hash} AND status='active'`, tx))[0];
    return row ? { id: String(row.id), address: addressValue(row) } : null;
  }

  async createAddress(tenantId: string, value: AddressValue, hash: string, tx: Tx) {
    if (!value.countryCode) throw new MasterDataError(400, "COUNTRY_CODE_REQUIRED", "Address country code is required");
    // Serialize deduplication without a no-op UPDATE that would modify shared address audit fields.
    await query(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["master.address", tenantId.toLowerCase(), hash])},0))`, tx);
    const existing = await this.findAddressDuplicate(tenantId, hash, tx);
    if (existing) return existing;
    const row = (await query<Row>(sql`INSERT INTO master.address (tenant_id,address_type,line1,line2,line3,city,region,postal_code,country_code,latitude,longitude,normalized_hash,status,created_by)
      VALUES (${tenantId}::uuid,${value.addressType ?? null},${value.line1 ?? null},${value.line2 ?? null},${value.line3 ?? null},${value.city ?? null},${value.region ?? null},${value.postalCode ?? null},${value.countryCode},${value.latitude ?? null},${value.longitude ?? null},${hash},'active',${actor}) RETURNING *`, tx))[0]!;
    return { id: String(row.id), address: addressValue(row) };
  }

  async createAddressLink(input: Parameters<Repo["createAddressLink"]>[0], tx: Tx): Promise<AddressLink> {
    await lockOwner(input.tenantId, input.owner, tx);
    await this.requireOwner(input.tenantId, input.owner, tx);
    const start = day(input.effectiveFrom), end = input.effectiveUntil ? day(input.effectiveUntil) : null;
    const conflicts = await query<Row>(sql`SELECT address_id FROM master.address_link WHERE tenant_id=${input.tenantId}::uuid AND owner_type_id=${input.owner.ownerTypeId}::uuid AND owner_id=${input.owner.ownerId}::uuid
      AND purpose=${input.purpose} AND role_qualifier IS NOT DISTINCT FROM ${input.roleQualifier ?? null}
      AND usage_status <> 'cancelled'
      AND daterange(effective_from,effective_until,'[)') && daterange(${start}::date,${end}::date,'[)')
      AND (address_id=${input.addressId}::uuid OR (${input.isPrimary} AND is_primary))`, tx);
    if (conflicts.length) throw new MasterDataError(409, "ADDRESS_LINK_CONFLICT", "An equivalent address link or primary address overlaps the requested period");
    const row = (await query<Row>(sql`INSERT INTO master.address_link (tenant_id,owner_type_id,owner_id,address_id,purpose,role_qualifier,attention_line,is_primary,effective_from,effective_until,created_by)
      SELECT ${input.tenantId}::uuid,${input.owner.ownerTypeId}::uuid,${input.owner.ownerId}::uuid,a.id,${input.purpose},${input.roleQualifier ?? null},${input.attentionLine ?? null},${input.isPrimary},${start}::date,${end}::date,${actor}
      FROM master.address a WHERE a.tenant_id=${input.tenantId}::uuid AND a.id=${input.addressId}::uuid AND a.status='active' RETURNING *,effective_from::text AS effective_from,effective_until::text AS effective_until`, tx))[0];
    if (!row) throw new MasterDataError(404, "ADDRESS_NOT_FOUND", "Address was not found");
    const address = (await query<Row>(sql`SELECT * FROM master.address WHERE tenant_id=${input.tenantId}::uuid AND id=${input.addressId}::uuid`, tx))[0]!;
    return addressLink({ ...row, entity_code: input.owner.entityCode, address });
  }

  async deactivateAddressLink(tenantId: string, linkId: string, effectiveUntil: string, tx: Tx): Promise<false | "deactivated" | "cancelled"> {
    if (!await lockTarget("address_link", tenantId, linkId, tx)) return false;
    const current = (await query<Row>(sql`SELECT usage_status, effective_from::text, effective_until::text,
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text AS today
      FROM master.address_link WHERE tenant_id=${tenantId}::uuid AND id=${linkId}::uuid FOR UPDATE`, tx))[0];
    if (!current) return false;
    if (current.usage_status === 'cancelled') throw new MasterDataError(409, "ADDRESS_LINK_ALREADY_CANCELLED", "Address link is already cancelled");
    const end = day(effectiveUntil);
    if (end <= current.effective_from) {
      if (current.effective_from < current.today || end < current.today) {
        throw new MasterDataError(400, "MASTER_DATA_VALUE_INVALID", "Established address usage requires an end date after its start date");
      }
      await query(sql`UPDATE master.address_link SET usage_status='cancelled',usage_denied_reason_code='cancelled',
        usage_denied_at=clock_timestamp(),usage_denied_by=${actor},updated_at=now(),updated_by=${actor}
        WHERE tenant_id=${tenantId}::uuid AND id=${linkId}::uuid`, tx);
      return "cancelled";
    }
    const rows = await query(sql`UPDATE master.address_link SET effective_until=${end}::date,updated_at=now(),updated_by=${actor}
      WHERE tenant_id=${tenantId}::uuid AND id=${linkId}::uuid AND (effective_until IS NULL OR effective_until>${end}::date) RETURNING id`, tx);
    if (!rows.length) throw new MasterDataError(409, "MASTER_DATA_PERIOD_CLOSED", "Deactivation must shorten an existing effective period");
    return "deactivated";
  }

  async listContacts(tenantId: string, owner: OwnerCoordinate, asOf: string, tx: Tx): Promise<readonly ContactLink[]> {
    return (await query<Row>(sql`SELECT ${contactColumns} FROM master.contact_link c JOIN control.owner_type o ON o.id=c.owner_type_id
      WHERE ${contactOwner(tenantId, owner)} AND c.status <> 'deprecated' AND c.effective_from<=${asOf}::timestamptz AND (c.effective_until IS NULL OR c.effective_until>${asOf}::timestamptz)
      ORDER BY c.is_primary DESC,c.purpose,c.id`, tx)).map(contact);
  }

  async listAddresses(tenantId: string, owner: OwnerCoordinate, asOf: string, tx: Tx): Promise<readonly AddressLink[]> {
    return (await query<Row>(sql`SELECT ${addressColumns} FROM master.address_link l JOIN master.address a ON a.tenant_id=l.tenant_id AND a.id=l.address_id JOIN control.owner_type o ON o.id=l.owner_type_id
      WHERE l.tenant_id=${tenantId}::uuid AND l.owner_type_id=${owner.ownerTypeId}::uuid AND l.owner_id=${owner.ownerId}::uuid AND o.code=${owner.entityCode} AND (o.tenant_id IS NULL OR o.tenant_id=${tenantId}::uuid)
      AND l.usage_status='active' AND l.effective_from<=${day(asOf)}::date AND (l.effective_until IS NULL OR l.effective_until>${day(asOf)}::date)
      ORDER BY l.is_primary DESC,l.purpose,l.id`, tx)).map(addressLink);
  }

  private async requireOwner(tenantId: string, owner: OwnerCoordinate, tx: Tx) {
    if (!await this.ownerExists(tenantId, owner, tx)) throw new MasterDataError(404, "OWNER_NOT_FOUND", "Owner was not found");
  }
}

function contactOwner(tenantId: string, owner: OwnerCoordinate) {
  return sql`c.tenant_id=${tenantId}::uuid AND c.owner_type_id=${owner.ownerTypeId}::uuid AND c.owner_id=${owner.ownerId}::uuid AND o.code=${owner.entityCode} AND (o.tenant_id IS NULL OR o.tenant_id=${tenantId}::uuid)`;
}
async function query<T>(statement: RawBuilder<T>, tx: Tx): Promise<T[]> {
  try { return (await statement.execute(tx)).rows; }
  catch (error) {
    const db = error as { code?: string; constraint?: string };
    if (db.code === "23505" || db.code === "23P01") throw new MasterDataError(409, db.constraint === "contact_link_value_uq" ? "CONTACT_DUPLICATE" : "MASTER_DATA_CONFLICT", "Master data uniqueness or effective-period conflict");
    if (db.code === "23503") throw new MasterDataError(422, "MASTER_DATA_REFERENCE_INVALID", "Master data reference is unavailable or unsupported");
    if (db.code === "23514" || db.code === "23502" || db.code === "22000" || db.code === "22007" || db.code === "22008") throw new MasterDataError(400, "MASTER_DATA_VALUE_INVALID", "Master data value or effective period violates a constraint");
    throw error;
  }
}
function instant(value: unknown): string { return new Date(value as string | Date).toISOString(); }
/** Address usage is date-granular in the schema; use UTC consistently across sessions. */
function day(value: string): string { return instant(value).slice(0, 10); }
function optional(row: Row, fields: Record<string, string>): Row {
  return Object.fromEntries(Object.entries(fields).filter(([, key]) => row[key] != null).map(([name, key]) => [name, row[key]]));
}
function contact(row: Row): ContactLink {
  return { id: row.id, tenantId: row.tenant_id, owner: { entityCode: row.entity_code, ownerTypeId: row.owner_type_id, ownerId: row.owner_id }, channelType: row.channel_type, value: row.value, purpose: row.purpose,
    ...optional(row, { roleQualifier: "role_qualifier" }), isPrimary: row.is_primary, isVerified: row.is_verified,
    ...(row.verified_at ? { verifiedAt: instant(row.verified_at) } : {}), effectiveFrom: instant(row.effective_from), ...(row.effective_until ? { effectiveUntil: instant(row.effective_until) } : {}), status: row.status };
}
function addressValue(row: Row): AddressValue {
  return { ...optional(row, { addressType: "address_type", line1: "line1", line2: "line2", line3: "line3", city: "city", region: "region", postalCode: "postal_code", countryCode: "country_code" }),
    ...(row.latitude == null ? {} : { latitude: Number(row.latitude) }), ...(row.longitude == null ? {} : { longitude: Number(row.longitude) }) };
}
function addressLink(row: Row): AddressLink {
  return { id: row.id, tenantId: row.tenant_id, addressId: row.address_id, owner: { entityCode: row.entity_code, ownerTypeId: row.owner_type_id, ownerId: row.owner_id }, address: addressValue(row.address), purpose: row.purpose,
    ...optional(row, { roleQualifier: "role_qualifier", attentionLine: "attention_line" }), isPrimary: row.is_primary, effectiveFrom: instant(row.effective_from), ...(row.effective_until ? { effectiveUntil: instant(row.effective_until) } : {}) };
}

async function lockTarget(table: "contact_link" | "address_link", tenantId: string, id: string, tx: Tx): Promise<boolean> {
  const row = (await query<Row>(sql`SELECT owner_type_id,owner_id FROM ${sql.id("master", table)} WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`, tx))[0];
  if (!row) return false;
  await lockOwner(tenantId, { entityCode: "", ownerTypeId: row.owner_type_id, ownerId: row.owner_id }, tx);
  return true;
}
