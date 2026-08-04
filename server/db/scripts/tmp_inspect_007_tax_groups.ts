import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });

async function main() {
  await client.connect();
  try {
    const tenantRes = await client.query(
      `SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat'`
    );
    const tenantId = tenantRes.rows[0]?.id;
    if (!tenantId) {
      throw new Error("technostat tenant not found");
    }

    const groups = await client.query(
      `SELECT code,id,status,group_kind,effective_from,effective_to, jurisdiction_id::text, rounding_rule_id::text
       FROM control.tax_group
       WHERE tenant_id = $1 AND (code LIKE 'TG-SA-%' OR code LIKE 'TG-EG-%')
       ORDER BY code`,
      [tenantId]
    );

    const schedules = await client.query(
      `SELECT id, tax_direction, component_code, rate_kind, rate_value, calculation_basis, wht_basis,
              effective_from, effective_to, status, jurisdiction_id::text, tax_type_id::text
       FROM control.tax_rate_schedule
       WHERE tenant_id = $1
       ORDER BY id`,
      [tenantId]
    );

    const components = await client.query(
      `SELECT tg.code as group_code,
              c.id as component_id, c.tax_group_id,
              s.id as schedule_id, s.status as schedule_status,
              s.tax_type_id::text, s.effective_from, s.effective_to,
              t.code as tax_type_code, t.tax_class
       FROM control.tax_group tg
       JOIN control.tax_group_component c
         ON c.tenant_id = tg.tenant_id AND c.tax_group_id = tg.id
       JOIN control.tax_rate_schedule s
         ON s.tenant_id = c.tenant_id AND s.id = c.tax_rate_schedule_id
       JOIN master.tax_type t
         ON t.tenant_id = s.tenant_id AND t.id = s.tax_type_id
       WHERE tg.tenant_id = $1 AND (tg.code LIKE 'TG-SA-%' OR tg.code LIKE 'TG-EG-%')
       ORDER BY tg.code`,
      [tenantId]
    );

    const candidate = await client.query(
      `SELECT id, code, tax_class, section_code_mode
         FROM master.tax_type
        WHERE tenant_id = $1
          AND code IN ('VAT-SA','VAT-EG','WHT-SA-SVC','WHT-EG-SVC','SA-VAT','SA-WHT','EG-EX','EG-VAT')`,
      [tenantId]
    );

    const scheduleCandidates = await client.query(
      `SELECT s.id::text as schedule_id, s.tenant_id, s.tax_direction, s.component_code,
              s.effective_from, s.effective_to, s.status, s.jurisdiction_id::text,
              t.code as tax_type_code, t.tax_class
         FROM control.tax_rate_schedule s
         JOIN master.tax_type t
           ON t.id = s.tax_type_id AND t.tenant_id = s.tenant_id
        WHERE s.tenant_id = $1
          AND (t.code IN ('VAT-SA','VAT-EG','WHT-SA-SVC','WHT-EG-SVC','SA-VAT','SA-WHT','WHT-SA')
            OR s.component_code IN ('VAT','SALE','PURCHASE','PAYMENT','MAIN','STANDARD','ROYALTY')
            OR t.code LIKE 'EG-%')
        ORDER BY t.code, s.tax_direction, s.component_code`,
      [tenantId]
    );

    console.log("tenant", tenantId);
    console.log("GROUPS", groups.rows);
    console.log("SCHEDULES", schedules.rows);
    console.log("COMPONENTS", components.rows);
    console.log("TAX_TYPES", candidate.rows);
    console.log("SCHEDULE_CANDIDATES", scheduleCandidates.rows);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
