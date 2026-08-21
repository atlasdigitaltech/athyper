import { sql, type Kysely } from "kysely";
import { FinanceFxError } from "./finance-fx-policy.service.js";
import type { FxExposureSource } from "./finance-fx-contracts.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

interface CompanyRow {
  id: string;
  code: string;
  name: string;
  functional_currency: string;
  legal_entity_id: string;
  legal_entity_code: string;
  legal_entity_name: string;
  tenant_code: string;
  tenant_name: string;
}

export interface CompanyFxExposure {
  company: {
    id: string;
    code: string;
    name: string;
    functionalCurrency: string;
    legalEntity: { id: string; code: string; name: string };
    tenantCode: string;
    tenantName: string;
  };
  asOfDate: string;
  hasForeignCurrencyExposure: boolean;
  currencies: Array<{
    currencyCode: string;
    purposes: Array<"transaction" | "revaluation">;
    sourceCount: number;
  }>;
  sources: FxExposureSource[];
}

export async function loadCompanyFxExposure(
  db: AnyDb,
  input: { tenantId: string; companyCode: string; asOfDate: string; legalEntityId?: string | null },
): Promise<CompanyFxExposure> {
  const { rows: companyRows } = await sql<CompanyRow>`
    SELECT cc.id,cc.code,cc.name,trim(cc.functional_currency) AS functional_currency,
           le.id AS legal_entity_id,le.code AS legal_entity_code,le.name AS legal_entity_name,
           tenant.code AS tenant_code,tenant.name AS tenant_name
      FROM master.company_code cc
      JOIN master.legal_entity le ON le.tenant_id=cc.tenant_id AND le.id=cc.legal_entity_id
      JOIN master.tenant tenant ON tenant.id=cc.tenant_id
     WHERE cc.tenant_id=${input.tenantId}::uuid
       AND cc.code=${input.companyCode}
       AND cc.status='active'
       AND (${input.legalEntityId ?? null}::uuid IS NULL OR cc.legal_entity_id=${input.legalEntityId ?? null}::uuid)
     LIMIT 1
  `.execute(db);
  const company = companyRows[0];
  if (!company) {
    throw new FinanceFxError(
      "FX_COMPANY_SCOPE_DENIED",
      404,
      "Company is not available in the active tenant and Legal Entity.",
    );
  }

  const [{ rows: books }, { rows: banks }, { rows: paymentPolicies }, { rows: settlementRules }] = await Promise.all([
    sql<{ id:string;code:string;name:string;currency_code:string;assignment_id:string }>`
      SELECT lb.id,lb.code,lb.name,trim(COALESCE(assignment.override_currency_code,lb.base_currency_code)) AS currency_code,
             assignment.id AS assignment_id
        FROM master.company_code_book_assignment assignment
        JOIN master.ledger_book lb ON lb.tenant_id=assignment.tenant_id AND lb.id=assignment.book_id
       WHERE assignment.tenant_id=${input.tenantId}::uuid
         AND assignment.company_code_id=${company.id}::uuid
         AND assignment.status='active' AND lb.status='active'
         AND assignment.effective_from<=${input.asOfDate}::date
         AND (assignment.effective_to IS NULL OR assignment.effective_to>=${input.asOfDate}::date)
    `.execute(db),
    sql<{link_id:string;account_id:string;currency_code:string;purpose:string;account_name:string|null}>`
      SELECT link.id AS link_id,account.id AS account_id,trim(account.currency_code) AS currency_code,
             link.purpose,account.name AS account_name
        FROM master.bank_account_link link
        JOIN master.bank_account account ON account.tenant_id=link.tenant_id AND account.id=link.bank_account_id
       WHERE link.tenant_id=${input.tenantId}::uuid
         AND account.status='active'
         AND (
           (link.owner_type='company_code' AND link.owner_id=${company.id}::uuid)
           OR link.company_code_id=${company.id}::uuid
         )
         AND link.effective_from<=${input.asOfDate}::date
         AND (link.effective_until IS NULL OR link.effective_until>${input.asOfDate}::date)
    `.execute(db),
    sql<{id:string;currency_code:string;direction:string;payment_method_id:string}>`
      SELECT id,trim(currency_code) AS currency_code,direction,payment_method_id
        FROM control.payment_method_company_policy
       WHERE tenant_id=${input.tenantId}::uuid
         AND company_code_id=${company.id}::uuid
         AND status='active' AND currency_code IS NOT NULL
         AND effective_from<=${input.asOfDate}::date
         AND (effective_until IS NULL OR effective_until>${input.asOfDate}::date)
    `.execute(db),
    sql<{id:string;book_id:string;book_code:string;currency_code:string;direction:string}>`
      SELECT rule.id,book.id AS book_id,book.code AS book_code,
             trim(COALESCE(assignment.override_currency_code,book.base_currency_code)) AS currency_code,
             rule.direction
        FROM control.payment_settlement_rule rule
        JOIN master.ledger_book book
          ON book.tenant_id=rule.tenant_id AND book.code=rule.book_code AND book.status='active'
        JOIN master.company_code_book_assignment assignment
          ON assignment.tenant_id=rule.tenant_id AND assignment.company_code_id=rule.company_code_id
         AND assignment.book_id=book.id AND assignment.status='active'
       WHERE rule.tenant_id=${input.tenantId}::uuid
         AND rule.company_code_id=${company.id}::uuid
         AND rule.status='active'
         AND rule.effective_from<=${input.asOfDate}::date
         AND (rule.effective_until IS NULL OR rule.effective_until>${input.asOfDate}::date)
    `.execute(db),
  ]);

  const sources: FxExposureSource[] = [];
  for (const book of books) {
    sources.push({
      sourceType:"ledger_book",sourceId:book.assignment_id,currencyCode:book.currency_code,
      purpose:"transaction",bookId:book.id,bookCode:book.code,
      detail:{bookName:book.name,currencySource:"book_assignment"},
    },{
      sourceType:"ledger_book",sourceId:book.assignment_id,currencyCode:book.currency_code,
      purpose:"revaluation",bookId:book.id,bookCode:book.code,
      detail:{bookName:book.name,currencySource:"book_assignment"},
    });
  }
  for (const bank of banks) {
    sources.push({
      sourceType:"bank_account",sourceId:bank.link_id,currencyCode:bank.currency_code,
      purpose:"transaction",bookId:null,bookCode:null,
      detail:{bankAccountId:bank.account_id,accountName:bank.account_name,purpose:bank.purpose},
    });
  }
  for (const policy of paymentPolicies) {
    sources.push({
      sourceType:"payment_policy",sourceId:policy.id,currencyCode:policy.currency_code,
      purpose:"transaction",bookId:null,bookCode:null,
      detail:{direction:policy.direction,paymentMethodId:policy.payment_method_id},
    });
  }
  for (const rule of settlementRules) {
    sources.push({
      sourceType:"settlement_rule",sourceId:rule.id,currencyCode:rule.currency_code,
      purpose:"transaction",bookId:rule.book_id,bookCode:rule.book_code,
      detail:{direction:rule.direction},
    });
  }

  const foreignSources = sources.filter(source => source.currencyCode !== company.functional_currency);
  const byCurrency = new Map<string,{purposes:Set<"transaction"|"revaluation">;count:number}>();
  for (const source of foreignSources) {
    const current=byCurrency.get(source.currencyCode)??{purposes:new Set(),count:0};
    current.purposes.add(source.purpose);
    current.count+=1;
    byCurrency.set(source.currencyCode,current);
  }

  return {
    company:{
      id:company.id,code:company.code,name:company.name,functionalCurrency:company.functional_currency,
      legalEntity:{id:company.legal_entity_id,code:company.legal_entity_code,name:company.legal_entity_name},
      tenantCode:company.tenant_code,tenantName:company.tenant_name,
    },
    asOfDate:input.asOfDate,
    hasForeignCurrencyExposure:foreignSources.length>0,
    currencies:[...byCurrency.entries()].map(([currencyCode,value])=>({
      currencyCode,purposes:[...value.purposes],sourceCount:value.count,
    })).sort((a,b)=>a.currencyCode.localeCompare(b.currencyCode)),
    sources:foreignSources,
  };
}
