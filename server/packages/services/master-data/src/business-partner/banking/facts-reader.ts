import { requiredText as text, optionalText, dateOnly as date } from "../record/row-values.js";
import { sql, type Transaction } from "kysely";
import type { BusinessPartner360BankingData } from "@athyper/server-contract-master-data";
import type { BusinessPartner360Repository, BusinessPartner360CommercialControlRead } from "../record/service.js";
import { receivedBankDisclosureCard } from "../../business-partner-bank-disclosure-card.js";
import { protectedTokenSql } from "../protected-values/storage-contract.js";

type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;
type Input = Parameters<BusinessPartner360Repository<Tx>["readCommercialControlSection"]>[0];



/** Caller enforces masked-read permission. Company context never filters partner facts. */
export async function readPartnerBankingFacts(input: Input, tx: Tx): Promise<BusinessPartner360CommercialControlRead> {
  const rows = (await sql<Row>`SELECT link.id::text link_id, account.id::text account_id,
    account.account_holder_name, account.account_last4, account.currency_code::text,
    account.account_id_type::text, account.bic_override, instrument.status account_status,
    ${protectedTokenSql(sql`account.metadata`)} IS NOT NULL reveal_available,
    COALESCE(bank.name, provisional.submitted_name) bank_name,
    bank.name directory_bank_name, bank.branch_name, bank.branch_code, bank.bic directory_bic,
    COALESCE(bank.country_code, provisional.submitted_country)::text bank_country_code,
    link.purpose, link.relationship_role::text, link.is_primary, link.effective_from, link.effective_until,
    provisional.id::text provisional_id, provisional.submitted_name, provisional.submitted_country::text,
    provisional.submitted_bic, provisional.status provisional_status,
    provisional.resolved_institution_id::text, provisional.resolved_branch_id::text
    FROM master.payment_instrument_link link
    JOIN control.owner_type owner ON owner.id=link.owner_type_id
    JOIN master.payment_instrument instrument ON instrument.tenant_id=link.tenant_id AND instrument.id=link.payment_instrument_id
    JOIN master.bank_account account ON account.tenant_id=instrument.tenant_id AND account.id=instrument.id
    LEFT JOIN master.bank_provisional_reference provisional ON provisional.tenant_id=account.tenant_id AND provisional.id=account.provisional_bank_reference_id
    LEFT JOIN shared.v_bank_directory bank ON bank.id=account.bank_institution_id AND bank.branch_id IS NOT DISTINCT FROM account.bank_branch_id
    WHERE link.tenant_id=${input.tenantId}::uuid AND link.owner_id=${input.businessPartnerId}::uuid
      AND owner.code='business_partner' AND (owner.tenant_id IS NULL OR owner.tenant_id=link.tenant_id)
      AND instrument.instrument_type_code='bank_account'
      AND link.effective_from<=${input.asOf}::date AND (link.effective_until IS NULL OR link.effective_until>${input.asOf}::date)
    ORDER BY link.is_primary DESC,link.effective_from DESC,link.id`.execute(tx)).rows;
  const accounts = rows.map(row => ({
    linkId:text(row,"link_id"), accountId:text(row,"account_id"),
    maskedAccount:`•••• ${text(row,"account_last4")}`, lastFour:text(row,"account_last4"),
    accountHolderName:text(row,"account_holder_name"), currencyCode:text(row,"currency_code"),
    bankName:optionalText(row,"bank_name") ?? "", bankCountryCode:optionalText(row,"bank_country_code") ?? "",
    accountIdType:text(row,"account_id_type"), bic:optionalText(row,"bic_override") ?? "",
    purpose:text(row,"purpose"), relationshipRole:text(row,"relationship_role"),
    source:"NEON", primary:row["is_primary"]===true, accountStatus:text(row,"account_status"),
    effectiveFrom:date(row["effective_from"]),
    ...(row["effective_until"] ? {effectiveUntil:date(row["effective_until"])} : {}),
    revealable:!input.historical && row["reveal_available"]===true,
  }));
  const received = (await sql<Row>`SELECT projection.id::text,projection.projection_status,
    projection.current_disclosure_id::text,projection.current_disclosure_version,snapshot.payload_json,snapshot.received_at
    FROM control.mesh_bank_account_projection projection
    JOIN control.mesh_business_partner_account_link mapping ON mapping.tenant_id=projection.tenant_id AND mapping.id=projection.account_link_id AND mapping.status='active'
    JOIN snapshot.mesh_bank_account_disclosure_received snapshot ON snapshot.tenant_id=projection.tenant_id AND snapshot.id=projection.current_snapshot_id
    WHERE projection.tenant_id=${input.tenantId}::uuid AND mapping.business_partner_id=${input.businessPartnerId}::uuid
      AND NOT ${input.historical} ORDER BY projection.id`.execute(tx)).rows.map(receivedBankDisclosureCard);
  const data: BusinessPartner360BankingData = {
    readOnly:input.historical, scopeState:input.historical ? "historical" : "global",
    accounts:[...accounts,...received],
    manageHref:`/mdg/business-partner/${encodeURIComponent(input.businessPartnerId)}/banking`,
    collections:{
      bank_accounts:[...new Map(rows.filter((row,index)=>rows.findIndex(candidate=>candidate.account_id===row.account_id)===index).map(row => [text(row,"account_id"),{
        id:text(row,"account_id"),account_holder_name:text(row,"account_holder_name"),
        account_last4:text(row,"account_last4"),currency_code:text(row,"currency_code"),status:text(row,"account_status"),
        bank_name:row["directory_bank_name"]??null,branch_name:row["branch_name"]??null,
        branch_code:row["branch_code"]??null,bic:row["directory_bic"]??null,
        reveal_link_id:text(row,"link_id"),revealable:!input.historical && row["reveal_available"]===true,
      }])).values()],
      payment_instrument_links:rows.map(row => ({id:text(row,"link_id"),payment_instrument_id:text(row,"account_id"),
        owner_id:input.businessPartnerId,relationship_role:text(row,"relationship_role"),purpose:text(row,"purpose"),
        account_last4:text(row,"account_last4"),is_primary:row["is_primary"]===true,
        effective_from:date(row["effective_from"]),effective_until:row["effective_until"] ? date(row["effective_until"]) : null})),
      bank_provisional_references:[...new Map(rows.filter(row => row["provisional_id"]).map(row => [text(row,"provisional_id"),{
        id:text(row,"provisional_id"),submitted_name:text(row,"submitted_name"),submitted_country:text(row,"submitted_country"),
        submitted_bic:row["submitted_bic"]??null,status:text(row,"provisional_status"),
        resolved_institution_id:row["resolved_institution_id"]??null,resolved_branch_id:row["resolved_branch_id"]??null,
      }])).values()],
    },
  };
  return {data,state:data.accounts.length ? "ready" : "empty",provenance:[{
    plane:"neon",service:"master-data",sourceObject:"master.payment_instrument_link",
    observedAt:new Date().toISOString(),schemaVersion:"1",
  }]};
}
