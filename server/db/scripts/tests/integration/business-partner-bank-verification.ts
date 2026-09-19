/** Native repository/constraint proof with synthetic banking fixtures. All changes roll back. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import {
  createBusinessPartnerAccountBankLinkageService,
  KyselyBusinessPartnerAccountBankRepository,
} from "@athyper/server-plane-neon/business-partner-account-bank-linkage";
const url = process.env.DATABASE_URL;
if (!url || new URL(url).pathname !== "/athyper_neon")
  throw new Error("Protected Neon DATABASE_URL required");
const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({ pool: new Pool({ connectionString: url }) }),
});
const rollback = new Error("ROLLBACK_BANK_PROOF");
try {
  await db.transaction().execute(async (tx) => {
    const fixture = readFileSync(
      new URL("./business-partner-r4-change-case.sql", import.meta.url),
      "utf8",
    )
      .replace(/^\\set ON_ERROR_STOP on\s*BEGIN;/, "")
      .replace(/ROLLBACK;\s*$/, "")
      .replace("FOR i IN 0..4 LOOP", "FOR i IN 0..0 LOOP");
    await sql.raw(fixture).execute(tx);
    const row = (
      await sql<any>`SELECT v.*,p.id partner_id FROM document.business_partner_bank_verification v JOIN master.business_partner p ON p.id=v.business_partner_id WHERE p.code='R4.BP.TEST'`.execute(
        tx,
      )
    ).rows[0];
    assert.ok(row);
    const tenant = String(row.tenant_id),
      maker = String(row.created_by),
      checker = (
        await sql<{
          id: string;
        }>`SELECT id FROM master.principal WHERE tenant_id=${tenant}::uuid AND code='r4.checker'`.execute(
          tx,
        )
      ).rows[0]!.id;
    const account = randomUUID(),
      link = randomUUID();
    await sql`INSERT INTO master.bank_account(id,tenant_id,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bank_name_override,bank_country_override,is_verified,verified_at,verified_by,verification_method,status,created_by) VALUES(${account}::uuid,${tenant}::uuid,'Synthetic rollback-only bank fixture','iban','GB82WEST12345698765432','5432','USD','Synthetic fixture bank','GB',true,clock_timestamp(),${checker}::uuid,'manual_document','active',${maker}::uuid)`.execute(
      tx,
    );
    await sql`INSERT INTO master.bank_account_link(id,tenant_id,owner_type_id,owner_type,owner_id,relationship_role,bank_account_id,company_code_id,created_by) VALUES(${link}::uuid,${tenant}::uuid,(SELECT id FROM control.owner_type WHERE code='business_partner'),'business_partner',${row.business_partner_id}::uuid,'beneficiary',${account}::uuid,${row.company_code_id}::uuid,${maker}::uuid)`.execute(
      tx,
    );
    const service = createBusinessPartnerAccountBankLinkageService({
      repository: new KyselyBusinessPartnerAccountBankRepository(),
      authorizer: {
        async authorize() {
          return { allowed: true };
        },
      },
      transactions: {
        async run(_plane: any, actor: any, work: any) {
          await sql`SELECT set_config('app.current_tenant_id',${actor.tenantId},true),set_config('app.current_principal_id',${actor.principalId},true)`.execute(
            tx,
          );
          return work(tx);
        },
      },
    } as any);
    const context = (principalId: string) =>
      ({
        planeKey: "neon",
        tenantId: tenant,
        principalId,
        permissions: {
          tenantId: tenant,
          principalId,
          planeKey: "neon",
          allowed: [],
          denied: [],
          planLocked: [],
          planeExcluded: [],
          authorizationScopes: [],
        },
      }) as any;
    const decision = {
      verificationId: String(row.id),
      decision: "verify" as const,
      candidateBankAccountLinkId: link,
      verificationMethod: "manual_document",
      evidence: { fixture: "rollback-only-independent-review" },
    };
    await assert.rejects(
      service.decideBankVerification({ ...decision, context: context(maker) }),
      /Requester cannot verify/,
    );
    await assert.rejects(
      service.applyBankVerification({
        verificationId: String(row.id),
        context: context(checker),
      }),
      /Only a verified change/,
    );
    const verified = await service.decideBankVerification({
      ...decision,
      context: context(checker),
    });
    assert.equal(verified.status, "verified");
    const prior = (
      await sql<any>`SELECT preferred_remittance_bank_link_id FROM master.company_code_supplier_profile WHERE id=${row.supplier_company_profile_id}::uuid`.execute(
        tx,
      )
    ).rows[0];
    assert.equal(prior.preferred_remittance_bank_link_id, null);
    await sql`SAVEPOINT revoked_source`.execute(tx);
    await sql`UPDATE control.mesh_bank_account_projection SET projection_status='revoked' WHERE id=${row.bank_projection_id}::uuid`.execute(
      tx,
    );
    await assert.rejects(
      service.applyBankVerification({
        verificationId: String(row.id),
        context: context(checker),
      }),
      /disclosure changed/,
    );
    await sql`ROLLBACK TO SAVEPOINT revoked_source`.execute(tx);
    const applied = await service.applyBankVerification({
      verificationId: String(row.id),
      context: context(checker),
    });
    assert.equal(applied.verification.status, "applied");
    assert.equal(
      (
        await service.applyBankVerification({
          verificationId: String(row.id),
          context: context(checker),
        })
      ).replayed,
      true,
    );
    const reconciled = (
      await sql<any>`SELECT p.preferred_remittance_bank_link_id,b.projection_status,v.verified_by,v.applied_by FROM master.company_code_supplier_profile p JOIN document.business_partner_bank_verification v ON v.supplier_company_profile_id=p.id JOIN control.mesh_bank_account_projection b ON b.id=v.bank_projection_id WHERE v.id=${row.id}::uuid`.execute(
        tx,
      )
    ).rows[0];
    assert.equal(reconciled.preferred_remittance_bank_link_id, link);
    assert.equal(reconciled.projection_status, "linked");
    assert.equal(reconciled.verified_by, checker);
    assert.equal(reconciled.applied_by, checker);
    console.log(
      "PASS: governed bank case -> independent verification -> native application -> remittance/projection reconciliation; self-verification, unverified application and revoked disclosure rejected; applied replay makes no second change. All synthetic fixtures roll back.",
    );
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await db.destroy();
}
