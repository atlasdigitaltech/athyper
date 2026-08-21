import { createHash } from "node:crypto";
import type { AddressValue, ContactChannel } from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

export function normalizeContactValue(channel: ContactChannel, raw: string): string {
  const value = raw.trim();
  if (channel === "email") {
    const normalized = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) invalid("email");
    return normalized;
  }
  if (["phone", "fax", "sms", "whatsapp"].includes(channel)) {
    const normalized = value.replace(/[\s().-]/gu, "");
    if (!/^\+[1-9][0-9]{1,14}$/u.test(normalized)) invalid("phone");
    return normalized;
  }
  if (channel === "website") {
    let url: URL;
    try { url = new URL(value); } catch { invalid("website"); }
    if (url!.protocol !== "https:" && url!.protocol !== "http:") invalid("website");
    url!.hostname = url!.hostname.toLowerCase();
    return url!.toString();
  }
  return value;
}

export function normalizeAddress(input: AddressValue): { readonly address: AddressValue; readonly hash: string } {
  const address: AddressValue = compact({
    addressType: normalizeText(input.addressType)?.toLowerCase(),
    line1: normalizeText(input.line1), line2: normalizeText(input.line2), line3: normalizeText(input.line3),
    city: normalizeText(input.city), region: normalizeText(input.region),
    postalCode: normalizeText(input.postalCode)?.toUpperCase(),
    countryCode: normalizeCountry(input.countryCode), latitude: input.latitude, longitude: input.longitude,
  });
  if (!address.countryCode && !address.line1 && !address.city && !address.postalCode) throw new MasterDataError(400, "ADDRESS_EMPTY", "An address needs a country, line, city, or postal code");
  if ((address.latitude === undefined) !== (address.longitude === undefined)) throw new MasterDataError(400, "ADDRESS_COORDINATES_INCOMPLETE", "Latitude and longitude must be supplied together");
  if (address.latitude !== undefined && (address.latitude < -90 || address.latitude > 90)) throw new MasterDataError(400, "ADDRESS_LATITUDE_INVALID", "Latitude is outside its valid range");
  if (address.longitude !== undefined && (address.longitude < -180 || address.longitude > 180)) throw new MasterDataError(400, "ADDRESS_LONGITUDE_INVALID", "Longitude is outside its valid range");
  const comparable = Object.fromEntries(Object.entries(address).map(([key, value]) => [key, typeof value === "string" ? value.toLocaleLowerCase("en-US") : value]));
  return { address, hash: createHash("sha256").update(JSON.stringify(comparable), "utf8").digest("hex") };
}

export function normalizePurpose(value?: string): string {
  const purpose = (value ?? "default").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,62}$/u.test(purpose)) throw new MasterDataError(400, "PURPOSE_INVALID", "Purpose is invalid");
  return purpose;
}

export function normalizeOptional(value?: string): string | undefined { return normalizeText(value); }

function normalizeCountry(value?: string): string | undefined {
  const country = normalizeText(value)?.toUpperCase();
  if (country && !/^[A-Z]{2}$/u.test(country)) throw new MasterDataError(400, "COUNTRY_CODE_INVALID", "Country code must be ISO alpha-2");
  return country;
}
function normalizeText(value?: string): string | undefined { const normalized = value?.trim().replace(/\s+/gu, " "); return normalized || undefined; }
function compact<T extends object>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T; }
function invalid(kind: string): never { throw new MasterDataError(400, "CONTACT_VALUE_INVALID", `Invalid ${kind} contact value`); }
