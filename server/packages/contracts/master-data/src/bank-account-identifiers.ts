import { isValidIBAN, isValidBIC } from "ibantools";

/** Format validation never establishes ownership or company acceptance. */
export function normalizeBankIdentifier(input: {
  accountIdType: string; accountIdentifier: string; bankCountryCode: string;
  clearingScheme?: string; branchCode?: string; bic?: string;
}) {
  const country = input.bankCountryCode.toUpperCase();
  const bic = input.bic?.trim().toUpperCase();
  if (bic && !isValidBIC(bic)) throw new Error("SWIFT/BIC is invalid");
  if (input.accountIdType === "iban") {
    const identifier = input.accountIdentifier.replace(/ /g, "").toUpperCase();
    if (!identifier.startsWith(country) || !isValidIBAN(identifier))
      throw new Error("IBAN country, structure, length or checksum is invalid");
    return { identifier, bic };
  }
  if (input.accountIdType !== "local") throw new Error("Account identifier type must be iban or local");
  // Domestic identifiers preserve leading zeroes; punctuation is not silently removed.
  const identifier = input.accountIdentifier.trim();
  const branch = input.branchCode?.replace(/[ -]/g, "") ?? "";
  const scheme = `${country}:${input.clearingScheme ?? ""}`;
  if (scheme === "GB:sort_code") {
    if (!/^\d{8}$/.test(identifier) || !/^\d{6}$/.test(branch))
      throw new Error("UK domestic accounts require 8 digits and a 6-digit sort code");
  } else if (scheme === "US:aba") {
    const digits = [...branch].map(Number);
    if (!/^\d{1,17}$/.test(identifier) || !/^\d{9}$/.test(branch) || /^0+$/.test(branch) ||
      digits.reduce((sum, digit, i) => sum + digit * [3, 7, 1][i % 3]!, 0) % 10 !== 0)
      throw new Error("US domestic account or ABA routing checksum is invalid");
  } else if (scheme === "AU:bsb") {
    if (!/^\d{5,9}$/.test(identifier) || !/^\d{6}$/.test(branch))
      throw new Error("Australian domestic account or BSB is invalid");
  } else {
    throw new Error("Domestic country and clearing scheme require a supported validation rule");
  }
  return { identifier, bic };
}

export function normalizeBankBic(value: string): string {
  const bic = value.trim().toUpperCase();
  if (!isValidBIC(bic)) throw new Error("SWIFT/BIC is invalid");
  return bic;
}
