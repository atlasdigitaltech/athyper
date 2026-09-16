const labels: Readonly<Record<string, string>> = {
  private_limited: "Private limited company",
  public_limited: "Public limited company",
  vat: "VAT",
  isic: "ISIC",
  naics: "NAICS",
  sst: "SST",
  ap: "AP",
  ar: "AR",
};
export function businessLabel(value: string, casing?: "sentence" | "title"): string;
export function businessLabel(value: string | undefined, casing?: "sentence" | "title"): string | undefined;
export function businessLabel(value: string | undefined, casing: "sentence" | "title" = "sentence"): string | undefined {
  if (!value) return value;
  if (labels[value]) return labels[value];
  const words = value.replaceAll(/[._-]+/g, " ");
  const formatted = casing === "title"
    ? words.replace(/\b\w/g, letter => letter.toUpperCase())
    : words.charAt(0).toUpperCase() + words.slice(1);
  return formatted.replace(/\b(vat|isic|naics|sst|ap|ar)\b/gi, abbreviation => abbreviation.toUpperCase());
}
export function countryName(value: string | undefined): string | undefined {
  if (!value || !/^[A-Z]{2}$/.test(value)) return value;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(value) ?? value;
  } catch {
    return value;
  }
}
export function safeDocumentUrl(value: string): string | undefined {
  try {
    const url = new URL(value, window.location.origin);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
