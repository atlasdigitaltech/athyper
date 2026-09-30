import { sql } from "kysely";
import type {
  BankValidationRepository,
  BankValidationRule,
} from "@athyper/server-contract-control-admin";
import {
  ControlRepositoryDb,
  type Row,
  fail,
} from "./control-repository-db.js";
import { validateRule, verifyBankRules } from "./bank-validation.js";
export class KyselyBankValidationRepository
  extends ControlRepositoryDb
  implements BankValidationRepository
{
  async list() {
    return this.run(undefined, undefined, undefined, async (tx) =>
      (
        await sql<Row>`SELECT * FROM control.bank_account_validation_rule ORDER BY code`.execute(
          tx,
        )
      ).rows.map(map),
    );
  }
  async listApplicable(
    input: Parameters<BankValidationRepository["listApplicable"]>[0],
  ) {
    // Match verifyBankRules applicability before strict mapping; never filter mapping errors.
    return this.run(undefined, undefined, undefined, async (tx) =>
      (
        await sql<Row>`SELECT * FROM control.bank_account_validation_rule
        WHERE status='active' AND country_code=${input.countryCode}::char(2)
          AND payment_rail_code=${input.railCode}
          AND (currency_code IS NULL OR currency_code=${input.currencyCode ?? null}::char(3))
          AND (direction='both' OR direction=${input.direction ?? null})
        ORDER BY code`.execute(tx)
      ).rows.map(map),
    );
  }
  async get(id: string) {
    return this.run(undefined, undefined, undefined, async (tx) => {
      const r = (
        await sql<Row>`SELECT * FROM control.bank_account_validation_rule WHERE id=${id}::uuid`.execute(
          tx,
        )
      ).rows[0];
      return r ? map(r) : undefined;
    });
  }
  async publish(rule: BankValidationRule, actor: string, tenant?: string) {
    if (this.plane !== "studio" || !tenant)
      throw fail(403, "PERMISSION_DENIED");
    validateRule(rule);
    if (rule.status !== "active")
      throw fail(400, "BANK_PUBLICATION_REQUIRES_ACTIVE_RULE");
    for (const f of rule.fixtures) {
      const result = verifyBankRules([rule], f.input);
      if (result.ruleId !== rule.id || result.valid !== f.valid)
        throw fail(400, "BANK_RULE_INVALID");
    }
    return this.run(
      tenant,
      actor,
      "bank-validation-publication",
      async (tx) => {
        const old = (
          await sql<Row>`SELECT * FROM control.bank_account_validation_rule WHERE id=${rule.id}::uuid FOR UPDATE`.execute(
            tx,
          )
        ).rows[0];
        // The supplied rule version is the proposed publication version.
        if (rule.version !== (old ? Number(old.version) + 1 : 1))
          throw fail(409, "VERSION_CONFLICT");
        if (old && old.code !== rule.code)
          throw fail(409, "IDENTITY_IMMUTABLE");
        if (old) map(old); // refuse to erase native checks outside this API's model.
        const name = rule.name ?? old?.name,
          accountType =
            rule.accountIdentifierType ?? old?.account_identifier_type,
          bankType = rule.bankIdentifierType ?? old?.bank_identifier_type;
        if (!name || !accountType || !bankType)
          throw fail(400, "BANK_IDENTIFIER_TYPES_REQUIRED");
        const fields = {
          name,
          direction: rule.direction ?? old?.direction ?? "both",
          country_code: rule.countryCode,
          currency_code: rule.currencyCode ?? null,
          payment_rail_code: rule.railCode,
          priority: rule.priority,
          account_identifier_type: accountType,
          bank_identifier_type: bankType,
          is_account_identifier_required: rule.accountRequired,
          is_bank_identifier_required: rule.bankRequired,
          is_bic_allowed: rule.bicAllowed,
          is_bic_required: rule.bicRequired,
          is_branch_code_required: rule.branchRequired,
          account_pattern: rule.accountPattern ?? null,
          bank_identifier_pattern: rule.bankPattern ?? null,
          branch_code_pattern: rule.branchPattern ?? null,
          is_checksum_validated: rule.checksumValidated,
          test_fixtures: sql`${JSON.stringify(rule.fixtures)}::jsonb`,
        };
        let row: Row;
        if (!old) {
          const values = {
            id: rule.id,
            code: rule.code,
            ...fields,
            created_by: actor,
          };
          row = (
            await sql<Row>`INSERT INTO control.bank_account_validation_rule(${sql.join(Object.keys(values).map((k) => sql.ref(k)))}) VALUES(${sql.join(Object.values(values).map((v) => sql`${v}`))}) RETURNING *`.execute(
              tx,
            )
          ).rows[0]!;
        } else
          row = (
            await sql<Row>`UPDATE control.bank_account_validation_rule SET ${sql.join(Object.entries(fields).map(([k, v]) => sql`${sql.ref(k)}=${v}`))},updated_by=${actor}::uuid WHERE id=${rule.id}::uuid RETURNING *`.execute(
              tx,
            )
          ).rows[0]!;
        await this.evidence(
          tx,
          tenant,
          actor,
          "bank_validation",
          rule.id,
          Number(row.version),
          "published",
          { catalogScope: "plane" },
        );
        return map(row);
      },
    );
  }
}
function map(r: Row): BankValidationRule {
  // Never silently weaken rules whose native checks cannot be expressed by the API.
  if (
    r.is_national_bank_code_required ||
    Object.keys(r.validation_schema).length ||
    (r.iban_country_prefix && r.iban_country_prefix !== r.country_code)
  )
    throw fail(503, "BANK_NATIVE_RULE_UNSUPPORTED");
  return {
    id: r.id,
    direction: r.direction,
    version: Number(r.version),
    code: r.code,
    name: r.name,
    accountIdentifierType: r.account_identifier_type,
    bankIdentifierType: r.bank_identifier_type,
    countryCode: r.country_code,
    ...(r.currency_code ? { currencyCode: r.currency_code } : {}),
    railCode: r.payment_rail_code,
    priority: Number(r.priority),
    accountRequired: r.is_account_identifier_required,
    bankRequired: r.is_bank_identifier_required,
    bicAllowed: r.is_bic_allowed,
    bicRequired: r.is_bic_required,
    branchRequired: r.is_branch_code_required,
    ...(r.account_pattern ? { accountPattern: r.account_pattern } : {}),
    ...(r.bank_identifier_pattern
      ? { bankPattern: r.bank_identifier_pattern }
      : {}),
    ...(r.branch_code_pattern ? { branchPattern: r.branch_code_pattern } : {}),
    checksumValidated: r.is_checksum_validated,
    fixtures: r.test_fixtures,
    status: r.status === "active" ? "active" : "retired",
  };
}
