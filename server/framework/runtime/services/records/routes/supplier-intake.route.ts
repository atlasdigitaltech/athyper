/**
 * Supplier Intake Route — composite multi-entity onboarding
 *
 * POST /api/records/supplier/check-duplicates  — pre-submit duplicate check
 * POST /api/records/supplier/intake            — composite transactional create
 *
 * The composite route inserts master.supplier plus all related child / link
 * rows in one DB transaction. If any restricted section (tax, banking,
 * governance) fails a permission check the whole request is rejected before
 * the transaction starts.
 *
 * Security
 *   Protected fields (code, status, approval / risk / AML flags) are stripped
 *   from the client payload and set by the server.
 *   Tax profile writes require  supplier.tax.submit.
 *   Banking writes require      supplier.banking.submit.
 *   Governance writes require   supplier.governance.write.
 *   is_verified on bank accounts is always forced to false at intake.
 *
 * Idempotency
 *   Client sends Idempotency-Key header (wizard's stable flowRunId).
 *   Second submission with the same key within 60 min returns the cached result.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  extractOrgHeaders,
  resolveTenantId,
  resolvePrincipalIdWithJit,
  resolveFieldMap,
  emitOutboxEvent,
} from "@athyper/svc-shared";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface SupplierIntakeDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    info(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROTECTED_SUPPLIER_FIELDS = new Set([
  "code", "status", "is_approved_supplier", "is_preferred_supplier",
  "is_blocked", "risk_tier", "sanctions_status", "aml_kyc_status",
  "profile_completeness_pct", "onboarding_status",
  // is_payment_ready is UI-only (banking section toggle); anticipated_risk_tier persists.
  "is_payment_ready",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripProtected(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!PROTECTED_SUPPLIER_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

function remapFields(
  data: Record<string, unknown>,
  fieldMap: Map<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[fieldMap.get(k) ?? k] = v;
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hasPermission(
  db: Kysely<any>,
  tenantId: string,
  principalId: string,
  code: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("shared.role_permission as rp")
    .innerJoin("shared.principal_role as pr", "pr.role_id", "rp.role_id")
    .where("pr.tenant_id", "=", tenantId)
    .where("pr.principal_id", "=", principalId)
    .where("rp.permission_code", "=", code)
    .limit(1)
    .executeTakeFirst();
  return !!row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateSupplierCode(db: Kysely<any>, tenantId: string): Promise<string> {
  const cc = await db
    .selectFrom("master.company_code as c")
    .select("c.id")
    .where("c.tenant_id", "=", tenantId)
    .where("c.is_primary", "=", true)
    .executeTakeFirst();

  const companyId = cc ? String(cc.id) : "00000000-0000-0000-0000-000000000000";

  const result = await sql<{ code: string }>`
    SELECT master.fn_next_document_number(
      ${tenantId}::uuid,
      ${companyId}::uuid,
      'supplier'
    ) AS code
  `.execute(db);

  const code = result.rows[0]?.code;
  if (!code) {
    // Fallback when numbering series is not yet seeded
    return `SUP-${Date.now().toString(36).toUpperCase()}`;
  }
  return code;
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createSupplierIntakeRoute(router: Router, deps: SupplierIntakeDeps): Router {
  const { db, auth, logger } = deps;

  // ── POST /api/records/supplier/check-duplicates ──────────────────────────
  const checkDuplicatesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = xOrg ? await resolveTenantId(db, xOrg, xRealm) : null;
      if (!tenantId) { res.status(400).json({ error: "TENANT_REQUIRED" }); return; }

      const body = req.body as {
        name?: string;
        legal_name?: string;
        registration_no?: string;
        registration_country_code?: string;
        tax_number?: string;
        identifiers?: Array<{ scheme: string; value: string }>;
      };

      const {
        name = "", legal_name = "", registration_no = "",
        registration_country_code = "", tax_number = "",
        identifiers = [],
      } = body;

      const notices: Array<{ code: string; level: string; message: string; action_hint?: string }> = [];
      const matches: Array<{
        supplier_id: string; code: string; name: string;
        match_type: string; severity: string; matched_field: string; score: number;
      }> = [];

      // ── Exact: registration country + number ─────────────────────────────
      if (registration_country_code && registration_no) {
        const rows = await db
          .selectFrom("master.supplier as s")
          .select(["s.id", "s.code", "s.name"])
          .where("s.tenant_id", "=", tenantId)
          .where("s.registration_country_code", "=", String(registration_country_code))
          .where("s.registration_no", "=", String(registration_no))
          .where("s.status", "!=", "archived")
          .execute();

        for (const row of rows) {
          matches.push({
            supplier_id: String(row.id), code: String(row.code), name: String(row.name),
            match_type: "exact_match", severity: "blocker",
            matched_field: "registration_no", score: 1.0,
          });
          notices.push({
            code: "DUPLICATE_REGISTRATION_NO", level: "blocked",
            message: `Supplier with registration number "${String(registration_no)}" already exists: ${String(row.code)} — ${String(row.name)}.`,
          });
        }
      }

      // ── Exact: identifier scheme + value ─────────────────────────────────
      const idArray = Array.isArray(identifiers) ? identifiers : [];
      for (const ident of idArray) {
        if (!ident.scheme || !ident.value) continue;
        const rows = await db
          .selectFrom("master.party_identifier as pi")
          .innerJoin("master.supplier as s", "s.id", "pi.owner_id")
          .select(["s.id", "s.code", "s.name"])
          .where("s.tenant_id", "=", tenantId)
          .where(sql`pi.owner_type`, "=", "supplier")
          .where("pi.scheme", "=", ident.scheme)
          .where("pi.value", "=", ident.value)
          .where("s.status", "!=", "archived")
          .execute();

        for (const row of rows) {
          if (!matches.find(m => m.supplier_id === String(row.id) && m.matched_field === `identifier.${ident.scheme}`)) {
            matches.push({
              supplier_id: String(row.id), code: String(row.code), name: String(row.name),
              match_type: "exact_match", severity: "blocker",
              matched_field: `identifier.${ident.scheme}`, score: 1.0,
            });
            notices.push({
              code: "DUPLICATE_IDENTIFIER", level: "blocked",
              message: `Existing supplier ${String(row.code)} has the same ${ident.scheme} value "${ident.value}".`,
            });
          }
        }
      }

      // ── Strong: exact normalised legal name ───────────────────────────────
      if (legal_name && String(legal_name).trim().length > 2) {
        const normalised = String(legal_name).trim().toUpperCase().replace(/\s+/g, " ");
        const rows = await db
          .selectFrom("master.supplier as s")
          .select(["s.id", "s.code", "s.name", "s.legal_name"])
          .where("s.tenant_id", "=", tenantId)
          .where(sql`UPPER(TRIM(s.legal_name))`, "=", normalised)
          .where("s.status", "!=", "archived")
          .execute();

        for (const row of rows) {
          if (!matches.find(m => m.supplier_id === String(row.id))) {
            matches.push({
              supplier_id: String(row.id), code: String(row.code), name: String(row.name),
              match_type: "strong_match", severity: "warning",
              matched_field: "legal_name", score: 0.95,
            });
            notices.push({
              code: "SIMILAR_LEGAL_NAME", level: "warning",
              message: `Supplier ${String(row.code)} has an identical legal name "${String(row.legal_name ?? "")}". Verify this is not a duplicate.`,
            });
          }
        }
      }

      // ── Weak: fuzzy name similarity (pg_trgm) ────────────────────────────
      if (name && String(name).trim().length > 3) {
        try {
          const rows = await sql<{ id: string; code: string; name: string; similarity: number }>`
            SELECT s.id::text, s.code, s.name,
                   similarity(s.name, ${String(name)}) AS similarity
            FROM master.supplier s
            WHERE s.tenant_id = ${tenantId}::uuid
              AND s.status != 'archived'
              AND similarity(s.name, ${String(name)}) >= 0.4
              AND similarity(s.name, ${String(name)}) < 0.95
            ORDER BY similarity DESC
            LIMIT 5
          `.execute(db);

          for (const row of rows.rows) {
            if (!matches.find(m => m.supplier_id === row.id)) {
              const sim = Number(row.similarity);
              matches.push({
                supplier_id: row.id, code: row.code, name: row.name,
                match_type: "weak_match", severity: sim >= 0.7 ? "warning" : "info",
                matched_field: "name", score: sim,
              });
              if (sim >= 0.7) {
                notices.push({
                  code: "SIMILAR_NAME", level: "warning",
                  message: `Supplier with similar name exists: ${row.code} — "${row.name}". Confirm this is a different supplier.`,
                });
              }
            }
          }
        } catch {
          // pg_trgm not available — skip fuzzy match silently
        }
      }

      res.json({ notices, matches });
    } catch (err) {
      logger?.error("supplier_check_duplicates_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /api/records/supplier/intake ───────────────────────────────────
  const intakeHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      // Idempotency key is mandatory
      const idempotencyKey = (req.headers["idempotency-key"] as string | undefined)?.trim();
      if (!idempotencyKey) {
        res.status(422).json({
          error: "IDEMPOTENCY_KEY_REQUIRED",
          message: "Idempotency-Key header is required.",
        });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = xOrg ? await resolveTenantId(db, xOrg, xRealm) : null;
      if (!tenantId) { res.status(400).json({ error: "TENANT_REQUIRED" }); return; }

      // Return cached result for duplicate submissions
      const cached = await db
        .selectFrom("control.intake_idempotency as ii")
        .select(["ii.result_payload"])
        .where("ii.tenant_id", "=", tenantId)
        .where("ii.entity_code", "=", "supplier")
        .where("ii.idempotency_key", "=", idempotencyKey)
        .where("ii.expires_at", ">", sql`now()`)
        .executeTakeFirst();

      if (cached) {
        res.status(200).json(cached.result_payload);
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, claims);

      const body = req.body as {
        supplier?: Record<string, unknown>;
        identifiers?: Record<string, unknown>[];
        service_coverage?: Record<string, unknown>[];
        certifications?: Record<string, unknown>[];
        tax_profiles?: Record<string, unknown>[];
        qualification?: Record<string, unknown>;
        contacts?: Record<string, unknown>[];
        contact_channels?: Record<string, unknown>[];
        addresses?: Record<string, unknown>[];
        bank_accounts?: Record<string, unknown>[];
        governance?: Record<string, unknown>[];
      };

      const taxProfiles   = body.tax_profiles   ?? [];
      const bankAccounts  = body.bank_accounts   ?? [];
      const governance    = body.governance      ?? [];

      // Section-level permission checks (before starting the transaction)
      if (taxProfiles.length > 0) {
        const ok = await hasPermission(db, tenantId, principalId, "supplier.tax.submit");
        if (!ok) {
          res.status(403).json({ error: "FORBIDDEN", section: "tax_profiles", required_permission: "supplier.tax.submit" });
          return;
        }
      }
      if (bankAccounts.length > 0) {
        const ok = await hasPermission(db, tenantId, principalId, "supplier.banking.submit");
        if (!ok) {
          res.status(403).json({ error: "FORBIDDEN", section: "bank_accounts", required_permission: "supplier.banking.submit" });
          return;
        }
      }
      if (governance.length > 0) {
        const ok = await hasPermission(db, tenantId, principalId, "supplier.governance.write");
        if (!ok) {
          res.status(403).json({ error: "FORBIDDEN", section: "governance", required_permission: "supplier.governance.write" });
          return;
        }
      }

      // Resolve physical column maps for all entities touched by the transaction
      const [
        supplierFieldMap,
        identifierFieldMap,
        coverageFieldMap,
        taxProfileFieldMap,
        certificationFieldMap,
        contactPersonFieldMap,
        governanceFieldMap,
      ] = await Promise.all([
        resolveFieldMap(db, "supplier"),
        resolveFieldMap(db, "supplier_identifier"),
        resolveFieldMap(db, "supplier_service_coverage"),
        resolveFieldMap(db, "supplier_tax_profile"),
        resolveFieldMap(db, "supplier_certification"),
        resolveFieldMap(db, "supplier_contact_person"),
        resolveFieldMap(db, "supplier_governance"),
      ]);

      const supplierCode = await generateSupplierCode(db, tenantId);

      // ── Transaction ───────────────────────────────────────────────────────
      const result = await db.transaction().execute(async (trx) => {
        const now = new Date().toISOString();

        // 1. Insert master.supplier
        const supplierInput = stripProtected(body.supplier ?? {});
        const supplierRow = remapFields(supplierInput, supplierFieldMap);

        const insertedSupplier = await trx
          .insertInto("master.supplier" as never)
          .values({
            ...supplierRow,
            code: supplierCode,
            status: "pending_onboarding",
            tenant_id: tenantId,
            created_by: principalId,
            created_at: now,
          } as never)
          .returning(["id", "code", "status"] as never[])
          .executeTakeFirstOrThrow();

        const supplierId = String((insertedSupplier as Record<string, unknown>)["id"]);

        // 2. party_identifier rows
        for (const ident of body.identifiers ?? []) {
          await trx
            .insertInto("master.party_identifier" as never)
            .values({
              ...remapFields(ident, identifierFieldMap),
              owner_type: "supplier",
              owner_id: supplierId,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 3. supplier_service_coverage rows
        for (const cov of body.service_coverage ?? []) {
          await trx
            .insertInto("master.supplier_service_coverage" as never)
            .values({
              ...remapFields(cov, coverageFieldMap),
              supplier_id: supplierId,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 4. party_tax_profile rows (strip protected; map columns)
        for (const tax of taxProfiles) {
          await trx
            .insertInto("master.party_tax_profile" as never)
            .values({
              ...remapFields(stripProtected(tax), taxProfileFieldMap),
              owner_type: "supplier",
              owner_id: supplierId,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 5. supplier_qualification singleton — all defaults, ignore client payload
        await trx
          .insertInto("master.supplier_qualification" as never)
          .values({
            supplier_id: supplierId,
            onboarding_status: "pending",
            is_approved_supplier: false,
            is_preferred_supplier: false,
            is_blocked: false,
            sanctions_status: "pending",
            aml_kyc_status: "pending",
            risk_tier: "standard",
            profile_completeness_pct: 0,
            status: "active",
            tenant_id: tenantId,
            created_by: principalId,
            created_at: now,
          } as never)
          .execute();

        // 6. party_contact_person rows — collect IDs for contact_channels linking
        const contactPersonIds: string[] = [];
        for (const contact of body.contacts ?? []) {
          const inserted = await trx
            .insertInto("master.party_contact_person" as never)
            .values({
              ...remapFields(contact, contactPersonFieldMap),
              party_type: "supplier",
              party_id: supplierId,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .returning(["id"] as never[])
            .executeTakeFirst();

          if (inserted) {
            contactPersonIds.push(String((inserted as Record<string, unknown>)["id"]));
          }
        }

        // 7. contact_link rows (email / phone / fax channels)
        for (const ch of body.contact_channels ?? []) {
          const refIdx = ch["contact_ref_index"];
          const contactPersonId =
            typeof refIdx === "number" && contactPersonIds[refIdx]
              ? contactPersonIds[refIdx]
              : contactPersonIds[0];

          if (!contactPersonId) continue;

          await trx
            .insertInto("master.contact_link" as never)
            .values({
              party_type: "contact_person",
              party_id: contactPersonId,
              channel_type: ch["channel_type"],
              value: ch["value"],
              label: ch["label"] ?? null,
              is_primary: ch["is_primary"] ?? false,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 8. address + address_link rows
        for (const addr of body.addresses ?? []) {
          const insertedAddr = await trx
            .insertInto("master.address" as never)
            .values({
              line1:        addr["line1"]        ?? addr["address_line1"] ?? null,
              line2:        addr["line2"]        ?? addr["address_line2"] ?? null,
              city:         addr["city"]         ?? null,
              region:       addr["region"]       ?? addr["state_region"]  ?? null,
              postal_code:  addr["postal_code"]  ?? null,
              country_code: addr["country_code"] ?? null,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .returning(["id"] as never[])
            .executeTakeFirst();

          if (!insertedAddr) continue;
          const addressId = String((insertedAddr as Record<string, unknown>)["id"]);

          await trx
            .insertInto("master.address_link" as never)
            .values({
              owner_type: "supplier",
              owner_id: supplierId,
              address_id: addressId,
              address_type: addr["address_type"] ?? "registered",
              is_primary: addr["is_primary"] ?? false,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 9. certification rows
        for (const cert of body.certifications ?? []) {
          await trx
            .insertInto("master.certification" as never)
            .values({
              ...remapFields(cert, certificationFieldMap),
              owner_type: "supplier",
              owner_id: supplierId,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 10. bank_account + bank_account_link rows (is_verified always false at intake)
        for (const ba of bankAccounts) {
          const insertedAcct = await trx
            .insertInto("master.bank_account" as never)
            .values({
              bank_name: ba["bank_name"] ?? null,
              account_number: ba["account_number"],
              currency_code: ba["currency_code"],
              account_holder_name: ba["account_holder_name"] ?? null,
              account_id_type: ba["account_id_type"] ?? null,
              bic_override: ba["bic_override"] ?? null,
              is_verified: false,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .returning(["id"] as never[])
            .executeTakeFirst();

          if (!insertedAcct) continue;
          const bankAccountId = String((insertedAcct as Record<string, unknown>)["id"]);

          await trx
            .insertInto("master.bank_account_link" as never)
            .values({
              owner_type: "supplier",
              owner_id: supplierId,
              bank_account_id: bankAccountId,
              purpose: ba["purpose"] ?? "default",
              is_primary: ba["is_primary"] ?? false,
              effective_from: ba["effective_from"] ?? null,
              effective_until: ba["effective_until"] ?? null,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 11. party_governance_relation rows
        for (const gov of governance) {
          await trx
            .insertInto("master.party_governance_relation" as never)
            .values({
              ...remapFields(gov, governanceFieldMap),
              party_type: "supplier",
              party_id: supplierId,
              tenant_id: tenantId,
              created_by: principalId,
              created_at: now,
            } as never)
            .execute();
        }

        // 12. Workflow event
        await emitOutboxEvent(trx, {
          tenantId,
          topic: "workflow",
          entityId: supplierId,
          eventType: "supplier_request.submitted",
          payload: { supplier_code: supplierCode, created_by: principalId },
          actorId: principalId,
        });

        return {
          supplier_id: supplierId,
          supplier_code: supplierCode,
          status: "pending_onboarding",
        };
      });

      // Store idempotency record (best-effort — failure does not roll back)
      try {
        await db
          .insertInto("control.intake_idempotency" as never)
          .values({
            tenant_id: tenantId,
            entity_code: "supplier",
            idempotency_key: idempotencyKey,
            result_payload: result,
          } as never)
          .execute();
      } catch {
        logger?.warn("supplier_intake_idempotency_store_failed", { idempotencyKey });
      }

      logger?.info("supplier.intake.submitted", {
        tenantId,
        supplierId: result.supplier_id,
        supplierCode: result.supplier_code,
        principalId,
        sections: {
          identifiers:      (body.identifiers      ?? []).length,
          service_coverage: (body.service_coverage ?? []).length,
          certifications:   (body.certifications   ?? []).length,
          tax_profiles:     taxProfiles.length,
          contacts:         (body.contacts         ?? []).length,
          contact_channels: (body.contact_channels ?? []).length,
          addresses:        (body.addresses        ?? []).length,
          bank_accounts:    bankAccounts.length,
          governance:       governance.length,
        },
      });

      res.status(201).json(result);
    } catch (err) {
      logger?.error("supplier_intake_error", { err: String(err) });
      next(err);
    }
  };

  router.post("/records/supplier/check-duplicates", checkDuplicatesHandler);
  router.post("/records/supplier/intake", intakeHandler);

  return router;
}
