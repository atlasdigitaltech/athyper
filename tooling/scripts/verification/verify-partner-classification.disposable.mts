import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  buildSql,
  tenants,
  id,
} from "../../fixtures/business-partner-core/seed.mjs";
import { readPartnerCommodityClassifications } from "../../../server/packages/services/master-data/src/business-partner-commodity-classification.ts";
import { createPartnerClassificationService } from "../../../server/packages/services/master-data/src/business-partner/classification/service";
import { classificationSeedSql } from "../../fixtures/business-partner-core/classification-seed.mjs";
import { classificationCommandFunctions } from "../local-dev/install-partner-classification.mjs";
const { Pool } = createRequire(
  new URL("../../../server/db/package.json", import.meta.url),
)("pg");
const { Kysely, PostgresDialect, sql } = createRequire(
  new URL(
    "../../../server/packages/services/master-data/package.json",
    import.meta.url,
  ),
)("kysely");
const container = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-bp2-acceptance-20260923"], {
    encoding: "utf8",
  }),
)[0];
assert.equal(
  container.Config.Labels["athyper.environment"],
  "disposable_local",
);
assert.equal(container.Config.Labels["athyper.purpose"], "bp2-acceptance");
const port = container.NetworkSettings.Ports["5432/tcp"][0];
assert.equal(port.HostIp, "127.0.0.1");
const password = container.Config.Env.find((s: string) =>
  s.startsWith("POSTGRES_PASSWORD="),
)?.slice("POSTGRES_PASSWORD=".length);
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: "127.0.0.1",
      port: Number(port.HostPort),
      database: "athyper_neon",
      user: "postgres",
      password,
    }),
  }),
});
const rollback = Error("intentional rollback"),
  checks: string[] = [];
const ddl = readFileSync(
  "server/db/ddl/planes/neon/master/29_partner_commodity_classification.sql",
  "utf8",
);
const backfill = readFileSync(
  "server/db/ddl/planes/neon/master/29a_partner_classification_backfill.sql",
  "utf8",
);
try {
  await db.transaction().execute(async (tx: any) => {
    await sql.raw(ddl).execute(tx);
    await sql.raw(readFileSync("server/db/ddl/planes/neon/master/31_partner_direct_commodity.sql", "utf8")).execute(tx);
    await sql
      .raw(
        readFileSync(
          "server/db/ddl/planes/neon/authz/25_partner_classification_permissions.sql",
          "utf8",
        ),
      )
      .execute(tx);
    assert.equal(
      (
        await sql`SELECT count(*)::int n FROM authz.permission WHERE canonical_code LIKE 'neon.business_partner_classification.%'`.execute(
          tx,
        )
      ).rows[0].n,
      4,
    );
    await sql
      .raw(
        buildSql(false)
          .replace(/^BEGIN;/, "")
          .replace(/ROLLBACK;$/, ""),
      )
      .execute(tx);
    await sql`SELECT set_config('app.current_tenant_id','',true),set_config('app.current_principal_id','',true)`.execute(
      tx,
    );
    // Duplicate historical declarations must merge, while each source snapshot remains distinct.
    await sql`INSERT INTO master.business_partner_commodity_capability(id,tenant_id,business_partner_id,commodity_category_id,partner_role,effective_from,effective_until,notes,metadata,status,created_by)
 SELECT shared.uuidv7(),c.tenant_id,c.business_partner_id,c.commodity_category_id,c.partner_role,
 c.effective_from,c.effective_until,'Synthetic duplicate declaration '||n, c.metadata,'draft',c.created_by
 FROM (SELECT * FROM master.business_partner_commodity_capability ORDER BY id LIMIT 1) c CROSS JOIN generate_series(1,2) n`.execute(
      tx,
    );
    const legacyBefore = (
      await sql`SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) payload FROM master.business_partner_commodity_capability c`.execute(
        tx,
      )
    ).rows[0].payload;
    const decisionsBefore = (
      await sql`SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) payload FROM control.business_partner_qualification q`.execute(
        tx,
      )
    ).rows[0].payload;
    await sql.raw(backfill).execute(tx);
    const stats = async () =>
      (
        await sql`SELECT (SELECT count(*) FROM master.business_partner_commodity_classification)::int facts,(SELECT count(*) FROM master.business_partner_commodity_classification_origin)::int origins,(SELECT count(*) FROM control.business_partner_qualification_classification)::int links`.execute(
          tx,
        )
      ).rows[0];
    const first = await stats();
    assert.equal(first.origins, legacyBefore.length);
    assert.ok(first.facts < first.origins);
    await sql.raw(backfill).execute(tx);
    assert.deepEqual(await stats(), first);
    assert.deepEqual(
      (
        await sql`SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) payload FROM master.business_partner_commodity_capability c`.execute(
          tx,
        )
      ).rows[0].payload,
      legacyBefore,
    );
    assert.deepEqual(
      (
        await sql`SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) payload FROM control.business_partner_qualification q`.execute(
          tx,
        )
      ).rows[0].payload,
      decisionsBefore,
    );
    checks.push(
      `two-pass migration: ${first.origins} origins, ${first.facts} facts, ${first.links} qualification references; legacy rows and decisions unchanged`,
    );
    await sql
      .raw(
        readFileSync(
          "server/db/ddl/planes/neon/master/30_partner_classification_cutover.sql",
          "utf8",
        ),
      )
      .execute(tx);
    await sql.raw(classificationCommandFunctions()).execute(tx);
    await sql`SAVEPOINT legacy_cutover`.execute(tx);
    await assert.rejects(
      () =>
        sql`INSERT INTO master.business_partner_commodity_capability(tenant_id,business_partner_id,commodity_category_id,partner_role,created_by) SELECT tenant_id,business_partner_id,commodity_category_id,partner_role,created_by FROM master.business_partner_commodity_capability LIMIT 1`.execute(
          tx,
        ),
      (e: any) => e.code === "23514",
    );
    await sql`ROLLBACK TO SAVEPOINT legacy_cutover`.execute(tx);
    checks.push("legacy inserts fail closed after backfill/cutover");
    const commercial = (
      await sql<any>`SELECT q.*,c.id classification_id,c.commodity_category_id,
  (SELECT operating_organization_id FROM control.business_partner_decision_scope s WHERE s.tenant_id=q.tenant_id AND s.qualification_id=q.id AND s.scope_kind='operating_organization' AND s.scope_mode='include' LIMIT 1) org_id
  FROM control.business_partner_qualification q JOIN control.business_partner_qualification_classification l ON l.tenant_id=q.tenant_id AND l.qualification_id=q.id
  JOIN master.business_partner_commodity_classification c ON c.tenant_id=l.tenant_id AND c.id=l.classification_id
  WHERE c.status='active' AND c.effective_from<=CURRENT_DATE AND(c.effective_until IS NULL OR c.effective_until>CURRENT_DATE) LIMIT 1`.execute(
        tx,
      )
    ).rows[0];
    assert.ok(commercial);
    await sql`SELECT set_config('app.current_tenant_id',${commercial.tenant_id},true),set_config('app.current_principal_id',${commercial.created_by},true),set_config('app.database_plane','neon',true)`.execute(
      tx,
    );
    const factBefore = (
      await sql`SELECT to_jsonb(c) fact FROM master.business_partner_commodity_classification c WHERE id=${commercial.classification_id}::uuid`.execute(
        tx,
      )
    ).rows[0].fact;
    const qualification = (
      await sql<any>`SELECT * FROM control.command_create_business_partner_decision(${commercial.tenant_id}::uuid,'qualification',${commercial.business_partner_id}::uuid,${commercial.partner_role},${commercial.role_id}::uuid,${commercial.org_id}::uuid,NULL::uuid,${commercial.commodity_category_id}::uuid,${JSON.stringify({ qualificationTypeCode: commercial.qualification_type_code, commodityClassificationId: commercial.classification_id, effectiveFrom: new Date().toISOString().slice(0, 10) })}::jsonb,'classification-qualification-001',${commercial.created_by}::uuid)`.execute(
        tx,
      )
    ).rows[0];
    assert.ok(qualification);
    assert.equal(
      (
        await sql`SELECT count(*)::int n FROM control.business_partner_qualification_classification WHERE qualification_id=${qualification.aggregate_id}::uuid AND classification_id=${commercial.classification_id}::uuid`.execute(
          tx,
        )
      ).rows[0].n,
      1,
    );
    assert.deepEqual(
      (
        await sql`SELECT to_jsonb(c) fact FROM master.business_partner_commodity_classification c WHERE id=${commercial.classification_id}::uuid`.execute(
          tx,
        )
      ).rows[0].fact,
      factBefore,
    );
    checks.push(
      "new commercial qualification references the selected independent fact without altering it",
    );
    const checker = (
      await sql<any>`SELECT id FROM master.principal WHERE tenant_id=${commercial.tenant_id}::uuid AND id<>${commercial.created_by}::uuid AND status='active' AND code LIKE '%.owner' ORDER BY code LIMIT 1`.execute(
        tx,
      )
    ).rows[0];
    assert.ok(checker);
    await sql`SELECT set_config('app.current_principal_id',${checker.id},true)`.execute(
      tx,
    );
    await sql`SELECT * FROM control.command_business_partner_decision(${commercial.tenant_id}::uuid,'qualification',${qualification.aggregate_id}::uuid,'rejected',1::bigint,'Disposable classification independence check','classification-reject-001',${"a".repeat(64)},'{}'::jsonb,${checker.id}::uuid)`.execute(
      tx,
    );
    assert.deepEqual(
      (
        await sql`SELECT to_jsonb(c) fact FROM master.business_partner_commodity_classification c WHERE id=${commercial.classification_id}::uuid`.execute(
          tx,
        )
      ).rows[0].fact,
      factBefore,
    );
    assert.equal(
      (
        await sql`SELECT count(*)::int n FROM control.business_partner_qualification_classification WHERE qualification_id=${qualification.aggregate_id}::uuid`.execute(
          tx,
        )
      ).rows[0].n,
      1,
    );
    checks.push(
      "independent checker rejection preserves the classification and its qualification evidence reference",
    );
    await sql`SELECT set_config('app.current_principal_id',${commercial.created_by},true)`.execute(
      tx,
    );
    const approvedCandidate = (
      await sql<any>`SELECT * FROM control.command_create_business_partner_decision(${commercial.tenant_id}::uuid,'qualification',${commercial.business_partner_id}::uuid,${commercial.partner_role},${commercial.role_id}::uuid,${commercial.org_id}::uuid,NULL::uuid,${commercial.commodity_category_id}::uuid,${JSON.stringify({ qualificationTypeCode: commercial.qualification_type_code, commodityClassificationId: commercial.classification_id, effectiveFrom: new Date().toISOString().slice(0, 10) })}::jsonb,'classification-qualification-002',${commercial.created_by}::uuid)`.execute(
        tx,
      )
    ).rows[0];
    await sql`SELECT set_config('app.current_principal_id',${checker.id},true)`.execute(
      tx,
    );
    const approved = (
      await sql<any>`SELECT * FROM control.command_business_partner_decision(${commercial.tenant_id}::uuid,'qualification',${approvedCandidate.aggregate_id}::uuid,'approved',1::bigint,'Disposable independent approval','classification-approve-001',${"b".repeat(64)},'{}'::jsonb,${checker.id}::uuid)`.execute(
        tx,
      )
    ).rows[0];
    const approvedVersion = (
      await sql`SELECT row_version FROM control.business_partner_qualification WHERE id=${approvedCandidate.aggregate_id}::uuid`.execute(
        tx,
      )
    ).rows[0].row_version;
    await sql`SELECT * FROM control.command_business_partner_decision(${commercial.tenant_id}::uuid,'qualification',${approvedCandidate.aggregate_id}::uuid,'expired',${approvedVersion}::bigint,'Disposable approval expired','classification-expire-001',${"c".repeat(64)},'{}'::jsonb,${checker.id}::uuid)`.execute(
      tx,
    );
    assert.deepEqual(
      (
        await sql`SELECT to_jsonb(c) fact FROM master.business_partner_commodity_classification c WHERE id=${commercial.classification_id}::uuid`.execute(
          tx,
        )
      ).rows[0].fact,
      factBefore,
    );
    checks.push(
      "approval followed by the existing permitted expiry transition leaves the classification unchanged",
    );
    for (const [tenant, actor] of tenants) {
      const row = (
        await sql`SELECT t.id tenant_id,p.id principal_id FROM master.tenant t JOIN master.principal p ON p.tenant_id=t.id WHERE t.code=${tenant} AND p.code=${actor}`.execute(
          tx,
        )
      ).rows[0];
      await sql`SELECT set_config('app.current_tenant_id',${row.tenant_id},true),set_config('app.current_principal_id',${row.principal_id},true),set_config('app.current_actor_type','user',true)`.execute(
        tx,
      );
      const category = randomUUID(),
        classification = randomUUID();
      await sql`INSERT INTO master.commodity_category(id,tenant_id,code,name,status,created_by) VALUES(${category}::uuid,${row.tenant_id}::uuid,'demo_classification','Demo laboratory equipment','active',${row.principal_id}::uuid)`.execute(
        tx,
      );
      await sql`INSERT INTO master.business_partner_commodity_classification(id,tenant_id,business_partner_id,commodity_category_id,source_system,source_reference,status,created_by) VALUES(${classification}::uuid,${row.tenant_id}::uuid,${id(tenant, "partner")}::uuid,${category}::uuid,'demo','independent-fact','active',${row.principal_id}::uuid)`.execute(
        tx,
      );
      const verifier = (
        await sql<any>`SELECT id FROM master.principal WHERE tenant_id=${row.tenant_id}::uuid AND id<>${row.principal_id}::uuid AND status='active' AND code LIKE '%.owner' ORDER BY code LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      assert.ok(verifier);
      await sql`SET LOCAL ROLE athyperapp`.execute(tx);
      const input = {
        tenantId: row.tenant_id,
        businessPartnerId: id(tenant, "partner"),
        asOf: new Date().toISOString().slice(0, 10),
      };
      const visible = await readPartnerCommodityClassifications(input, tx);
      assert.equal(visible.items.length, 1);
      assert.equal(visible.items[0].assignmentKind, "declared");
      assert.equal(visible.items[0].categoryName, "Demo laboratory equipment");
      assert.equal(
        (
          await readPartnerCommodityClassifications(
            {
              ...input,
              businessPartnerId: id(
                tenants.find(([code]) => code !== tenant)![0],
                "partner",
              ),
            },
            tx,
          )
        ).items.length,
        0,
      );
      assert.equal(
        (
          await sql`SELECT count(*)::int n FROM master.business_partner_commodity_classification WHERE tenant_id<>${row.tenant_id}::uuid`.execute(
            tx,
          )
        ).rows[0].n,
        0,
      );
      let deny = false,
        failAudit = false,
        audits = 0;
      const service = createPartnerClassificationService({
        authorizer: {
          async authorize() {
            return deny
              ? { allowed: false, reason: "mfa_required" }
              : { allowed: true };
          },
        },
        transactions: {
          async run(_plane: any, _actor: any, work: any) {
            await sql`SAVEPOINT classification_command_test`.execute(tx);
            try {
              const result = await work(tx);
              await sql`RELEASE SAVEPOINT classification_command_test`.execute(
                tx,
              );
              return result;
            } catch (error) {
              await sql`ROLLBACK TO SAVEPOINT classification_command_test`.execute(
                tx,
              );
              throw error;
            }
          },
        },
        audit: {
          async record(event) {
            assert.match(
              String(event.eventCode),
              /^business_partner\.classification\.(declared|verified|archived)$/,
            );
            assert.ok(
              !JSON.stringify(event).includes("private-checker-evidence"),
            );
            if (failAudit) throw Error("audit unavailable");
            audits++;
          },
        },
      });
      const context = {
        planeKey: "neon",
        tenantId: row.tenant_id,
        principalId: row.principal_id,
        permissions: {},
      } as any;
      const command = {
        context,
        businessPartnerId: input.businessPartnerId,
        action: "declare" as const,
        body: {
          commodityCodeId: (await sql`SELECT id FROM shared.commodity_code WHERE domain_code='unspsc' AND code='41100000' AND is_active`.execute(tx)).rows[0].id,
          effectiveFrom: "2026-01-01",
          sourceSystem: "disposable",
          sourceReference: "native-command",
          idempotencyKey: "native-command-001",
        },
      };
      failAudit = true;
      await assert.rejects(() => service.execute(command), /audit unavailable/);
      assert.equal(
        (
          await sql`SELECT count(*)::int n FROM master.business_partner_commodity_classification WHERE source_system='disposable'`.execute(
            tx,
          )
        ).rows[0].n,
        0,
      );
      failAudit = false;
      const declared = await service.execute(command);
      assert.equal(declared.classification.commodity_category_id, null);
      assert.equal(declared.classification.commodity_code_id, command.body.commodityCodeId);
      const directRead = await service.read({context, businessPartnerId: input.businessPartnerId, asOf:"2026-09-23"});
      assert.ok(directRead.items.some((item:any) => item.id === declared.classification.id && item.classificationBasis === "direct_unspsc" && item.commodityCode === "41100000"));
      const {commodityCodeId: omitted, ...legacyBody} = command.body;
      await assert.rejects(() => service.execute({...command, body:{...legacyBody, commodityCategoryId:category, idempotencyKey:"retired-category-capture-001"}}), /UNSPSC code, not a tenant category/);
      assert.equal(declared.replayed, false);
      assert.equal((await service.execute(command)).replayed, true);
      assert.equal(audits, 1);
      await assert.rejects(
        () =>
          service.execute({
            ...command,
            body: { ...command.body, sourceReference: "different" },
          }),
        (e: any) => e.code === "BP_CLASSIFICATION_IDEMPOTENCY_CONFLICT",
      );
      await assert.rejects(
        () =>
          service.execute({
            ...command,
            body: { ...command.body, partnerRole: "supplier" },
          }),
        (e: any) => e.status === 400,
      );
      await assert.rejects(
        () =>
          service.execute({
            ...command,
            action: "verify",
            body: {
              classificationId: (declared.classification as any).id,
              expectedVersion: 1,
              evidenceReference: "demo",
              idempotencyKey: "native-verify-001",
            },
          }),
        (e: any) => e.code === "BP_CLASSIFICATION_INDEPENDENT_CHECKER_REQUIRED",
      );
      deny = true;
      await assert.rejects(
        () => service.execute(command),
        (e: any) => e.code === "BP_CLASSIFICATION_STEP_UP_REQUIRED",
      );
      deny = false;
      const page = await service.read({
        context,
        businessPartnerId: input.businessPartnerId,
        limit: 1,
      });
      assert.ok(page.nextCursor);
      const page2 = await service.read({
        context,
        businessPartnerId: input.businessPartnerId,
        limit: 1,
        cursor: page.nextCursor,
      });
      assert.notEqual(page.items[0].id, page2.items[0].id);
      assert.equal(page2.hasMore, false);
      await assert.rejects(
        () =>
          service.read({
            context: { ...context, principalId: randomUUID() },
            businessPartnerId: input.businessPartnerId,
            cursor: page.nextCursor,
          }),
        (e: any) => e.code === "BP_CLASSIFICATION_CURSOR_INVALID",
      );
      await sql`SELECT set_config('app.current_principal_id',${verifier.id},true)`.execute(
        tx,
      );
      const verified = await service.execute({
        context: { ...context, principalId: verifier.id },
        businessPartnerId: input.businessPartnerId,
        action: "verify",
        body: {
          classificationId: (declared.classification as any).id,
          expectedVersion: 1,
          evidenceReference: "private-checker-evidence",
          idempotencyKey: "native-checker-001",
        },
      });
      assert.equal(
        (verified.classification as any).assignment_kind,
        "verified",
      );
      assert.equal(Number((verified.classification as any).record_version), 2);
      await sql`SELECT set_config('app.current_principal_id',${row.principal_id},true)`.execute(
        tx,
      );
      await assert.rejects(
        () =>
          service.execute({
            context,
            businessPartnerId: input.businessPartnerId,
            action: "archive",
            body: {
              classificationId: (declared.classification as any).id,
              expectedVersion: 1,
              reason: "stale command",
              idempotencyKey: "native-stale-001",
            },
          }),
        (e: any) => e.code === "BP_CLASSIFICATION_VERSION_CONFLICT",
      );
      const archived = await service.execute({
        context,
        businessPartnerId: input.businessPartnerId,
        action: "archive",
        body: {
          classificationId: (declared.classification as any).id,
          expectedVersion: 2,
          reason: "Disposable evidence retired",
          idempotencyKey: "native-archive-001",
        },
      });
      assert.equal((archived.classification as any).status, "archived");
      assert.equal(Number((archived.classification as any).record_version), 3);
      assert.equal(
        (
          await service.read({
            context,
            businessPartnerId: input.businessPartnerId,
          })
        ).items.length,
        1,
      );
      checks.push(
        `${tenant}: independent verification, stale-version denial, audited archive and active-reader exclusion`,
      );
      checks.push(
        `${tenant}: native declaration, audit-failure rollback, replay, changed-key conflict, scope input denial, maker/checker denial, revoked permission denial and cursor isolation`,
      );
      await sql`RESET ROLE`.execute(tx);
      await sql`SAVEPOINT immutable_fact`.execute(tx);
      await assert.rejects(
        () =>
          sql`DELETE FROM master.business_partner_commodity_classification WHERE id=${classification}::uuid`.execute(
            tx,
          ),
        (e: any) => e.code === "23514",
      );
      await sql`ROLLBACK TO SAVEPOINT immutable_fact`.execute(tx);
      await sql`SAVEPOINT foreign_owner`.execute(tx);
      await assert.rejects(
        () =>
          sql`INSERT INTO master.business_partner_commodity_classification(tenant_id,business_partner_id,commodity_category_id,source_system,source_reference,status,created_by) VALUES(${row.tenant_id}::uuid,${id(tenants.find(([code]) => code !== tenant)![0], "partner")}::uuid,${category}::uuid,'demo','cross-tenant','active',${row.principal_id}::uuid)`.execute(
            tx,
          ),
        (e: any) => e.code === "23503",
      );
      await sql`ROLLBACK TO SAVEPOINT foreign_owner`.execute(tx);
      checks.push(
        `${tenant}: role/company-free declared fact, native read, RLS isolation, cross-tenant FK denial and deletion protection`,
      );
    }
    await sql`RESET ROLE`.execute(tx);
    await sql.raw(classificationSeedSql()).execute(tx);
    await sql.raw(classificationSeedSql()).execute(tx);
    for (const [tenant] of tenants) {
      const t = (
        await sql`SELECT id FROM master.tenant WHERE code=${tenant}`.execute(tx)
      ).rows[0].id;
      const result = await readPartnerCommodityClassifications(
        {
          tenantId: t,
          businessPartnerId: id(tenant, "partner"),
          asOf: "2026-09-23",
        },
        tx,
      );
      const demo = result.items.find(
        (item: any) => item.id === id(tenant, "commodity-classification"),
      );
      assert.ok(demo);
      assert.equal(demo.commodityCodes[0].code, "41100000");
      assert.ok(demo.commodityCodes[0].crosswalks.length > 0);
      checks.push(
        `${tenant}: repeatable role-free demo category, UNSPSC assignment and ${demo.commodityCodes[0].crosswalks.length} existing shared crosswalks`,
      );
    }
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await db.destroy();
}
console.log(
  JSON.stringify({ passed: true, rolledBack: true, checks }, null, 2),
);
