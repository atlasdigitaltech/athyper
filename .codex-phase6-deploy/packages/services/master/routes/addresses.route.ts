/**
 * GET /api/master/addresses
 *
 * Returns physical addresses (master.address) with their link rows
 * (master.address_link) for a given polymorphic owner, grouped by
 * address_id so one physical address shared across multiple purposes
 * appears as one card.
 *
 * Query params:
 *   owner_type          – polymorphic discriminator (e.g. "business_partner")
 *   owner_id            – UUID of the owner record
 *   include_expired     – "true" to include links where effective_until < today
 *                         (default: false — only active/open-ended links)
 *
 * PATCH /api/master/addresses/links/:linkId/set-primary
 *   Sets is_primary=true on the given address_link row (and clears
 *   existing primaries for the same owner+purpose).
 *
 * PATCH /api/master/addresses/links/:linkId/end-date
 *   Sets effective_until=today on the given address_link row.
 */

import type { Router } from "express";
import { sql, type Kysely } from "kysely";
import { verifyBearer, isUuid, resolveTenantId, resolvePrincipalIdWithJit } from "@athyper/svc-shared";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface MasterAddressesRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:     Kysely<any>;
  auth:   { verifyToken(token: string): Promise<Record<string, unknown>> };
  authorizeMutation?: (input: {
    tenantId: string; principalId: string; ownerType: string; ownerId: string;
  }) => Promise<boolean>;
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
}

// ── Internal row types ────────────────────────────────────────────────────────

interface AddressRawRow {
  link_id:          string;
  purpose:          string;
  is_primary:       boolean;
  effective_from:   string;
  effective_until:  string | null;
  address_id:       string;
  code:             string | null;
  status:           string;
  address_type:     string | null;
  attention_line:   string | null;
  line1:            string | null;
  line2:            string | null;
  line3:            string | null;
  city:             string | null;
  region:           string | null;
  postal_code:      string | null;
  country_code:     string | null;
  formatted_address: string | null;
  latitude:         number | null;
  longitude:        number | null;
  metadata:         Record<string, unknown> | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  status_changed_by_name: string | null;
  created_at:       string;
  created_by:       string;
  created_by_name:  string | null;
  updated_at:       string | null;
  updated_by:       string | null;
  updated_by_name:  string | null;
}

// ── Response types (public contract) ─────────────────────────────────────────

interface AddressLinkInfo {
  link_id:        string;
  purpose:        string;
  is_primary:     boolean;
  effective_from: string;
  effective_until: string | null;
}

interface AddressGrouped {
  address_id:        string;
  code:              string | null;
  status:            string;
  address_type:      string | null;
  attention_line:    string | null;
  line1:             string | null;
  line2:             string | null;
  line3:             string | null;
  city:              string | null;
  region:            string | null;
  postal_code:       string | null;
  country_code:      string | null;
  formatted_address: string | null;
  latitude:          number | null;
  longitude:         number | null;
  metadata:          Record<string, unknown>;
  status_changed_at: string | null;
  status_changed_by: string | null;
  status_changed_by_name: string | null;
  status_changed_count: number;
  created_at:        string;
  created_by:        string;
  created_by_name:   string | null;
  updated_at:        string | null;
  updated_by:        string | null;
  updated_by_name:   string | null;
  links:             AddressLinkInfo[];
  is_primary:        boolean;
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function registerMasterAddressRoutes(router: Router, deps: MasterAddressesRouteDeps): void {
  const { db, auth, authorizeMutation, logger } = deps;

  // ── GET /master/addresses ─────────────────────────────────────────────────

  router.get("/master/addresses", async (req, res) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg    = req.headers["x-org"]   as string | undefined;
      const xRealm  = req.headers["x-realm"] as string | undefined;
      const tenantId = await resolveTenantId(db, xOrg ?? "", xRealm ?? "athyper");
      if (!tenantId) {
        return res.status(400).json({ error: "TENANT_REQUIRED", message: "Tenant resolution failed" });
      }

      const q              = req.query as Record<string, string>;
      const ownerType      = q["owner_type"]      ?? "";
      const ownerId        = q["owner_id"]        ?? "";
      const includeExpired = q["include_expired"] === "true";

      if (!ownerType) {
        return res.status(400).json({ error: "MISSING_PARAM", message: "owner_type is required" });
      }
      if (!ownerId || !isUuid(ownerId)) {
        return res.status(400).json({ error: "INVALID_PARAM", message: "owner_id must be a valid UUID" });
      }

      // ── Query: address_link JOIN address ──────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = db
        .selectFrom("master.address_link as al")
        .innerJoin("master.address as a", (j) =>
          j
            .onRef("a.id", "=", "al.address_id")
            .on("a.tenant_id", "=", tenantId),
        )
        .leftJoin("master.principal_profile as created_profile", (j) =>
          j
            .onRef("created_profile.principal_id", "=", "a.created_by")
            .on("created_profile.tenant_id", "=", tenantId),
        )
        .leftJoin("master.principal_profile as updated_profile", (j) =>
          j
            .onRef("updated_profile.principal_id", "=", "a.updated_by")
            .on("updated_profile.tenant_id", "=", tenantId),
        )
        .leftJoin("master.principal_profile as status_profile", (j) =>
          j
            .onRef("status_profile.principal_id", "=", "a.status_changed_by")
            .on("status_profile.tenant_id", "=", tenantId),
        )
        .select([
          "al.id as link_id",
          "al.purpose",
          "al.is_primary",
          "al.effective_from",
          "al.effective_until",
          "a.id as address_id",
          "a.code",
          "a.status",
          "a.address_type",
          "a.attention_line",
          "a.line1",
          "a.line2",
          "a.line3",
          "a.city",
          "a.region",
          "a.postal_code",
          "a.country_code",
          "a.formatted_address",
          "a.latitude",
          "a.longitude",
          "a.metadata",
          "a.status_changed_at",
          "a.status_changed_by",
          "status_profile.display_name as status_changed_by_name",
          "a.created_at",
          "a.created_by",
          "created_profile.display_name as created_by_name",
          "a.updated_at",
          "a.updated_by",
          "updated_profile.display_name as updated_by_name",
        ])
        .where("al.tenant_id",  "=", tenantId)
        .where("al.owner_type", "=", ownerType)
        .where("al.owner_id",   "=", ownerId)
        .where("a.status",      "=", "active");

      if (!includeExpired) {
        // Only links that are currently active: effective_until IS NULL or >= today
        query = query.where((eb: any) =>
          eb.or([
            eb("al.effective_until", "is", null),
            eb("al.effective_until", ">", new Date().toISOString().slice(0, 10)),
          ]),
        );
      }

      const rows = await query
        .orderBy("al.is_primary", "desc")
        .orderBy("al.effective_from", "asc")
        .execute() as AddressRawRow[];

      // ── Group by address_id ───────────────────────────────────────────────
      const addrMap = new Map<string, AddressGrouped>();

      for (const row of rows) {
        let grp = addrMap.get(row.address_id);
        if (!grp) {
          grp = {
            address_id:        row.address_id,
            code:              row.code,
            status:            row.status,
            address_type:      row.address_type,
            attention_line:    row.attention_line,
            line1:             row.line1,
            line2:             row.line2,
            line3:             row.line3,
            city:              row.city,
            region:            row.region,
            postal_code:       row.postal_code,
            country_code:      row.country_code,
            formatted_address: row.formatted_address,
            latitude:          row.latitude,
            longitude:         row.longitude,
            metadata:          (row.metadata ?? {}) as Record<string, unknown>,
            status_changed_at: row.status_changed_at,
            status_changed_by: row.status_changed_by,
            status_changed_by_name: row.status_changed_by_name,
            status_changed_count: row.status_changed_at ? 1 : 0,
            created_at:        row.created_at,
            created_by:        row.created_by,
            created_by_name:   row.created_by_name,
            updated_at:        row.updated_at,
            updated_by:        row.updated_by,
            updated_by_name:   row.updated_by_name,
            links:             [],
            is_primary:        false,
          };
          addrMap.set(row.address_id, grp);
        }

        grp.links.push({
          link_id:        row.link_id,
          purpose:        row.purpose,
          is_primary:     row.is_primary,
          effective_from: row.effective_from,
          effective_until: row.effective_until,
        });

        if (row.is_primary) grp.is_primary = true;
      }

      const addresses = [...addrMap.values()].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return 0;
      });

      const geocodedCount = addresses.filter((a) => a.latitude != null).length;
      const primaryCount  = addresses.filter((a) => a.is_primary).length;

      return res.json({
        addresses,
        summary: {
          total_addresses: addresses.length,
          primary_count:   primaryCount,
          geocoded_count:  geocodedCount,
        },
      });

    } catch (err) {
      logger?.error("master.addresses.get", { error: String(err) });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch addresses" });
    }
  });

  // ── PATCH /master/addresses/links/:linkId/set-primary ─────────────────────
  // Promotes the given link to is_primary=true for its owner+purpose.
  // Clears any other is_primary=true links for the same owner+purpose+period
  // by setting them to false first (avoids EXCLUDE constraint collision).

  router.patch("/master/addresses/links/:linkId/set-primary", async (req, res) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg    = req.headers["x-org"]   as string | undefined;
      const xRealm  = req.headers["x-realm"] as string | undefined;
      const tenantId = await resolveTenantId(db, xOrg ?? "", xRealm ?? "athyper");
      if (!tenantId) {
        return res.status(400).json({ error: "TENANT_REQUIRED", message: "Tenant resolution failed" });
      }

      const { linkId } = req.params as { linkId: string };
      if (!isUuid(linkId)) {
        return res.status(400).json({ error: "INVALID_PARAM", message: "linkId must be a valid UUID" });
      }

      // Fetch the target link to get owner context
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const target = await (db as any)
        .selectFrom("master.address_link")
        .select(["id", "owner_type", "owner_id", "purpose", "effective_from", "effective_until"])
        .where("id",        "=", linkId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst() as { id: string; owner_type: string; owner_id: string; purpose: string; effective_from: string; effective_until: string | null } | undefined;

      if (!target) {
        return res.status(404).json({ error: "NOT_FOUND", message: "Address link not found" });
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm ?? "athyper", claims) : "";
      if (!principalId || !authorizeMutation || !await authorizeMutation({
        tenantId, principalId, ownerType: target.owner_type, ownerId: target.owner_id,
      })) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      await sql`SELECT master.fn_set_primary_address_link(
        ${tenantId}::uuid, ${linkId}::uuid, ${principalId}::uuid
      )`.execute(db);

      return res.json({ ok: true });

    } catch (err) {
      logger?.error("master.addresses.set_primary", { error: String(err) });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to set primary" });
    }
  });

  // ── PATCH /master/addresses/links/:linkId/end-date ────────────────────────
  // Sets effective_until = today on the given link, closing the validity window.

  router.patch("/master/addresses/links/:linkId/end-date", async (req, res) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg    = req.headers["x-org"]   as string | undefined;
      const xRealm  = req.headers["x-realm"] as string | undefined;
      const tenantId = await resolveTenantId(db, xOrg ?? "", xRealm ?? "athyper");
      if (!tenantId) {
        return res.status(400).json({ error: "TENANT_REQUIRED", message: "Tenant resolution failed" });
      }

      const { linkId } = req.params as { linkId: string };
      if (!isUuid(linkId)) {
        return res.status(400).json({ error: "INVALID_PARAM", message: "linkId must be a valid UUID" });
      }

      const today = new Date().toISOString().slice(0, 10);

      const target = await db.selectFrom("master.address_link")
        .select(["owner_type", "owner_id", "effective_from"])
        .where("tenant_id", "=", tenantId).where("id", "=", linkId).executeTakeFirst();
      if (!target) return res.status(404).json({ error: "NOT_FOUND", message: "Address link not found" });
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm ?? "athyper", claims) : "";
      if (!principalId || !authorizeMutation || !await authorizeMutation({
        tenantId, principalId, ownerType: String(target.owner_type), ownerId: String(target.owner_id),
      })) return res.status(403).json({ error: "FORBIDDEN" });
      if (String(target.effective_from) >= today) {
        return res.status(409).json({
          error: "EMPTY_EFFECTIVE_RANGE",
          message: "A link effective today cannot be end-dated today; remove the pending link instead.",
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (db as any)
        .updateTable("master.address_link")
        .set({ effective_until: today, updated_at: new Date(), updated_by: principalId })
        .where("id",        "=", linkId)
        .where("tenant_id", "=", tenantId)
        .execute();

      if (!result) {
        return res.status(404).json({ error: "NOT_FOUND", message: "Address link not found" });
      }

      return res.json({ ok: true, effective_until: today });

    } catch (err) {
      logger?.error("master.addresses.end_date", { error: String(err) });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to end-date address link" });
    }
  });

  // ── Phase 4 endpoints: candidates / default / for AddressPicker ─────────────

  /**
   * GET /api/master/addresses/candidates?owner_type=...&owner_id=...&purposes=ship_to,default
   *
   * Returns active addresses linked to (owner_type, owner_id) with matching
   * purposes. Used by the AddressPicker UI to populate dropdown tiers.
   */
  router.get("/master/addresses/candidates", async (req, res) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg    = req.headers["x-org"]   as string | undefined;
      const xRealm  = req.headers["x-realm"] as string | undefined;
      const tenantId = await resolveTenantId(db, xOrg ?? "", xRealm ?? "athyper");
      if (!tenantId) return res.status(400).json({ error: "TENANT_RESOLUTION_FAILED" });

      const ownerType = (req.query["owner_type"] as string ?? "").trim();
      const ownerId   = (req.query["owner_id"]   as string ?? "").trim();
      const purposes  = ((req.query["purposes"]  as string ?? "")
                          .split(",").map(s => s.trim()).filter(Boolean));

      if (!ownerType || !isUuid(ownerId) || purposes.length === 0) {
        return res.status(400).json({
          error: "INVALID_PARAMS",
          message: "owner_type, owner_id (uuid), and purposes (csv) are required",
        });
      }

      const r = ownerType === "supplier"
        ? await sql<{
          address_id: string; purpose: string; is_primary: boolean;
          code: string | null; name: string | null;
          line1: string | null; city: string | null; region: string | null;
          country_code: string | null; formatted_address: string | null;
          tax_jurisdiction_id: string | null;
          jurisdiction_name: string | null; jurisdiction_code: string | null;
        }>`
          SELECT
            vsa.address_id,
            vsa.purpose,
            vsa.is_primary,
            vsa.code,
            vsa.name,
            vsa.line1,
            vsa.city,
            vsa.region,
            vsa.country_code,
            vsa.formatted_address,
            vsa.tax_jurisdiction_id,
            tj.name AS jurisdiction_name,
            tj.code AS jurisdiction_code
          FROM master.v_supplier_address vsa
          LEFT JOIN master.tax_jurisdiction tj
            ON tj.id = vsa.tax_jurisdiction_id
           AND tj.tenant_id = vsa.tenant_id
         WHERE vsa.tenant_id = ${tenantId}::uuid
           AND vsa.supplier_id = ${ownerId}::uuid
           AND vsa.purpose = ANY(${purposes}::text[])
         ORDER BY array_position(${purposes}::text[], vsa.purpose),
                  vsa.is_primary DESC NULLS LAST,
                  vsa.line1
        `.execute(db)
        : await sql<{
        address_id: string; purpose: string; is_primary: boolean;
        code: string | null; name: string | null;
        line1: string | null; city: string | null; region: string | null;
        country_code: string | null; formatted_address: string | null;
        tax_jurisdiction_id: string | null;
        jurisdiction_name: string | null; jurisdiction_code: string | null;
      }>`
        SELECT * FROM master.fn_load_address_candidates(
          ${tenantId}::uuid, ${ownerType}, ${ownerId}::uuid, ${purposes}::text[]
        )
      `.execute(db);

      return res.json({ data: r.rows });
    } catch (err) {
      logger?.error("master.addresses.candidates", { error: String(err) });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to load candidates" });
    }
  });

  /**
   * POST /api/master/addresses/default
   *
   * Body: { owner_walk: [{owner_type, owner_id}, ...], purposes: string[] }
   *
   * Walks owner_walk × purposes; returns first matching address + jurisdiction.
   * Used by AddressPicker mount-time default and document snapshot stamping.
   */
  router.post("/master/addresses/default", async (req, res) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg    = req.headers["x-org"]   as string | undefined;
      const xRealm  = req.headers["x-realm"] as string | undefined;
      const tenantId = await resolveTenantId(db, xOrg ?? "", xRealm ?? "athyper");
      if (!tenantId) return res.status(400).json({ error: "TENANT_RESOLUTION_FAILED" });

      const body = req.body as { owner_walk?: unknown; purposes?: unknown };
      const ownerWalk = body.owner_walk;
      const purposes  = body.purposes;

      if (!Array.isArray(ownerWalk) || ownerWalk.length === 0 ||
          !Array.isArray(purposes)  || purposes.length === 0) {
        return res.status(400).json({
          error: "INVALID_BODY",
          message: "owner_walk (jsonb array) and purposes (string[]) required",
        });
      }

      const expandedOwnerWalk = await expandSupplierOwnerWalk(db, tenantId, ownerWalk);

      const r = await sql<{
        address_id: string | null;
        tax_jurisdiction_id: string | null;
        owner_type: string | null;
        owner_id: string | null;
        purpose: string | null;
      }>`
        SELECT * FROM master.fn_resolve_default_address(
          ${tenantId}::uuid,
          ${JSON.stringify(expandedOwnerWalk)}::jsonb,
          ${purposes}::text[]
        )
        LIMIT 1
      `.execute(db);

      const hit = r.rows[0] ?? null;
      return res.json({ data: hit });
    } catch (err) {
      logger?.error("master.addresses.default", { error: String(err) });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to resolve default address" });
    }
  });
}

async function expandSupplierOwnerWalk(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  tenantId: string,
  ownerWalk: unknown[],
): Promise<unknown[]> {
  const expanded: unknown[] = [];

  for (const step of ownerWalk) {
    expanded.push(step);
    if (!step || typeof step !== "object") continue;

    const owner = step as { owner_type?: unknown; owner_id?: unknown };
    if (owner.owner_type !== "supplier" || typeof owner.owner_id !== "string" || !isUuid(owner.owner_id)) {
      continue;
    }

    const supplier = await sql<{ business_partner_id: string | null }>`
      SELECT business_partner_id
        FROM master.supplier
       WHERE tenant_id = ${tenantId}::uuid
         AND id = ${owner.owner_id}::uuid
       LIMIT 1
    `.execute(db);
    const businessPartnerId = supplier.rows[0]?.business_partner_id;
    if (businessPartnerId) {
      expanded.push({ owner_type: "business_partner", owner_id: businessPartnerId });
    }
  }

  return expanded;
}
