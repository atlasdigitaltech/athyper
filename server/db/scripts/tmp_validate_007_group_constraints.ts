import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });

function pick<T>(rows: T[], keys: Array<keyof T>): T | undefined {
  for (const row of rows) {
    return row;
  }
  return undefined;
}

async function first<T>(sql: string, args: unknown[] = []) {
  const res = await client.query(sql, args);
  return res.rows[0] as T | undefined;
}

async function main() {
  await client.connect();
  try {
    const tenantRes = await client.query(
      `SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat'`
    );
    const tenantId = tenantRes.rows[0]?.id;
    if (!tenantId) throw new Error("technostat tenant not found");

    const principalRes = await client.query(
      `SELECT id FROM master.principal WHERE tenant_id = $1 AND code = 'seed_system' ORDER BY code LIMIT 1`,
      [tenantId]
    );
    const v_sys = principalRes.rows[0]?.id || principalRes.rows[0]?.id;
    const v_jur_sa = (await first<{ id: string }>(
      `SELECT id FROM master.tax_jurisdiction WHERE tenant_id=$1 AND code='SA-ZATCA'`,
      [tenantId]
    ))?.id;
    const v_jur_eg = (await first<{ id: string }>(
      `SELECT id FROM master.tax_jurisdiction WHERE tenant_id=$1 AND code='EG-ETA'`,
      [tenantId]
    ))?.id;

    const pickTax = async (codes: string[]) => {
      const res = await client.query(
        `SELECT id, code, COALESCE(tax_class, '') AS tax_class
           FROM master.tax_type
          WHERE tenant_id = $1 AND code = ANY($2::text[])
          ORDER BY array_position($2::text[], code)`,
        [tenantId, codes]
      );
      return res.rows[0] as { id: string; code: string; tax_class: string } | undefined;
    };

    const pickSchedule = async (jurisdictionId: string, taxTypeId: string, direction: string, comps: string[]) => {
      const res = await client.query(
        `SELECT id, effective_from, effective_to, status, tax_direction, component_code, tax_type_id
           FROM control.tax_rate_schedule
          WHERE tenant_id = $1 AND jurisdiction_id = $2 AND tax_type_id = $3
            AND tax_direction = $4
            AND COALESCE(component_code,'') = ANY($5::text[])
          ORDER BY effective_from DESC
          LIMIT 1`,
        [tenantId, jurisdictionId, taxTypeId, direction, comps]
      );
      return res.rows[0] as {
        id: string;
        effective_from: string;
        effective_to: string | null;
        status: string;
      } | undefined;
    };

    const rows: Array<{
      name: string;
      jurisdiction: string;
      tax_code_choices: string[];
      direction: string;
      component_choices: string[];
      group_code: string;
      group_kind: string;
      default_existing_code?: string;
    }> = [
      {
        name: "SA VAT",
        jurisdiction: v_jur_sa!,
        tax_code_choices: ["VAT-SA", "VAT_SA", "SA-VAT"],
        direction: "PURCHASE",
        component_choices: ["MAIN", "VAT", "SA-VAT", "VAT_SA"],
        group_code: "TG-SA-VAT-15-IN",
        group_kind: "indirect_tax",
        default_existing_code: "TG-SA-VAT-15-IN",
      },
      {
        name: "SA WHT",
        jurisdiction: v_jur_sa!,
        tax_code_choices: ["WHT-SA-SVC", "WHT_SA", "SA-WHT"],
        direction: "PAYMENT",
        component_choices: ["MAIN", "STANDARD", "SA-WHT", "WHT_SA"],
        group_code: "TG-SA-WHT-5-SVC",
        group_kind: "withholding",
      },
      {
        name: "EG VAT",
        jurisdiction: v_jur_eg!,
        tax_code_choices: ["VAT-EG", "VAT_EG", "EG-VAT"],
        direction: "PURCHASE",
        component_choices: ["MAIN", "VAT", "EG-VAT", "VAT_EG"],
        group_code: "TG-EG-VAT-14-IN",
        group_kind: "indirect_tax",
      },
      {
        name: "EG WHT",
        jurisdiction: v_jur_eg!,
        tax_code_choices: ["WHT-EG-SVC", "WHT_EG", "EG-WHT"],
        direction: "PAYMENT",
        component_choices: ["MAIN", "STANDARD", "EG-WHT", "WHT_EG"],
        group_code: "TG-EG-WHT-10-SVC",
        group_kind: "withholding",
      },
    ];

    for (const r of rows) {
      const tt = await pickTax(r.tax_code_choices);
      const sch = tt && r.jurisdiction
        ? await pickSchedule(r.jurisdiction, tt.id, r.direction, r.component_choices)
        : undefined;
      const existing = await first<{ id: string; effective_from: string; group_kind: string; rounding_rule_id: string; jurisdiction_id: string }>(
        `SELECT id, effective_from, group_kind, rounding_rule_id, jurisdiction_id
           FROM control.tax_group
          WHERE tenant_id=$1 AND code=$2`,
        [tenantId, r.group_code]
      );
      const rounding = await first<{ id: string }>(
        `SELECT id FROM control.rounding_rule WHERE tenant_id=$1 AND code='TAX-CURRENCY-STANDARD'`,
        [tenantId]
      );
      const roundId = rounding?.id;

      const targetEff = existing?.effective_from || (sch ? sch.effective_from : null);
      const effectiveFromCheck = targetEff && sch ? new Date(sch.effective_from) <= new Date(targetEff) : false;
      const jurisdictionMatch = existing ? existing.jurisdiction_id === r.jurisdiction : r.jurisdiction === r.jurisdiction;
      const statusOk = sch && (sch.status === "scheduled" || sch.status === "active");
      const taxClassOk =
        tt ? (
          r.group_kind === "withholding" ? tt.tax_class === "withholding" : r.group_kind === "indirect_tax" ? tt.tax_class !== "withholding" : true
        ) : false;

      const groupWillNeedUpdate = !existing;

      const issues: string[] = [];
      if (!tt) issues.push("missing tax_type");
      if (!sch) issues.push("missing schedule");
      else {
        if (!statusOk) issues.push(`schedule status ${sch.status}`);
        if (!effectiveFromCheck && targetEff) issues.push("coverage fail: schedule start > group start");
      }
      if (!taxClassOk) issues.push(`group_kind ${r.group_kind} vs tax_class ${tt?.tax_class}`);
      if (!existing && !r.jurisdiction) issues.push("missing jurisdiction");
      if (!roundId) issues.push("missing rounding rule");
      if (!jurisdictionMatch) issues.push("jurisdiction mismatch");

      console.log(r.name, {
        taxType: tt?.code || null,
        taxClass: tt?.tax_class || null,
        schedule: sch ? { id: sch.id, status: sch.status, effective_from: sch.effective_from } : null,
        existingGroup: existing ? { id: existing.id, effective_from: existing.effective_from, group_kind: existing.group_kind, rounding_rule_id: existing.rounding_rule_id } : null,
        computedTargetEff: targetEff,
        issues,
      });
    }

    const groupRows = await client.query(
      `SELECT g.code, g.status, g.group_kind, g.effective_from, t.code AS tax_type_code, s.status AS sched_status
         FROM control.tax_group g
         JOIN control.tax_group_component c ON c.tenant_id=g.tenant_id AND c.tax_group_id=g.id
         JOIN control.tax_rate_schedule s ON s.tenant_id=c.tenant_id AND s.id=c.tax_rate_schedule_id
         JOIN master.tax_type t ON t.tenant_id=s.tenant_id AND t.id=s.tax_type_id
        WHERE g.tenant_id=$1 AND g.code LIKE 'TG-SA-%' OR g.code LIKE 'TG-EG-%'`
      , [tenantId]);
    console.log("Active tenant groups matching target families:", groupRows.rows);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
