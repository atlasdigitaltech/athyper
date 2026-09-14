import type { BusinessPartnerRequestExtensions } from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

const base = [
  "clientItemKey",
  "definitionFieldCode",
  "effectiveFrom",
  "effectiveUntil",
  "sourceReference",
];
const shapes: Readonly<
  Record<string, { required: readonly string[]; fields: readonly string[] }>
> = {
  aliases: {
    required: ["aliasName", "aliasKind"],
    fields: [
      "aliasName",
      "aliasKind",
      "languageCode",
      "countryCode",
      "isPrimary",
    ],
  },
  governanceRelations: {
    required: ["relationTypeCode", "memberName", "memberType"],
    fields: [
      "relationTypeCode",
      "memberName",
      "memberType",
      "memberBusinessPartnerId",
      "memberCountryCode",
      "businessTitle",
      "ownershipPct",
      "votingPct",
      "beneficialOwnershipPct",
      "appointedDate",
      "endOfTerm",
      "notes",
    ],
  },
  relationships: {
    required: ["targetBusinessPartnerId", "relationshipTypeCode"],
    fields: [
      "targetBusinessPartnerId",
      "relationshipTypeCode",
      "countryCode",
      "notes",
    ],
  },
};
const fail = (message: string): never => {
  throw new MasterDataError(422, "BUSINESS_PARTNER_PROFILE_INVALID", message);
};
/** Fixed business authority; metadata controls presentation, not writable audit/approval columns. */
export function validateBusinessPartnerProfile(
  value: BusinessPartnerRequestExtensions,
  draft = false,
): void {
  for (const [group, shape] of Object.entries(shapes)) {
    const rows = value[group as keyof BusinessPartnerRequestExtensions];
    if (!rows) continue;
    if (!Array.isArray(rows) || rows.length > 20)
      fail(`${group}: at most 20 records are allowed.`);
    for (const row of rows) {
      const item = row as unknown as Record<string, unknown>;
      if (!item || typeof item !== "object" || Array.isArray(item))
        fail(`${group}: invalid record.`);
      for (const key of Object.keys(item))
        if (![...base, ...shape.fields].includes(key))
          fail(`${group}: unsupported field ${key}.`);
      for (const key of draft ? [] : shape.required)
        if (typeof item[key] !== "string" || !String(item[key]).trim())
          fail(`${group}: ${key} is required.`);
      for (const [key, v] of Object.entries(item)) {
        if (key.endsWith("Pct")) {
          if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100)
            fail(`${group}: ${key} must be between 0 and 100.`);
          continue;
        }
        if (key === "isPrimary") {
          if (typeof v !== "boolean") fail(`${group}: invalid primary flag.`);
          continue;
        }
        if (typeof v !== "string" || !v.trim())
          fail(`${group}: ${key} must be nonempty text.`);
        const text = String(v);
        const limit =
          key === "notes"
            ? 4000
            : ["aliasName", "memberName"].includes(key)
              ? 320
              : 256;
        if (Array.from(text).length > limit)
          fail(`${group}: ${key} exceeds ${limit} characters.`);
        if (
          key.endsWith("Id") &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            text,
          )
        )
          fail(`${group}: ${key} must identify an existing record.`);
        if (key.endsWith("CountryCode") || key === "countryCode") {
          if (!/^[A-Z]{2}$/.test(text)) fail(`${group}: invalid country.`);
        }
        if (
          [
            "effectiveFrom",
            "effectiveUntil",
            "appointedDate",
            "endOfTerm",
          ].includes(key) &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
            !Number.isFinite(Date.parse(text)) ||
            new Date(text).toISOString().slice(0, 10) !== text)
        )
          fail(`${group}: ${key} must be a valid date.`);
        if (key.endsWith("TypeCode") && !/^[a-z][a-z0-9_.-]{1,62}$/.test(text))
          fail(`${group}: invalid relationship type.`);
      }
      if (
        group === "aliases" &&
        !["legal", "trading", "former", "search"].includes(
          String(item.aliasKind),
        )
      )
        fail("Invalid alias type.");
      if (
        group === "aliases" &&
        item.languageCode &&
        !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(String(item.languageCode))
      )
        fail("Invalid alias language.");
      if (group === "governanceRelations") {
        if (
          ![
            "individual",
            "organization",
            "trust",
            "public_float",
            "other",
          ].includes(String(item.memberType))
        )
          fail("Invalid governance member type.");
        if (item.memberType === "individual" && item.memberBusinessPartnerId)
          fail("Only an organization member can link to a Business Partner.");
        if (
          item.appointedDate &&
          item.endOfTerm &&
          String(item.endOfTerm) < String(item.appointedDate)
        )
          fail("End of term precedes appointment.");
      }
    }
  }
}
