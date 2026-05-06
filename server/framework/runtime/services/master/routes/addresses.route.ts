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
import type { Kysely } from "kysely";
import { verifyBearer, isUuid, resolveTenantId } from "@athyper/svc-shared";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface MasterAddressesRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:     Kysely<any>;
  auth:   { verifyToken(token: string): Promise<Record<string, unknown>> };
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
  const { db, auth, logger } = deps;

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
            eb("al.effective_until", ">=", new Date().toISOString().slice(0, 10)),
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

      // Clear existing primaries for the same owner+purpose (avoid EXCLUDE collision)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .updateTable("master.address_link")
        .set({ is_primary: false, updated_at: new Date() })
        .where("tenant_id",  "=", tenantId)
        .where("owner_type", "=", target.owner_type)
        .where("owner_id",   "=", target.owner_id)
        .where("purpose",    "=", target.purpose)
        .where("is_primary", "=", true)
        .where("id",         "!=", linkId)
        .execute();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .updateTable("master.address_link")
        .set({ is_primary: true, updated_at: new Date() })
        .where("id",        "=", linkId)
        .where("tenant_id", "=", tenantId)
        .execute();

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (db as any)
        .updateTable("master.address_link")
        .set({ effective_until: today, updated_at: new Date() })
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
}
