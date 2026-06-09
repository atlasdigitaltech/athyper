/**
 * GET /api/master/contacts
 *
 * Returns contact persons (master.party_contact_person) with their channel
 * links (master.contact_link + contact_email/contact_phone extensions) for a
 * given parent entity record.
 *
 * Query params:
 *   contact_entity_code  – entity_code of the contact person entity
 *                          (e.g. "business_partner_contact_person"). Also used as the
 *                          owner_type on contact_link rows.
 *   parent_id            – UUID of the parent record (party_id FK).
 *   party_type_filter    – optional discriminator on party_contact_person.party_type
 *                          (e.g. "business_partner" | "supplier" | "customer").
 */

import type { Router } from "express";
import type { Kysely } from "kysely";
import { verifyBearer, isUuid, resolveTenantId } from "@athyper/svc-shared";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface MasterContactsRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:     Kysely<any>;
  auth:   { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
}

// ── Internal row types ────────────────────────────────────────────────────────

interface ContactPersonRow {
  id:             string;
  contact_name:   string;
  business_title: string | null;
  contact_role:   string | null;
  is_primary:     boolean;
  status:         string;
  created_at:     string;
  created_by:     string;
  updated_at:     string | null;
  updated_by:     string | null;
  status_changed_at: string | null;
}

interface ChannelRow {
  id:           string;
  contact_id:   string;
  channel_type: string;
  value:        string;
  purpose:      string | null;
  is_primary:   boolean;
  is_verified:  boolean;
  verified_at:  string | null;
  status:       string;
  local_part:   string | null;
  domain:       string | null;
  mx_valid:     boolean | null;
  bounce_count: number | null;
  last_bounce_at: string | null;
  e164:         string | null;
  calling_code: string | null;
  national_number: string | null;
  carrier_hint: string | null;
  line_type:    string | null;
}

interface ContactRoleRow {
  party_contact_person_id: string;
  role_code: string;
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function registerMasterContactsRoutes(router: Router, deps: MasterContactsRouteDeps): void {
  const { db, auth, logger } = deps;

  router.get("/master/contacts", async (req, res) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg    = req.headers["x-org"]   as string | undefined;
      const xRealm  = req.headers["x-realm"] as string | undefined;
      const tenantId = await resolveTenantId(db, xOrg ?? "", xRealm ?? "athyper");
      if (!tenantId) {
        return res.status(400).json({ error: "TENANT_REQUIRED", message: "Tenant resolution failed" });
      }

      const q                 = req.query as Record<string, string>;
      const contactEntityCode = q["contact_entity_code"] ?? "";
      const parentId          = q["parent_id"]           ?? "";
      const partyTypeFilter   = q["party_type_filter"]   ?? null;

      if (!contactEntityCode) {
        return res.status(400).json({ error: "MISSING_PARAM", message: "contact_entity_code is required" });
      }
      if (!parentId || !isUuid(parentId)) {
        return res.status(400).json({ error: "INVALID_PARAM", message: "parent_id must be a valid UUID" });
      }

      // ── 1. Fetch contact persons ───────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let contactsQuery: any = db
        .selectFrom("master.party_contact_person as cp")
        .select([
          "cp.id",
          "cp.contact_name",
          "cp.business_title",
          "cp.contact_role",
          "cp.is_primary",
          "cp.status",
          "cp.created_at",
          "cp.created_by",
          "cp.updated_at",
          "cp.updated_by",
          "cp.status_changed_at",
        ])
        .where("cp.tenant_id", "=", tenantId)
        .where("cp.party_id",  "=", parentId)
        .where("cp.is_active", "=", true);

      if (partyTypeFilter) {
        contactsQuery = contactsQuery.where("cp.party_type", "=", partyTypeFilter);
      }

      const contacts = await contactsQuery
        .orderBy("cp.is_primary", "desc")
        .orderBy("cp.contact_name", "asc")
        .execute() as ContactPersonRow[];

      if (contacts.length === 0) {
        return res.json({
          contacts: [],
          summary:  { total_contacts: 0, verified_channel_count: 0 },
        });
      }

      // ── 2. Fetch channels for all contacts in one query ────────────────────
      const contactIds = contacts.map((c) => c.id);

      const roles = await db
        .selectFrom("master.party_contact_role as pcr")
        .select([
          "pcr.party_contact_person_id",
          "pcr.role_code",
        ])
        .where("pcr.tenant_id", "=", tenantId)
        .where("pcr.party_contact_person_id", "in", contactIds)
        .orderBy("pcr.role_code", "asc")
        .execute() as ContactRoleRow[];

      const channels = await db
        .selectFrom("master.contact_link as cl")
        .leftJoin("master.contact_email as ce", (j) =>
          j
            .onRef("ce.contact_link_id", "=", "cl.id")
            .on("ce.tenant_id", "=", tenantId),
        )
        .leftJoin("master.contact_phone as cph", (j) =>
          j
            .onRef("cph.contact_link_id", "=", "cl.id")
            .on("cph.tenant_id", "=", tenantId),
        )
        .select([
          "cl.id",
          "cl.owner_id as contact_id",
          "cl.channel_type",
          "cl.value",
          "cl.purpose",
          "cl.is_primary",
          "cl.is_verified",
          "cl.verified_at",
          "cl.status",
          "ce.local_part",
          "ce.domain",
          "ce.mx_valid",
          "ce.bounce_count",
          "ce.last_bounce_at",
          "cph.e164",
          "cph.calling_code",
          "cph.national_number",
          "cph.carrier_hint",
          "cph.line_type",
        ])
        .where("cl.tenant_id",  "=", tenantId)
        .where("cl.owner_type", "=", contactEntityCode)
        .where("cl.owner_id",   "in", contactIds)
        .where("cl.is_active",  "=", true)
        .orderBy("cl.is_primary", "desc")
        .orderBy("cl.channel_type", "asc")
        .execute() as ChannelRow[];

      // ── 3. Group channels by contact and build response ────────────────────
      const channelsByContact = new Map<string, ChannelRow[]>();
      for (const ch of channels) {
        const arr = channelsByContact.get(ch.contact_id) ?? [];
        arr.push(ch);
        channelsByContact.set(ch.contact_id, arr);
      }

      const rolesByContact = new Map<string, string[]>();
      for (const role of roles) {
        const arr = rolesByContact.get(role.party_contact_person_id) ?? [];
        if (!arr.includes(role.role_code)) arr.push(role.role_code);
        rolesByContact.set(role.party_contact_person_id, arr);
      }

      const result = contacts.map((cp) => ({
        ...cp,
        roles: [
          ...new Set([
            ...(cp.contact_role ? [cp.contact_role] : []),
            ...(rolesByContact.get(cp.id) ?? []),
          ]),
        ],
        channels: channelsByContact.get(cp.id) ?? [],
      }));

      const verifiedCount = channels.filter((c) => c.is_verified).length;

      return res.json({
        contacts: result,
        summary:  {
          total_contacts: contacts.length,
          total_channels: channels.length,
          verified_channel_count: verifiedCount,
          primary_count: contacts.filter((c) => c.is_primary).length,
        },
      });

    } catch (err) {
      logger?.error("master.contacts.get", { error: String(err) });
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch contacts" });
    }
  });
}
