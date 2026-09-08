import { createHash } from "node:crypto";

/** Synthetic development profiles; identifiers are fixtures, not legal validation rules. */
export const DEVELOPMENT_BUSINESS_PARTNER_COUNTRIES = {
  MY: {
    countryName: "Malaysia",
    currency: "MYR",
    legalSuffix: "Sdn Bhd",
    city: "Kuala Lumpur",
    region: "Wilayah Persekutuan",
    postalCode: "50450",
    street: "Jalan Demo",
    dialCode: "+60",
    registrationAuthority: "Companies Commission of Malaysia",
    jurisdictionCode: "MY-RMCD",
    taxAuthority: "Royal Malaysian Customs Department",
    taxType: "sales_tax",
    taxLabel: "SST",
    contactName: "Nur Aisyah",
    directorName: "Amir Hassan",
    accountType: "local",
  },
  DE: {
    countryName: "Germany",
    currency: "EUR",
    legalSuffix: "GmbH",
    city: "Frankfurt",
    region: "Hessen",
    postalCode: "60311",
    street: "Musterstrasse",
    dialCode: "+49",
    registrationAuthority: "Commercial Register",
    jurisdictionCode: "DE-BZST",
    taxAuthority: "Federal Central Tax Office",
    taxType: "vat",
    taxLabel: "VAT",
    contactName: "Lena Weber",
    directorName: "Jonas Fischer",
    accountType: "iban",
  },
  SG: {
    countryName: "Singapore",
    currency: "SGD",
    legalSuffix: "Pte Ltd",
    city: "Singapore",
    region: "Central",
    postalCode: "018989",
    street: "Example Business Road",
    dialCode: "+65",
    registrationAuthority: "Accounting and Corporate Regulatory Authority",
    jurisdictionCode: "SG-IRAS",
    taxAuthority: "Inland Revenue Authority of Singapore",
    taxType: "gst",
    taxLabel: "GST",
    contactName: "Mei Lin Tan",
    directorName: "Daniel Lim",
    accountType: "local",
  },
  GB: {
    countryName: "United Kingdom",
    currency: "GBP",
    legalSuffix: "Limited",
    city: "London",
    region: "Greater London",
    postalCode: "E14 9GE",
    street: "Merchant Square",
    dialCode: "+44",
    registrationAuthority: "Companies House",
    jurisdictionCode: "GB-HMRC",
    taxAuthority: "HM Revenue & Customs",
    taxType: "vat",
    taxLabel: "VAT",
    contactName: "Amelia Hart",
    directorName: "Eleanor North",
    accountType: "iban",
  },
  SA: {
    countryName: "Saudi Arabia",
    currency: "SAR",
    legalSuffix: "LLC",
    city: "Riyadh",
    region: "Riyadh",
    postalCode: "12211",
    street: "Example Trade Street",
    dialCode: "+966",
    registrationAuthority: "Ministry of Commerce",
    jurisdictionCode: "SA-ZATCA",
    taxAuthority: "Zakat, Tax and Customs Authority",
    taxType: "vat",
    taxLabel: "VAT",
    contactName: "Noura Al Salem",
    directorName: "Fahad Al Rashid",
    accountType: "iban",
  },
} as const;
export type DevelopmentBusinessPartnerCountry =
  keyof typeof DEVELOPMENT_BUSINESS_PARTNER_COUNTRIES;

export function buildDevelopmentBusinessPartnerProfile(fixture: {
  tenantCode: string;
  code: string;
  countryCode: string;
  name: string;
  legalName: string;
}) {
  if (!(fixture.countryCode in DEVELOPMENT_BUSINESS_PARTNER_COUNTRIES)) {
    throw new Error(
      `Unsupported development partner country: ${fixture.countryCode}`,
    );
  }
  const country =
    DEVELOPMENT_BUSINESS_PARTNER_COUNTRIES[
      fixture.countryCode as DevelopmentBusinessPartnerCountry
    ];
  const hash = createHash("sha256")
    .update(`${fixture.tenantCode}:${fixture.code}`)
    .digest("hex");
  const digits = BigInt(`0x${hash.slice(0, 15)}`)
    .toString()
    .padStart(18, "0");
  const slug = fixture.code.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const northwind =
    fixture.tenantCode === "cirrusatlantic" && fixture.code === "CATL-BP-001";
  const line1 = northwind
    ? "1 Merchant Square"
    : `${Number(digits.slice(-3)) + 1} ${country.street}`;
  const accountNumber = northwind
    ? "GB29NWBK60161331926819"
    : country.accountType === "iban"
      ? fixture.countryCode === "DE"
        ? iban("DE", `00000000${digits.slice(-10)}`)
        : fixture.countryCode === "SA"
          ? iban("SA", `00${digits}`)
          : iban("GB", `DEMO000000${digits.slice(-8)}`)
      : digits.slice(-12);
  return {
    ...country,
    line1,
    formattedAddress: `${line1}, ${country.city} ${country.postalCode}, ${country.countryName}`,
    website: `https://${northwind ? "northwind" : slug}.example.test`,
    email: northwind
      ? "amelia.hart@northwind.example.test"
      : `accounts@${slug}.example.test`,
    phone: northwind
      ? "+442079460180"
      : `${country.dialCode}${digits.slice(-8)}`,
    registrationNumber: northwind
      ? "08765432"
      : `DEMO-${fixture.countryCode}-${hash.slice(0, 12).toUpperCase()}`,
    taxNumber: northwind
      ? "GB123456789"
      : `DEMO-${country.taxLabel}-${hash.slice(0, 12).toUpperCase()}`,
    bankCode: northwind
      ? "northwind_gbp"
      : `${slug}_${country.currency.toLowerCase()}`,
    bankLabel: `${fixture.name} ${country.currency} remittance`,
    bankName: `Demo ${country.countryName} Bank`,
    accountNumber,
    accountLast4: accountNumber.slice(-4),
    holdingName: northwind
      ? "Northwind Holdings Ltd"
      : `${fixture.name} Holdings ${country.legalSuffix}`,
  };
}

function iban(country: string, bban: string): string {
  const rearranged = `${bban}${country}00`.replace(/[A-Z]/g, (letter) =>
    String(letter.charCodeAt(0) - 55),
  );
  const check = String(98n - (BigInt(rearranged) % 97n)).padStart(2, "0");
  return `${country}${check}${bban}`;
}
