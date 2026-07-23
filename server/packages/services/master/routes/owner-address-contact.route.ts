import type { Request, Response, Router } from "express";
import { sql, type Kysely } from "kysely";
import {
  extractOrgHeaders,
  isUuid,
  resolvePrincipalIdWithJit,
  resolveTenantId,
  verifyBearer,
} from "@athyper/svc-shared";

type OwnerType = "tenant" | "legal_entity" | "company_code";

export interface MasterOwnerAddressContactRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  authorize?: (input: {
    tenantId: string;
    principalId: string;
    permissionCode: string;
    ownerType: OwnerType;
    ownerId: string;
    companyCodeId?: string;
  }) => Promise<boolean>;
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
}

interface OwnerNode {
  ownerType: OwnerType;
  ownerId: string;
  code: string;
  label: string;
  rank: number;
}

const PURPOSES = new Set([
  "bill_to", "bill_from", "ship_to", "ship_from", "place_of_service",
  "remit_to", "correspondence", "notification", "default",
]);
const CHANNELS = new Set(["email", "phone", "fax", "sms", "whatsapp"]);

export function registerMasterOwnerAddressContactRoutes(
  router: Router,
  deps: MasterOwnerAddressContactRouteDeps,
): void {
  const { db, auth, authorize, logger } = deps;

  router.get("/master/owners/:ownerType/:ownerId/address-contact-profile", async (req, res) => {
    try {
      const context = await resolveContext(req, res, db, auth);
      if (!context) return;
      const target = parseOwnerParams(req, res);
      if (!target) return;
      const hierarchy = await resolveHierarchy(db, context.tenantId, target.ownerType, target.ownerId);
      if (!hierarchy) return void res.status(404).json({ error: "OWNER_NOT_FOUND" });

      const companyCodeId = hierarchy.find((node) => node.ownerType === "company_code")?.ownerId;
      const permissionCode = ownerAddressContactPermission(target.ownerType);
      const canManage = authorize
        ? await authorize({ ...context, ...target, permissionCode, ...(companyCodeId ? { companyCodeId } : {}) })
        : false;

      const ownerWalk = JSON.stringify(hierarchy.map((node) => ({
        owner_type: node.ownerType,
        owner_id: node.ownerId,
        source_code: node.code,
        source_label: node.label,
        source_rank: node.rank,
      })));

      const [addresses, channels, people] = await Promise.all([
        sql<Record<string, unknown>>`
          WITH walk AS (
            SELECT x.owner_type, x.owner_id::uuid, x.source_code, x.source_label, x.source_rank::int
            FROM jsonb_to_recordset(${ownerWalk}::jsonb)
              AS x(owner_type text, owner_id text, source_code text, source_label text, source_rank int)
          )
          SELECT al.id AS link_id, al.owner_type, al.owner_id, al.purpose, al.role_qualifier,
                 al.is_primary, al.effective_from, al.effective_until,
                 a.id AS address_id, a.address_type, a.attention_line, a.line1, a.line2, a.line3,
                 a.city, a.region, a.postal_code, a.country_code, a.formatted_address,
                 walk.source_code, walk.source_label, walk.source_rank,
                 (walk.source_rank > 0) AS is_inherited
          FROM walk
          JOIN master.address_link al
            ON al.tenant_id = ${context.tenantId}::uuid
           AND al.owner_type = walk.owner_type AND al.owner_id = walk.owner_id
          JOIN master.address a ON a.tenant_id = al.tenant_id AND a.id = al.address_id
          WHERE a.status = 'active'
            AND al.effective_from <= CURRENT_DATE
            AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
          ORDER BY walk.source_rank, al.purpose, al.role_qualifier NULLS FIRST, al.is_primary DESC
        `.execute(db),
        sql<Record<string, unknown>>`
          WITH walk AS (
            SELECT x.owner_type, x.owner_id::uuid, x.source_code, x.source_label, x.source_rank::int
            FROM jsonb_to_recordset(${ownerWalk}::jsonb)
              AS x(owner_type text, owner_id text, source_code text, source_label text, source_rank int)
          )
          SELECT cl.id AS link_id, cl.owner_type, cl.owner_id, cl.channel_type, cl.value,
                 cl.purpose, cl.role_qualifier, cl.is_primary, cl.is_verified, cl.verified_at,
                 cl.status, walk.source_code, walk.source_label, walk.source_rank,
                 (walk.source_rank > 0) AS is_inherited
          FROM walk
          JOIN master.contact_link cl
            ON cl.tenant_id = ${context.tenantId}::uuid
           AND cl.owner_type = walk.owner_type AND cl.owner_id = walk.owner_id
          WHERE cl.status = 'active'
          ORDER BY walk.source_rank, cl.purpose, cl.role_qualifier NULLS FIRST,
                   cl.channel_type, cl.is_primary DESC
        `.execute(db),
        sql<Record<string, unknown>>`
          WITH walk AS (
            SELECT x.owner_type, x.owner_id::uuid, x.source_code, x.source_label, x.source_rank::int
            FROM jsonb_to_recordset(${ownerWalk}::jsonb)
              AS x(owner_type text, owner_id text, source_code text, source_label text, source_rank int)
          )
          SELECT cp.id, cp.party_type AS owner_type, cp.party_id AS owner_id,
                 cp.contact_name, cp.business_title, cp.contact_role, cp.is_primary, cp.status,
                 walk.source_code, walk.source_label, walk.source_rank,
                 coalesce(array_agg(DISTINCT pcr.role_code) FILTER (WHERE pcr.role_code IS NOT NULL), '{}') AS roles,
                 (walk.source_rank > 0) AS is_inherited
          FROM walk
          JOIN master.party_contact_person cp
            ON cp.tenant_id = ${context.tenantId}::uuid
           AND cp.party_type = walk.owner_type AND cp.party_id = walk.owner_id
          LEFT JOIN master.party_contact_role pcr
            ON pcr.tenant_id = cp.tenant_id AND pcr.party_contact_person_id = cp.id
          WHERE cp.status = 'active'
          GROUP BY cp.id, cp.party_type, cp.party_id, cp.contact_name, cp.business_title,
                   cp.contact_role, cp.is_primary, cp.status,
                   walk.source_code, walk.source_label, walk.source_rank
          ORDER BY walk.source_rank, cp.is_primary DESC, cp.contact_name
        `.execute(db),
      ]);

      return res.json({
        owner: hierarchy[0],
        hierarchy,
        permissions: { canManage, permissionCode },
        addresses: addresses.rows,
        channels: channels.rows,
        people: people.rows,
      });
    } catch (error) {
      logger?.error("master.owner_address_contact.read", { error: String(error) });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to load address and contact profile" });
    }
  });

  router.post("/master/owners/:ownerType/:ownerId/addresses", async (req, res) => {
    try {
      const context = await resolveContext(req, res, db, auth);
      if (!context) return;
      const target = parseOwnerParams(req, res);
      if (!target) return;
      const hierarchy = await resolveHierarchy(db, context.tenantId, target.ownerType, target.ownerId);
      if (!hierarchy) return void res.status(404).json({ error: "OWNER_NOT_FOUND" });
      if (!await canMutate(authorize, context, target, hierarchy)) return void res.status(403).json({ error: "FORBIDDEN" });

      const body = req.body as Record<string, unknown>;
      const purpose = stringValue(body["purpose"]);
      const qualifier = nullableString(body["roleQualifier"] ?? body["role_qualifier"]);
      const addressId = nullableString(body["addressId"] ?? body["address_id"]);
      if (!purpose || !PURPOSES.has(purpose) || purpose === "notification") {
        return void res.status(400).json({ error: "INVALID_PURPOSE" });
      }
      if (addressId && !isUuid(addressId)) return void res.status(400).json({ error: "INVALID_ADDRESS_ID" });
      const line1 = nullableString(body["line1"]);
      if (!addressId && !line1) return void res.status(400).json({ error: "ADDRESS_REQUIRED" });

      const result = await db.transaction().execute(async (trx) => {
        let canonicalAddressId = addressId;
        if (canonicalAddressId) {
          const existing = await trx.selectFrom("master.address").select("id")
            .where("tenant_id", "=", context.tenantId).where("id", "=", canonicalAddressId).executeTakeFirst();
          if (!existing) throw new RequestError(404, "ADDRESS_NOT_FOUND");
        } else {
          const inserted = await sql<{ id: string }>`
            INSERT INTO master.address (
              tenant_id, address_type, attention_line, line1, line2, line3,
              city, region, postal_code, country_code, created_by
            ) VALUES (
              ${context.tenantId}::uuid,
              ${nullableString(body["addressType"] ?? body["address_type"])},
              ${nullableString(body["attentionLine"] ?? body["attention_line"])},
              ${line1}, ${nullableString(body["line2"])}, ${nullableString(body["line3"])},
              ${nullableString(body["city"])}, ${nullableString(body["region"])},
              ${nullableString(body["postalCode"] ?? body["postal_code"])},
              ${nullableString(body["countryCode"] ?? body["country_code"])?.toUpperCase() ?? null},
              ${context.principalId}::uuid
            )
            ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
              WHERE line1 IS NOT NULL AND postal_code IS NOT NULL AND status = 'active'
            DO UPDATE SET updated_at = now(), updated_by = EXCLUDED.created_by
            RETURNING id
          `.execute(trx);
          canonicalAddressId = inserted.rows[0]?.id ?? null;
          if (!canonicalAddressId) throw new Error("address insert returned no id");
        }

        const link = await trx.insertInto("master.address_link").values({
          tenant_id: context.tenantId,
          owner_type: target.ownerType,
          owner_id: target.ownerId,
          address_id: canonicalAddressId,
          purpose,
          role_qualifier: qualifier,
          is_primary: false,
          effective_from: nullableString(body["effectiveFrom"] ?? body["effective_from"]) ?? new Date().toISOString().slice(0, 10),
          created_by: context.principalId,
        }).onConflict((oc) => oc.constraint("address_link_owner_purpose_address_uq").doUpdateSet({ updated_by: context.principalId }))
          .returning("id").executeTakeFirstOrThrow();

        if (body["isPrimary"] !== false && body["is_primary"] !== false) {
          await sql`SELECT master.fn_set_primary_address_link(
            ${context.tenantId}::uuid, ${String(link.id)}::uuid, ${context.principalId}::uuid
          )`.execute(trx);
        }
        return { addressId: canonicalAddressId, linkId: String(link.id) };
      });
      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof RequestError) return res.status(error.status).json({ error: error.code });
      logger?.error("master.owner_address_contact.address_create", { error: String(error) });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to save address" });
    }
  });

  router.post("/master/owners/:ownerType/:ownerId/contact-channels", async (req, res) => {
    try {
      const context = await resolveContext(req, res, db, auth);
      if (!context) return;
      const target = parseOwnerParams(req, res);
      if (!target) return;
      const hierarchy = await resolveHierarchy(db, context.tenantId, target.ownerType, target.ownerId);
      if (!hierarchy) return void res.status(404).json({ error: "OWNER_NOT_FOUND" });
      if (!await canMutate(authorize, context, target, hierarchy)) return void res.status(403).json({ error: "FORBIDDEN" });

      const body = req.body as Record<string, unknown>;
      const channelType = stringValue(body["channelType"] ?? body["channel_type"]);
      const value = stringValue(body["value"]);
      const purpose = stringValue(body["purpose"]) ?? "default";
      const qualifier = nullableString(body["roleQualifier"] ?? body["role_qualifier"]);
      if (!channelType || !CHANNELS.has(channelType) || !value) return void res.status(400).json({ error: "INVALID_CHANNEL" });
      if (!PURPOSES.has(purpose) || !["default", "correspondence", "notification"].includes(purpose)) {
        return void res.status(400).json({ error: "INVALID_PURPOSE" });
      }

      const contact = await db.transaction().execute(async (trx) => {
        const upsert = await sql<{ id: string }>`SELECT master.fn_upsert_contact_link(
          ${context.tenantId}::uuid, ${target.ownerType}, ${target.ownerId}::uuid,
          ${channelType}, ${value}, ${purpose}, ${body["isPrimary"] !== false},
          ${context.principalId}::uuid, ${qualifier}
        ) AS id`.execute(trx);
        const linkId = upsert.rows[0]?.id;
        if (!linkId) throw new Error("contact upsert returned no id");
        if (channelType === "email") {
          const [localPart = "", domain = ""] = value.trim().toLowerCase().split("@", 2);
          if (!localPart || !domain) throw new RequestError(400, "INVALID_EMAIL");
          await trx.insertInto("master.contact_email").values({
            tenant_id: context.tenantId, contact_link_id: linkId,
            local_part: localPart, domain, created_by: context.principalId,
          }).onConflict((oc) => oc.columns(["tenant_id", "contact_link_id"]).doNothing()).execute();
        } else {
          if (!/^\+[1-9]\d{1,14}$/.test(value)) throw new RequestError(400, "INVALID_PHONE");
          await trx.insertInto("master.contact_phone").values({
            tenant_id: context.tenantId, contact_link_id: linkId,
            e164: value, created_by: context.principalId,
          }).onConflict((oc) => oc.columns(["tenant_id", "contact_link_id"]).doNothing()).execute();
        }
        return { linkId };
      });
      return res.status(201).json(contact);
    } catch (error) {
      if (error instanceof RequestError) return res.status(error.status).json({ error: error.code });
      logger?.error("master.owner_address_contact.contact_create", { error: String(error) });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to save contact channel" });
    }
  });

  router.post("/master/contact-links/:linkId/set-primary", contactCommand("primary", deps));
  router.post("/master/contact-links/:linkId/verify", contactCommand("verify", deps));
  router.post("/master/contact-links/:linkId/deactivate", contactCommand("deactivate", deps));
}

function contactCommand(
  command: "primary" | "verify" | "deactivate",
  deps: MasterOwnerAddressContactRouteDeps,
) {
  return async (req: Request, res: Response) => {
    try {
      const context = await resolveContext(req, res, deps.db, deps.auth);
      if (!context) return;
      const linkId = paramValue(req.params["linkId"]);
      if (!isUuid(linkId)) return void res.status(400).json({ error: "INVALID_LINK_ID" });
      const link = await deps.db.selectFrom("master.contact_link")
        .select(["owner_type", "owner_id"]).where("tenant_id", "=", context.tenantId)
        .where("id", "=", linkId).executeTakeFirst() as { owner_type: OwnerType; owner_id: string } | undefined;
      if (!link || !isOwnerType(link.owner_type)) return void res.status(404).json({ error: "CONTACT_NOT_FOUND" });
      const hierarchy = await resolveHierarchy(deps.db, context.tenantId, link.owner_type, link.owner_id);
      if (!hierarchy || !await canMutate(deps.authorize, context, { ownerType: link.owner_type, ownerId: link.owner_id }, hierarchy)) {
        return void res.status(403).json({ error: "FORBIDDEN" });
      }
      if (command === "primary") {
        await sql`SELECT master.fn_set_primary_contact_link(${context.tenantId}::uuid, ${linkId}::uuid, ${context.principalId}::uuid)`.execute(deps.db);
      } else if (command === "verify") {
        await sql`SELECT master.fn_verify_contact_link(${context.tenantId}::uuid, ${linkId}::uuid, ${context.principalId}::uuid)`.execute(deps.db);
      } else {
        await deps.db.updateTable("master.contact_link").set({ status: "inactive", status_changed_by: context.principalId, updated_by: context.principalId })
          .where("tenant_id", "=", context.tenantId).where("id", "=", linkId).execute();
      }
      return res.json({ ok: true });
    } catch (error) {
      deps.logger?.error(`master.owner_address_contact.contact_${command}`, { error: String(error) });
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  };
}

async function resolveContext(
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  auth: MasterOwnerAddressContactRouteDeps["auth"],
): Promise<{ tenantId: string; principalId: string } | null> {
  const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
  if (!claims) return null;
  const { xOrg, xRealm } = extractOrgHeaders(req);
  const tenantId = await resolveTenantId(db, xOrg, xRealm);
  if (!tenantId) { res.status(400).json({ error: "TENANT_REQUIRED" }); return null; }
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!sub) { res.status(401).json({ error: "PRINCIPAL_REQUIRED" }); return null; }
  const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);
  return { tenantId, principalId };
}

function parseOwnerParams(req: Request, res: Response): { ownerType: OwnerType; ownerId: string } | null {
  const ownerType = paramValue(req.params["ownerType"]);
  const ownerId = paramValue(req.params["ownerId"]);
  if (!isOwnerType(ownerType) || !isUuid(ownerId)) {
    res.status(400).json({ error: "INVALID_OWNER" });
    return null;
  }
  return { ownerType, ownerId };
}

function isOwnerType(value: string): value is OwnerType {
  return value === "tenant" || value === "legal_entity" || value === "company_code";
}

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

async function resolveHierarchy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>, tenantId: string, ownerType: OwnerType, ownerId: string,
): Promise<OwnerNode[] | null> {
  if (ownerType === "tenant") {
    const row = await db.selectFrom("master.tenant").select(["id", "code", "name"])
      .where("id", "=", ownerId).where("id", "=", tenantId).executeTakeFirst();
    return row ? [{ ownerType, ownerId, code: String(row.code), label: String(row.name), rank: 0 }] : null;
  }
  if (ownerType === "legal_entity") {
    const row = await db.selectFrom("master.legal_entity as le").innerJoin("master.tenant as t", "t.id", "le.tenant_id")
      .select(["le.id", "le.code", "le.name", "t.id as tenant_id", "t.code as tenant_code", "t.name as tenant_name"])
      .where("le.tenant_id", "=", tenantId).where("le.id", "=", ownerId).executeTakeFirst();
    return row ? [
      { ownerType, ownerId, code: String(row.code), label: String(row.name), rank: 0 },
      { ownerType: "tenant", ownerId: String(row.tenant_id), code: String(row.tenant_code), label: String(row.tenant_name), rank: 1 },
    ] : null;
  }
  const row = await db.selectFrom("master.company_code as cc")
    .innerJoin("master.legal_entity as le", (join) => join.onRef("le.id", "=", "cc.legal_entity_id").onRef("le.tenant_id", "=", "cc.tenant_id"))
    .innerJoin("master.tenant as t", "t.id", "cc.tenant_id")
    .select(["cc.id", "cc.code", "cc.name", "le.id as le_id", "le.code as le_code", "le.name as le_name",
      "t.id as tenant_id", "t.code as tenant_code", "t.name as tenant_name"])
    .where("cc.tenant_id", "=", tenantId).where("cc.id", "=", ownerId).executeTakeFirst();
  return row ? [
    { ownerType, ownerId, code: String(row.code), label: String(row.name), rank: 0 },
    { ownerType: "legal_entity", ownerId: String(row.le_id), code: String(row.le_code), label: String(row.le_name), rank: 1 },
    { ownerType: "tenant", ownerId: String(row.tenant_id), code: String(row.tenant_code), label: String(row.tenant_name), rank: 2 },
  ] : null;
}

async function canMutate(
  authorize: MasterOwnerAddressContactRouteDeps["authorize"],
  context: { tenantId: string; principalId: string },
  target: { ownerType: OwnerType; ownerId: string },
  hierarchy: OwnerNode[],
): Promise<boolean> {
  if (!authorize) return false;
  const companyCodeId = hierarchy.find((node) => node.ownerType === "company_code")?.ownerId;
  return authorize({ ...context, ...target, permissionCode: ownerAddressContactPermission(target.ownerType), ...(companyCodeId ? { companyCodeId } : {}) });
}

export function ownerAddressContactPermission(ownerType: OwnerType): string {
  if (ownerType === "tenant") return "ADDRESS_CONTACT.TENANT.MANAGE";
  if (ownerType === "legal_entity") return "ADDRESS_CONTACT.LEGAL_ENTITY.MANAGE";
  return "ADDRESS_CONTACT.COMPANY_CODE.MANAGE";
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function nullableString(value: unknown): string | null {
  return stringValue(value);
}

class RequestError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
