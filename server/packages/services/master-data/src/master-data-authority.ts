import { lockMasterDataOwner } from "./master-data-locks.js";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { OwnerCoordinate } from "@athyper/server-contract-master-data";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import { sql, type Transaction } from "kysely";
import { MasterDataError } from "./errors.js";

export type MasterDataAccess = "contact.write" | "address.write" | "profile.read";
export type MasterDataAuthorityTarget = { owner: OwnerCoordinate } | { contactId: string } | { addressLinkId: string };
export type MasterDataAccessAuthorizer<T> = (context: VerifiedRequestContext, access: MasterDataAccess, target: MasterDataAuthorityTarget, transaction: T) => Promise<void>;

/** Sensitive capabilities must be published and granted by IAM; names confer no authority. */
export const MASTER_DATA_SENSITIVE_PERMISSIONS = {
  "contact.write": ["neon.relationship.business_partner.write_contact_sensitive"],
  "address.write": ["neon.relationship.business_partner.write_address_sensitive"],
  "profile.read": ["neon.relationship.business_partner.read_contact_sensitive", "neon.relationship.business_partner.read_address_sensitive"],
} as const;

/** Current authority is independent of a profile's requested historical date. */
export async function resolveMasterDataAuthorityTarget(context: VerifiedRequestContext, target: MasterDataAuthorityTarget, tx: Transaction<Record<string, never>>) {
  if (context.planeKey !== "neon") throw new MasterDataError(403, "MASTER_DATA_SCOPE_UNSUPPORTED", "Neon business-partner scope is required");
  if ("owner" in target && target.owner.entityCode !== "business_partner") throw new MasterDataError(403, "MASTER_DATA_SCOPE_UNSUPPORTED", "Business-partner scope is required");
  // Conservative low-volume pilot coordination. SHARE blocks all inserts/updates/deletes,
  // including owner-registry and organization status changes, until data/effects finish.
  await sql`SELECT control.lock_master_data_owner_registry()`.execute(tx);
  await sql`LOCK TABLE master.business_partner, master.operating_organization,
    master.business_partner_operating_organization_assignment IN SHARE MODE`.execute(tx);
  const link = "contactId" in target ? "master.contact_link" : "master.address_link";
  const identity = "owner" in target ? target.owner : (await sql<{ ownerId: string; ownerTypeId: string }>`
    SELECT owner_id::text AS "ownerId", owner_type_id::text AS "ownerTypeId" FROM ${sql.table(link)}
    WHERE tenant_id=${context.tenantId}::uuid AND id=${"contactId" in target ? target.contactId : target.addressLinkId}::uuid`.execute(tx)).rows[0];
  if (!identity) throw new MasterDataError(404, "contactId" in target ? "CONTACT_NOT_FOUND" : "ADDRESS_LINK_NOT_FOUND", "Target was not found");
  await lockMasterDataOwner(context.tenantId, { entityCode: "business_partner", ...identity }, tx);
  if (!("owner" in target)) {
    // Re-read after waiting: external writers may have changed/deleted the link.
    const locked = (await sql<{ ownerId: string; ownerTypeId: string }>`
      SELECT owner_id::text AS "ownerId", owner_type_id::text AS "ownerTypeId" FROM ${sql.table(link)}
      WHERE tenant_id=${context.tenantId}::uuid AND id=${"contactId" in target ? target.contactId : target.addressLinkId}::uuid
      FOR UPDATE`.execute(tx)).rows[0];
    if (!locked) throw new MasterDataError(404, "contactId" in target ? "CONTACT_NOT_FOUND" : "ADDRESS_LINK_NOT_FOUND", "Target was not found");
    if (locked.ownerId !== identity.ownerId || locked.ownerTypeId !== identity.ownerTypeId) {
      throw new MasterDataError(409, "MASTER_DATA_OWNER_CHANGED", "Target ownership changed; retry with current authority");
    }
  }
  const owner = (await sql<{ id: string }>`SELECT b.id::text FROM master.business_partner b
    JOIN control.owner_type o ON o.id=${identity.ownerTypeId}::uuid AND o.code='business_partner'
      AND o.status='active' AND (o.tenant_id IS NULL OR o.tenant_id=b.tenant_id)
      AND o.target_schema='master' AND o.target_table='business_partner'
      AND o.is_tenant_scoped AND o.tenant_column='tenant_id'
    WHERE b.tenant_id=${context.tenantId}::uuid AND b.id=${identity.ownerId}::uuid`.execute(tx)).rows[0];
  if (!owner) throw new MasterDataError(404, "OWNER_NOT_FOUND", "Owner was not found");
  const scopes = (await sql<{ id: string }>`SELECT DISTINCT a.operating_organization_id::text AS id
    FROM master.business_partner_operating_organization_assignment a
    JOIN master.operating_organization org ON org.tenant_id=a.tenant_id AND org.id=a.operating_organization_id AND org.status='active'
    WHERE a.tenant_id=${context.tenantId}::uuid AND a.business_partner_id=${owner.id}::uuid
      AND a.status='active' AND a.is_active AND a.effective_from<=current_date
      AND (a.effective_until IS NULL OR a.effective_until>current_date)`.execute(tx)).rows;
  if (scopes.length !== 1) throw new MasterDataError(403, "MASTER_DATA_SCOPE_AMBIGUOUS", "A unique effective owner organization is required");
  return { tenantId: context.tenantId, operatingOrganizationId: scopes[0]!.id, recordId: owner.id,
    ownerTypeId: identity.ownerTypeId, ownerEntityCode: "business_partner",
    ...("contactId" in target ? { contactId: target.contactId } : {}),
    ...("addressLinkId" in target ? { addressLinkId: target.addressLinkId } : {}) };
}

export function createMasterDataAuthority(authorizer: Authorizer, metadata: MetadataReader): MasterDataAccessAuthorizer<Transaction<Record<string, never>>> {
  return async (context, access, target, tx) => {
    const resource = await resolveMasterDataAuthorityTarget(context, target, tx);
    const operationKey = access === "profile.read" ? "read" : "update";
    const descriptor = await metadata.getEntityDescriptor(context, "business_partner");
    const operation = descriptor?.operations?.[operationKey];
    const permissionCode = `neon.relationship.business_partner.${operationKey}`;
    if (!descriptor || descriptor.planeKey !== "neon" || descriptor.entityCode !== "business_partner"
      || descriptor.storage.schema !== "master" || descriptor.storage.object !== "business_partner"
      || descriptor.storage.tenantField !== "tenant_id" || descriptor.storage.idField !== "id"
      || operation?.permissionCode !== permissionCode || operation.authorizationMode === "permission_only") {
      throw new MasterDataError(403, "MASTER_DATA_OPERATION_UNAVAILABLE", "A published business-partner operation binding is required");
    }
    if (!context.permissions?.operationBindings?.some(binding => binding.entityCode === "business_partner"
      && binding.operationKey === operationKey && binding.permissionCode === permissionCode)) {
      throw new MasterDataError(403, "MASTER_DATA_OPERATION_UNAVAILABLE", "A published IAM operation binding is required");
    }
    const root = await authorizer.authorize({ context, permissionCode,
      resource: { ...resource, entityCode: "business_partner", resourceCode: "business_partner", operationKey } });
    if (!root.allowed) throw new MasterDataError(403, "FORBIDDEN", "Business-partner operation denied");
    for (const sensitivePermission of MASTER_DATA_SENSITIVE_PERMISSIONS[access]) {
      // Capabilities are not entity operations: omit entityCode/operationKey here.
      const decision = await authorizer.authorize({ context, permissionCode: sensitivePermission, resource });
      if (!decision.allowed) throw new MasterDataError(403, "FORBIDDEN", "Sensitive master-data access denied");
    }
  };
}
