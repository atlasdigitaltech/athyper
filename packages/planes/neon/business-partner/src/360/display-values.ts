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
export function businessLabel(value: string | undefined): string | undefined {
  if (!value) return value;
  return (
    labels[value] ??
    value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ")
  );
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
