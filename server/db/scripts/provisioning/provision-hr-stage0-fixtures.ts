#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const CONFIRMATION = "LOCAL-NEON-HR-STAGE0-FIXTURES";
const PACK = "development.hr-stage0.v1";
const UUID_NAMESPACE = "athyper:development-hr-stage0-fixtures:v1:";

type Fixture = Readonly<{
  code: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  title: string;
  department: string;
  employmentType: "full_time" | "part_time" | "contract";
  hireDate: string;
  assignmentFrom: string;
}>;

export function buildHrStage0Fixtures(): readonly Fixture[] {
  return Object.freeze([
    {
      code: "HRD-STAGE0-001",
      employeeNumber: "HRD-0001",
      firstName: "Asha",
      lastName: "Rahman",
      title: "People Operations Lead",
      department: "People Operations",
      employmentType: "full_time",
      hireDate: "2025-01-01",
      assignmentFrom: "2025-01-01",
    },
    {
      code: "HRD-STAGE0-002",
      employeeNumber: "HRD-0002",
      firstName: "Ben",
      lastName: "Tan",
      title: "Payroll Analyst",
      department: "People Operations",
      employmentType: "part_time",
      hireDate: "2025-06-01",
      assignmentFrom: "2025-06-01",
    },
    {
      code: "HRD-STAGE0-003",
      employeeNumber: "HRD-0003",
      firstName: "Carla",
      lastName: "Nasser",
      title: "Benefits Specialist",
      department: "People Operations",
      employmentType: "contract",
      hireDate: "2027-01-01",
      assignmentFrom: "2027-01-01",
    },
  ]);
}

export async function provisionHrStage0Fixtures(options: {
  readonly databaseUrl: string;
  readonly confirmation?: string;
  readonly dryRun?: boolean;
  readonly tenantCode?: string;
  readonly actorCode?: string;
}) {
  const url = new URL(options.databaseUrl);
  if (!localDatabase(url) || url.pathname !== "/athyper_neon")
    throw new Error("HR Stage 0 fixtures require local athyper_neon");
  const fixtures = buildHrStage0Fixtures();
  if (options.dryRun)
    return { mode: "planned", pack: PACK, employees: fixtures.map((item) => item.code) };
  if (options.confirmation !== CONFIRMATION)
    throw new Error(`apply requires --confirm=${CONFIRMATION}`);

  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [PACK]);
    const context = await one<{ tenant_id: string; actor_id: string; legal_entity_id: string; company_code_id: string }>(
      client,
      `SELECT tenant.id::text tenant_id,principal.id::text actor_id,legal.id::text legal_entity_id,company.id::text company_code_id
       FROM master.tenant tenant
       JOIN master.principal principal ON principal.tenant_id=tenant.id AND principal.code=$2 AND principal.status='active'
       JOIN master.company_code company ON company.tenant_id=tenant.id AND company.status='active'
       JOIN master.legal_entity legal ON legal.tenant_id=company.tenant_id AND legal.id=company.legal_entity_id AND legal.status='active'
       WHERE tenant.code=$1 AND tenant.status='active'
       ORDER BY company.code
       LIMIT 1`,
      [options.tenantCode ?? "athyper", options.actorCode ?? "kumar"],
    );
    await client.query(
      "SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
      [context.tenant_id, context.actor_id],
    );
    const metadata = JSON.stringify({ _seed: { pack: PACK, synthetic: true } });
    for (const fixture of fixtures) {
      const personId = uuid(`person:${fixture.code}`);
      const employeeId = uuid(`employee:${fixture.code}`);
      const employmentId = uuid(`employment:${fixture.code}`);
      const assignmentId = uuid(`assignment:${fixture.code}`);
      const name = `${fixture.firstName} ${fixture.lastName}`;
      await client.query(
        `INSERT INTO master.person(id,tenant_id,code,name,first_name,last_name,display_name,primary_email,country_code,metadata,status,created_by)
         VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$4,lower(replace($3,'-','.')) || '@example.test','MY',$7::jsonb,'active',$8::uuid)
         ON CONFLICT(tenant_id,id) DO NOTHING`,
        [personId, context.tenant_id, fixture.code, name, fixture.firstName, fixture.lastName, metadata, context.actor_id],
      );
      await client.query(
        `INSERT INTO master.employee(id,tenant_id,code,name,person_id,employee_number,first_name,last_name,display_name,email,employment_type,department,title,company_code_id,hire_date,metadata,status,created_by)
         VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid,$6,$7,$8,$4,lower(replace($3,'-','.')) || '@example.test',$9,$10,$11,$12::uuid,$13::date,$14::jsonb,'active',$15::uuid)
         ON CONFLICT(tenant_id,id) DO NOTHING`,
        [employeeId, context.tenant_id, `${fixture.code}.EMP`, name, personId, fixture.employeeNumber, fixture.firstName, fixture.lastName, fixture.employmentType, fixture.department, fixture.title, context.company_code_id, fixture.hireDate, metadata, context.actor_id],
      );
      await client.query(
        `INSERT INTO master.employment(id,tenant_id,code,name,person_id,employee_id,legal_entity_id,company_code_id,employment_number,employment_type,is_primary,employment_status,hire_date,metadata,status,created_by)
         VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9,$10,true,'active',$11::date,$12::jsonb,'active',$13::uuid)
         ON CONFLICT(tenant_id,id) DO NOTHING`,
        [employmentId, context.tenant_id, `${fixture.code}.EMPLOYMENT`, `${name} employment`, personId, employeeId, context.legal_entity_id, context.company_code_id, fixture.employeeNumber, fixture.employmentType, fixture.hireDate, metadata, context.actor_id],
      );
      await client.query(
        `INSERT INTO master.work_assignment(id,tenant_id,code,name,employee_id,employment_id,company_code_id,assignment_type,fte,effective_from,metadata,status,created_by)
         VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid,$6::uuid,$7::uuid,'primary',1,$8::date,$9::jsonb,'active',$10::uuid)
         ON CONFLICT(tenant_id,id) DO NOTHING`,
        [assignmentId, context.tenant_id, `${fixture.code}.ASSIGNMENT`, `${name} assignment`, employeeId, employmentId, context.company_code_id, fixture.assignmentFrom, metadata, context.actor_id],
      );
      const actual = await one<{ employee_number: string; employment_type: string }>(
        client,
        `SELECT employee_number,employment_type FROM master.v_employee WHERE tenant_id=$1::uuid AND id=$2::uuid`,
        [context.tenant_id, employeeId],
      );
      if (actual.employee_number !== fixture.employeeNumber || actual.employment_type !== fixture.employmentType)
        throw new Error(`HR Stage 0 fixture verification failed: ${fixture.code}`);
    }
    await client.query("COMMIT");
    return { mode: "applied", pack: PACK, employees: fixtures.map((item) => item.code) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function localDatabase(url: URL): boolean {
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) return true;
  const octets = url.hostname.split(".").map(Number);
  return octets.length === 4 && octets.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
    && (octets[0] === 10 || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) || (octets[0] === 192 && octets[1] === 168));
}
function uuid(name: string): string {
  const bytes = createHash("sha1").update(UUID_NAMESPACE).update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function one<T extends object>(client: Pick<Client, "query">, statement: string, values: unknown[] = []): Promise<T> {
  const result = await client.query<T>(statement, values);
  if (result.rows.length !== 1) throw new Error(`expected one row, received ${result.rows.length}`);
  return result.rows[0]!;
}
function option(args: readonly string[], name: string): string | undefined {
  const matching = args.find((item) => item.startsWith(`${name}=`));
  if (matching) return matching.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const databaseUrl = option(args, "--database-url") ?? process.env.ATHYPER_NEON_DATABASE_ADMIN_URL;
  if (!databaseUrl) throw new Error("--database-url or ATHYPER_NEON_DATABASE_ADMIN_URL is required");
  const result = await provisionHrStage0Fixtures({ databaseUrl, confirmation: option(args, "--confirm"), dryRun: args.includes("--plan"), tenantCode: option(args, "--tenant-code"), actorCode: option(args, "--actor-code") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
