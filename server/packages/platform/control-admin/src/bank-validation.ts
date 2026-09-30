import { runInNewContext } from "node:vm";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { controlAdminPermissions, controlAdminSchemas, type BankValidationInput, type BankValidationRepository, type BankValidationResult, type BankValidationRule } from "@athyper/server-contract-control-admin";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { HttpError, validateRuntimeSchema } from "@athyper/server-runtime-http";

export function createBankValidationService(options: { readonly authorizer: Authorizer; readonly repositories: ExactPlaneRepositoryProvider<BankValidationRepository> }) {
  const permit = async (context: VerifiedRequestContext, permissionCode: string) => {
    if (!(await options.authorizer.authorize({ context, permissionCode })).allowed) throw new HttpError(403, "CONTROL_ADMIN_PERMISSION_DENIED", "Bank-validation permission denied");
  };
  const repositoryFor = (context: VerifiedRequestContext): BankValidationRepository => {
    try { return options.repositories.require(context.planeKey); }
    catch (error) {
      if (error instanceof Error && "status" in error && error.status === 503) throw new HttpError(503, "CONTROL_ADMIN_BANK_REPOSITORY_UNAVAILABLE", "Bank-validation repository unavailable");
      throw error;
    }
  };
  return {
    async list(context: VerifiedRequestContext) {
      await permit(context, controlAdminPermissions.catalogRead);
      return repositoryFor(context).list();
    },
    async verify(context: VerifiedRequestContext, input: BankValidationInput) {
      await permit(context, controlAdminPermissions.catalogRead);
      const normalized = normalizeInput(input);
      const candidates = await repositoryFor(context).listApplicable({
        countryCode: normalized.countryCode, railCode: normalized.railCode,
        ...(normalized.currencyCode ? {currencyCode:normalized.currencyCode} : {}),
        ...(normalized.direction ? {direction:normalized.direction} : {}),
      });
      return verifyBankRules(candidates, normalized);
    },
    async publish(context: VerifiedRequestContext, rule: BankValidationRule) {
      await permit(context, controlAdminPermissions.catalogPublish);
      if (context.planeKey !== "studio") throw new HttpError(403, "CONTROL_ADMIN_PERMISSION_DENIED", "Bank-validation publication requires Studio");
      validateRule(rule);
      for (const fixture of rule.fixtures) {
        // Even a negative fixture must exercise this rule, not merely fail selection.
        const input = normalizeInput(fixture.input);
        const result = verifyBankRules([{ ...rule, status: "active" }], input);
        if (result.ruleId !== rule.id || result.valid !== fixture.valid) throw invalidRule();
      }
      return repositoryFor(context).publish(rule, context.principalId, context.tenantId);
    },
  };
}

export function verifyBankRules(rules: readonly BankValidationRule[], supplied: BankValidationInput): BankValidationResult {
  const input = normalizeInput(supplied);
  const rule = rules.filter(item => item.status === "active" && (!item.direction || item.direction === "both" || item.direction === input.direction) && item.countryCode === input.countryCode && item.railCode === input.railCode && (!item.currencyCode || item.currencyCode === input.currencyCode))
    .sort((a, b) => b.priority - a.priority || Number(Boolean(b.currencyCode)) - Number(Boolean(a.currencyCode)) || a.code.localeCompare(b.code))[0];
  if (!rule) return { valid: false, issues: ["BANK_RULE_NOT_FOUND"] };
  validateRule(rule);
  const issues: string[] = [];
  // Only IBAN-mode accounts are uppercased and stripped of presentation spaces.
  const account = rule.checksumValidated ? input.accountIdentifier?.replace(/ /g, "").toUpperCase() : input.accountIdentifier;
  required(rule.accountRequired, account, "ACCOUNT_REQUIRED", issues);
  required(rule.bankRequired, input.bankIdentifier, "BANK_REQUIRED", issues);
  required(rule.bicRequired, input.bic, "BIC_REQUIRED", issues);
  required(rule.branchRequired, input.branchCode, "BRANCH_REQUIRED", issues);
  if (!rule.bicAllowed && input.bic) issues.push("BIC_NOT_ALLOWED");
  // ISO 9362 business-party prefix and suffix are alphanumeric; country is alphabetic.
  if (rule.bicAllowed && input.bic && !/^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(input.bic)) issues.push("BIC_INVALID");
  pattern(rule.accountPattern, account, "ACCOUNT_INVALID", issues);
  pattern(rule.bankPattern, input.bankIdentifier, "BANK_INVALID", issues);
  pattern(rule.branchPattern, input.branchCode, "BRANCH_INVALID", issues);
  if (rule.checksumValidated && account && (!account.startsWith(input.countryCode) || !validIban(account))) issues.push("CHECKSUM_INVALID");
  return { valid: issues.length === 0, ruleId: rule.id, issues };
}

function normalizeInput(input: BankValidationInput): BankValidationInput {
  try { validateRuntimeSchema(controlAdminSchemas.bankInput, input); }
  catch { throw new HttpError(400, "CONTROL_ADMIN_BANK_INPUT_INVALID", "Invalid bank-validation input"); }
  return {
    ...(input.direction ? {direction:input.direction} : {}),
    countryCode: input.countryCode.toUpperCase(),
    railCode: input.railCode,
    ...(input.currencyCode !== undefined ? { currencyCode: input.currencyCode.toUpperCase() } : {}),
    ...(input.accountIdentifier !== undefined ? { accountIdentifier: input.accountIdentifier.trim() } : {}),
    ...(input.bankIdentifier !== undefined ? { bankIdentifier: input.bankIdentifier.trim() } : {}),
    ...(input.branchCode !== undefined ? { branchCode: input.branchCode.trim() } : {}),
    ...(input.bic !== undefined ? { bic: input.bic.trim().toUpperCase() } : {}),
  };
}

export function validateRule(rule: BankValidationRule): void {
  try { validateRuntimeSchema(controlAdminSchemas.bankRule, rule); }
  catch { throw invalidRule(); }
  if (rule.bicRequired && !rule.bicAllowed) throw invalidRule();
  for (const source of [rule.accountPattern, rule.bankPattern, rule.branchPattern]) {
    if (source !== undefined) try { new RegExp(source); } catch { throw invalidRule(); }
  }
}
function required(isRequired: boolean, value: string | undefined, issue: string, issues: string[]): void { if (isRequired && !value) issues.push(issue); }
function pattern(source: string | undefined, value: string | undefined, issue: string, issues: string[]): void { if (source && value && !boundedPattern(source,value)) issues.push(issue); }
function validIban(value: string): boolean {
  if (value.length > 34 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(value)) return false;
  const expanded = `${value.slice(4)}${value.slice(0, 4)}`.replace(/[A-Z]/g, letter => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
function invalidRule(): HttpError { return new HttpError(400, "CONTROL_ADMIN_BANK_RULE_INVALID", "Invalid bank-validation rule or fixtures"); }

// Administrator-supplied regexes must not monopolize the API event loop.
function boundedPattern(source:string,value:string):boolean {
  try{return runInNewContext("new RegExp(source).test(value)",{source,value},{timeout:25}) as boolean;}
  catch {throw new HttpError(503,"CONTROL_ADMIN_BANK_PATTERN_UNAVAILABLE","Bank-validation pattern exceeded its execution budget");}
}
