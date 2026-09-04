import { sql, type Transaction } from "kysely";
import type {
  BusinessPartner360AddressItem,
  BusinessPartner360ContactItem,
} from "@athyper/server-contract-master-data";
import type {
  BusinessPartner360CommonSectionRead,
  BusinessPartner360Repository,
  BusinessPartner360RestrictedValue,
} from "./business-partner-360-service.js";

type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;
type Input = Parameters<
  BusinessPartner360Repository<Tx>["readCommonSection"]
>[0];
type Positioned<T> = {
  readonly item: T;
  readonly at: string;
  readonly id: string;
};

export async function readBusinessPartner360CommonSection(
  input: Input,
  transaction: Tx,
): Promise<BusinessPartner360CommonSectionRead> {
  input = { ...input, limit: Math.max(1, input.limit - 1) };
  const ownerTypes = (
    await sql<{
      id: string;
      code: string;
    }>`SELECT id::text,code FROM control.owner_type WHERE code IN('business_partner','contact_person') AND status='active' AND (tenant_id IS NULL OR tenant_id=${input.tenantId}::uuid) ORDER BY tenant_id NULLS LAST`.execute(
      transaction,
    )
  ).rows;
  const businessPartnerOwnerType = ownerTypes.find(
    (row) => row.code === "business_partner",
  )?.id;
  const contactPersonOwnerType = ownerTypes.find(
    (row) => row.code === "contact_person",
  )?.id;
  if (!businessPartnerOwnerType)
    throw new Error("BP_360_OWNER_TYPE_MISSING:business_partner");
  const positioned =
    input.sectionCode === "identity"
      ? await identity(input, businessPartnerOwnerType, transaction)
      : input.sectionCode === "contacts"
        ? await contacts(
            input,
            businessPartnerOwnerType,
            contactPersonOwnerType,
            transaction,
          )
        : input.sectionCode === "addresses"
          ? await addresses(input, businessPartnerOwnerType, transaction)
          : input.sectionCode === "governance"
            ? await governance(input, transaction)
            : await identifiers(input, businessPartnerOwnerType, transaction);
  const ordered = positioned.sort(
      (left, right) =>
        right.at.localeCompare(left.at) || right.id.localeCompare(left.id),
    ),
    page = ordered.slice(0, input.limit),
    last = page.at(-1),
    hasNext = ordered.length > input.limit;
  return {
    items: page.map((value) => value.item),
    ...(hasNext && last ? { next: { at: last.at, id: last.id } } : {}),
    provenance: [
      {
        plane: "neon",
        service: "master-data",
        sourceObject: source(input.sectionCode),
        observedAt: input.cursor.snapshotAt,
        schemaVersion: "1",
      },
    ],
    redactions:
      input.sectionCode === "identifiers-tax"
        ? [
            {
              fieldCode: "identifier.value",
              classification: "restricted",
              behavior: "masked",
              reasonCode: "BP_360_MASKED_BY_POLICY",
            },
            {
              fieldCode: "tax.registration.value",
              classification: "highly_restricted",
              behavior: "masked",
              reasonCode: "BP_360_MASKED_BY_POLICY",
            },
          ]
        : [],
  };
}

export async function readBusinessPartner360RestrictedTaxValue(
  input: Parameters<
    BusinessPartner360Repository<Tx>["readRestrictedTaxValue"]
  >[0],
  transaction: Tx,
): Promise<BusinessPartner360RestrictedValue | null> {
  const row = (
    await sql<Row>`SELECT registration_number,(metadata->>'protected')::boolean protected FROM master.business_partner_tax_registration WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.businessPartnerId}::uuid AND id=${input.taxRegistrationId}::uuid AND status='active' LIMIT 1`.execute(
      transaction,
    )
  ).rows[0];
  return row
    ? {
        tokenOrValue: text(row, "registration_number"),
        protected: Boolean(row["protected"]),
      }
    : null;
}

async function identity(
  input: Input,
  ownerType: string,
  transaction: Tx,
): Promise<Positioned<unknown>[]> {
  const [root, classifications, references] = await Promise.all([
    sql<Row>`SELECT bp.id::text,bp.code,bp.name,bp.display_name,bp.legal_name,COALESCE((SELECT array_agg(alias.alias_name ORDER BY alias.is_primary DESC,alias.alias_name) FROM master.business_partner_alias alias WHERE alias.tenant_id=bp.tenant_id AND alias.business_partner_id=bp.id AND alias.status='active' AND alias.effective_from<=${input.asOf}::date AND(alias.effective_until IS NULL OR alias.effective_until>${input.asOf}::date)),'{}'::text[]) aliases,bp.partner_category::text,bp.ownership_class::text,bp.legal_classification::text,bp.legal_form,bp.registration_country_code::text,bp.incorporation_date,bp.website_url,bp.status::text,bp.created_at,parent.id::text parent_id,parent.code parent_code,COALESCE(parent.display_name,parent.name) parent_name FROM master.business_partner bp LEFT JOIN master.business_partner parent ON parent.tenant_id=bp.tenant_id AND parent.id=bp.parent_business_partner_id WHERE bp.tenant_id=${input.tenantId}::uuid AND bp.id=${input.businessPartnerId}::uuid AND bp.partner_category='organization' AND bp.created_at<=${input.cursor.snapshotAt}::timestamptz AND ${!input.cursor.afterAt}`.execute(
      transaction,
    ),
    sql<Row>`SELECT id::text,industry_domain_code,industry_code_id::text,assignment_kind,is_primary,verified_at,effective_from,effective_until,created_at FROM master.business_partner_industry_classification WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.businessPartnerId}::uuid AND status='active' AND effective_from<=${input.asOf}::date AND(effective_until IS NULL OR effective_until>${input.asOf}::date) AND created_at<=${input.cursor.snapshotAt}::timestamptz ${after(input)} ORDER BY created_at DESC,id DESC LIMIT ${input.limit + 1}`.execute(
      transaction,
    ),
    sql<Row>`SELECT id::text,source_system_code,external_entity_code,external_id,external_code,created_at FROM master.external_reference WHERE tenant_id=${input.tenantId}::uuid AND owner_type_id=${ownerType}::uuid AND owner_id=${input.businessPartnerId}::uuid AND status='active' AND created_at<=${input.cursor.snapshotAt}::timestamptz ${after(input)} ORDER BY created_at DESC,id DESC LIMIT ${input.limit + 1}`.execute(
      transaction,
    ),
  ]);
  return [
    ...root.rows.map((row) =>
      position(row, {
        kind: "canonical",
        id: text(row, "id"),
        code: text(row, "code"),
        displayName: optional(row, "display_name") ?? text(row, "name"),
        ...(optional(row, "legal_name")
          ? { legalName: optional(row, "legal_name") }
          : {}),
        aliases: stringArray(row["aliases"]),
        category: "organization" as const,
        ownershipClass: text(row, "ownership_class"),
        ...(optional(row, "legal_classification")
          ? { legalClassification: optional(row, "legal_classification") }
          : {}),
        ...(optional(row, "legal_form")
          ? { legalForm: optional(row, "legal_form") }
          : {}),
        ...(optional(row, "registration_country_code")
          ? {
              registrationCountryCode: optional(
                row,
                "registration_country_code",
              ),
            }
          : {}),
        ...(row["incorporation_date"]
          ? { incorporationDate: date(row["incorporation_date"]) }
          : {}),
        ...(optional(row, "website_url")
          ? { websiteUrl: optional(row, "website_url") }
          : {}),
        ...(optional(row, "parent_id")
          ? {
              parent: {
                id: optional(row, "parent_id")!,
                code: optional(row, "parent_code")!,
                displayName: optional(row, "parent_name")!,
              },
            }
          : {}),
        lifecycleStatus: text(row, "status"),
      }),
    ),
    ...classifications.rows.map((row) =>
      position(row, {
        kind: "classification",
        id: text(row, "id"),
        industryDomainCode: text(row, "industry_domain_code"),
        industryCodeId: text(row, "industry_code_id"),
        assignmentKind: text(row, "assignment_kind"),
        primary: Boolean(row["is_primary"]),
        verified: Boolean(row["verified_at"]),
        effectiveFrom: date(row["effective_from"]),
        ...(row["effective_until"]
          ? { effectiveUntil: date(row["effective_until"]) }
          : {}),
      }),
    ),
    ...references.rows.map((row) =>
      position(row, {
        kind: "external_reference",
        id: text(row, "id"),
        sourceSystemCode: text(row, "source_system_code"),
        externalEntityCode: text(row, "external_entity_code"),
        externalId: text(row, "external_id"),
        ...(optional(row, "external_code")
          ? { externalCode: optional(row, "external_code") }
          : {}),
      }),
    ),
  ];
}

async function contacts(
  input: Input,
  ownerType: string,
  contactOwnerType: string | undefined,
  transaction: Tx,
): Promise<Positioned<BusinessPartner360ContactItem>[]> {
  if (!contactOwnerType) return [];
  const people = (
    await sql<Row>`SELECT id::text,contact_name,business_title,department_name,is_primary,created_at FROM master.contact_person WHERE tenant_id=${input.tenantId}::uuid AND owner_type_id=${ownerType}::uuid AND owner_id=${input.businessPartnerId}::uuid AND status='active' AND created_at<=${input.cursor.snapshotAt}::timestamptz ${after(input)} ORDER BY created_at DESC,id DESC LIMIT ${input.limit + 1}`.execute(
      transaction,
    )
  ).rows;
  if (!people.length) return [];
  const ids = people.map((row) => text(row, "id")),
    [roles, channels] = await Promise.all([
      sql<Row>`SELECT contact_person_id::text,role_code,is_primary,effective_from,effective_until FROM master.contact_person_role WHERE tenant_id=${input.tenantId}::uuid AND contact_person_id=ANY(${ids}::uuid[]) AND effective_from<=${input.asOf}::date AND(effective_until IS NULL OR effective_until>${input.asOf}::date) ORDER BY contact_person_id,is_primary DESC,role_code`.execute(
        transaction,
      ),
      sql<Row>`SELECT link.owner_id::text contact_person_id,link.id::text,link.channel_type,link.value,link.purpose,link.is_primary,link.is_verified,link.effective_from,link.effective_until,email.mx_valid,email.bounce_count,phone.line_type FROM master.contact_link link LEFT JOIN master.contact_email email ON email.tenant_id=link.tenant_id AND email.contact_link_id=link.id LEFT JOIN master.contact_phone phone ON phone.tenant_id=link.tenant_id AND phone.contact_link_id=link.id WHERE link.tenant_id=${input.tenantId}::uuid AND link.owner_type_id=${contactOwnerType}::uuid AND link.owner_id=ANY(${ids}::uuid[]) AND link.status='active' AND link.effective_from<=${input.asOf}::date AND(link.effective_until IS NULL OR link.effective_until>${input.asOf}::date) ORDER BY link.owner_id,link.is_primary DESC,link.channel_type,link.id`.execute(
        transaction,
      ),
    ]),
    rolesByPerson = group(roles.rows, "contact_person_id"),
    channelsByPerson = group(channels.rows, "contact_person_id");
  return people.map((row) => {
    const id = text(row, "id");
    return position(row, {
      id,
      displayName: text(row, "contact_name"),
      ...(optional(row, "business_title")
        ? { businessTitle: optional(row, "business_title") }
        : {}),
      ...(optional(row, "department_name")
        ? { departmentName: optional(row, "department_name") }
        : {}),
      primary: Boolean(row["is_primary"]),
      roles: (rolesByPerson.get(id) ?? []).map((value) => ({
        code: text(value, "role_code"),
        primary: Boolean(value["is_primary"]),
        effectiveFrom: date(value["effective_from"]),
        ...(value["effective_until"]
          ? { effectiveUntil: date(value["effective_until"]) }
          : {}),
      })),
      channels: (channelsByPerson.get(id) ?? []).map((value) => ({
        id: text(value, "id"),
        type: text(
          value,
          "channel_type",
        ) as BusinessPartner360ContactItem["channels"][number]["type"],
        value: text(value, "value"),
        purpose: text(value, "purpose"),
        primary: Boolean(value["is_primary"]),
        verified: Boolean(value["is_verified"]),
        effectiveFrom: iso(value["effective_from"]),
        ...(value["effective_until"]
          ? { effectiveUntil: iso(value["effective_until"]) }
          : {}),
        ...(optional(value, "line_type")
          ? { quality: optional(value, "line_type") }
          : value["mx_valid"] !== null && value["mx_valid"] !== undefined
            ? {
                quality: Boolean(value["mx_valid"]) ? "mx_valid" : "mx_invalid",
              }
            : {}),
      })),
    });
  });
}

async function addresses(
  input: Input,
  ownerType: string,
  transaction: Tx,
): Promise<Positioned<BusinessPartner360AddressItem>[]> {
  const rows = (
    await sql<Row>`SELECT address.id::text,link.id::text link_id,link.purpose,link.is_primary,link.effective_from,link.effective_until,address.address_kind,address.line1,address.line2,address.line3,address.city,address.dependent_locality,address.region,address.postal_code,address.country_code::text,address.formatted_address,address.validation_status,address.validation_provider,address.validation_confidence,address.validated_at,link.created_at FROM master.address_link link JOIN master.address address ON address.tenant_id=link.tenant_id AND address.id=link.address_id WHERE link.tenant_id=${input.tenantId}::uuid AND link.owner_type_id=${ownerType}::uuid AND link.owner_id=${input.businessPartnerId}::uuid AND link.usage_status='active' AND address.status='active' AND link.effective_from<=${input.asOf}::date AND(link.effective_until IS NULL OR link.effective_until>${input.asOf}::date) AND link.created_at<=${input.cursor.snapshotAt}::timestamptz ${after(input, "link.created_at", "link.id")} ORDER BY link.created_at DESC,link.id DESC LIMIT ${input.limit + 1}`.execute(
      transaction,
    )
  ).rows;
  if (!rows.length) return [];
  const addressIds = rows.map((row) => text(row, "id")),
    events = (
      await sql<Row>`SELECT id::text,subject_address_id::text,event_type,occurred_at,result_status,confidence,reason_code FROM(SELECT event.*,row_number()OVER(PARTITION BY subject_address_id ORDER BY occurred_at DESC,id DESC) rank FROM master.address_event event WHERE tenant_id=${input.tenantId}::uuid AND subject_address_id=ANY(${addressIds}::uuid[]) AND occurred_at<=${input.cursor.snapshotAt}::timestamptz) ranked WHERE rank<=5 ORDER BY subject_address_id,occurred_at DESC,id DESC`.execute(
        transaction,
      )
    ).rows,
    eventsByAddress = group(events, "subject_address_id");
  return rows.map((row) => {
    const id = text(row, "id");
    return position(row, {
      id,
      purpose: text(row, "purpose"),
      addressKind: text(row, "address_kind"),
      lines: [
        optional(row, "line1"),
        optional(row, "line2"),
        optional(row, "line3"),
      ].filter((value): value is string => Boolean(value)),
      ...(optional(row, "city") || optional(row, "dependent_locality")
        ? {
            locality:
              optional(row, "city") ?? optional(row, "dependent_locality"),
          }
        : {}),
      ...(optional(row, "region") ? { region: optional(row, "region") } : {}),
      ...(optional(row, "postal_code")
        ? { postalCode: optional(row, "postal_code") }
        : {}),
      countryCode: text(row, "country_code"),
      ...(optional(row, "formatted_address")
        ? { formattedAddress: optional(row, "formatted_address") }
        : {}),
      primary: Boolean(row["is_primary"]),
      validationStatus: text(row, "validation_status"),
      ...(optional(row, "validation_provider")
        ? { validationProvider: optional(row, "validation_provider") }
        : {}),
      ...(row["validation_confidence"] !== null &&
      row["validation_confidence"] !== undefined
        ? { validationConfidence: Number(row["validation_confidence"]) }
        : {}),
      ...(row["validated_at"] ? { validatedAt: iso(row["validated_at"]) } : {}),
      effectiveFrom: date(row["effective_from"]),
      ...(row["effective_until"]
        ? { effectiveUntil: date(row["effective_until"]) }
        : {}),
      events: (eventsByAddress.get(id) ?? []).map((value) => ({
        id: text(value, "id"),
        eventType: text(value, "event_type"),
        occurredAt: iso(value["occurred_at"]),
        ...(optional(value, "result_status")
          ? { resultStatus: optional(value, "result_status") }
          : {}),
        ...(value["confidence"] !== null && value["confidence"] !== undefined
          ? { confidence: Number(value["confidence"]) }
          : {}),
        ...(optional(value, "reason_code")
          ? { reasonCode: optional(value, "reason_code") }
          : {}),
      })),
    });
  });
}

async function governance(
  input: Input,
  transaction: Tx,
): Promise<Positioned<unknown>[]> {
  const rows = (
    await sql<Row>`SELECT id::text,relation_type_code,member_name,member_type::text,member_business_partner_id::text,member_country_code::text,business_title,ownership_pct,voting_pct,beneficial_ownership_pct,appointed_date,end_of_term,status::text,created_at FROM master.business_partner_governance_relation WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.businessPartnerId}::uuid AND status='active' AND(appointed_date IS NULL OR appointed_date<=${input.asOf}::date) AND(end_of_term IS NULL OR end_of_term>=${input.asOf}::date) AND created_at<=${input.cursor.snapshotAt}::timestamptz ${after(input)} ORDER BY created_at DESC,id DESC LIMIT ${input.limit + 1}`.execute(
      transaction,
    )
  ).rows;
  return rows.map((row) =>
    position(row, {
      kind: "governance",
      id: text(row, "id"),
      relationTypeCode: text(row, "relation_type_code"),
      memberName: text(row, "member_name"),
      memberType: text(row, "member_type"),
      ...(optional(row, "member_business_partner_id")
        ? {
            memberBusinessPartnerId: optional(
              row,
              "member_business_partner_id",
            ),
          }
        : {}),
      ...(optional(row, "member_country_code")
        ? { memberCountryCode: optional(row, "member_country_code") }
        : {}),
      ...(optional(row, "business_title")
        ? { businessTitle: optional(row, "business_title") }
        : {}),
      ...(row["ownership_pct"] !== null
        ? { ownershipPercent: Number(row["ownership_pct"]) }
        : {}),
      ...(row["voting_pct"] !== null
        ? { votingPercent: Number(row["voting_pct"]) }
        : {}),
      ...(row["beneficial_ownership_pct"] !== null
        ? {
            beneficialOwnershipPercent: Number(row["beneficial_ownership_pct"]),
          }
        : {}),
      ...(row["appointed_date"]
        ? { appointedDate: date(row["appointed_date"]) }
        : {}),
      ...(row["end_of_term"] ? { endOfTerm: date(row["end_of_term"]) } : {}),
      status: text(row, "status"),
    }),
  );
}

async function identifiers(
  input: Input,
  ownerType: string,
  transaction: Tx,
): Promise<Positioned<unknown>[]> {
  const [identifiers, taxes, references] = await Promise.all([
    sql<Row>`SELECT id::text,scheme_code,issuing_authority,issuing_country_code::text,issued_at,effective_until,is_primary,verified_at,COALESCE(metadata->>'maskedValue','••••') masked_value,COALESCE((metadata->>'protected')::boolean,false) protected,created_at FROM master.business_partner_identifier WHERE tenant_id=${input.tenantId}::uuid AND business_partner_id=${input.businessPartnerId}::uuid AND status='active' AND(issued_at IS NULL OR issued_at<=${input.asOf}::date) AND(effective_until IS NULL OR effective_until>${input.asOf}::date) AND created_at<=${input.cursor.snapshotAt}::timestamptz ${after(input)} ORDER BY created_at DESC,id DESC LIMIT ${input.limit + 1}`.execute(
      transaction,
    ),
    sql<Row>`SELECT registration.id::text,registration.registration_type_code,jurisdiction.code jurisdiction_code,registration.effective_from,registration.effective_until,registration.is_primary,registration.verified_at,COALESCE(registration.metadata->>'maskedValue','••••') masked_value,COALESCE((registration.metadata->>'protected')::boolean,false) protected,registration.created_at FROM master.business_partner_tax_registration registration JOIN master.tax_jurisdiction jurisdiction ON jurisdiction.tenant_id=registration.tenant_id AND jurisdiction.id=registration.jurisdiction_id WHERE registration.tenant_id=${input.tenantId}::uuid AND registration.business_partner_id=${input.businessPartnerId}::uuid AND registration.status='active' AND(registration.effective_from IS NULL OR registration.effective_from<=${input.asOf}::date) AND(registration.effective_until IS NULL OR registration.effective_until>${input.asOf}::date) AND registration.created_at<=${input.cursor.snapshotAt}::timestamptz ${after(input, "registration.created_at", "registration.id")} ORDER BY registration.created_at DESC,registration.id DESC LIMIT ${input.limit + 1}`.execute(
      transaction,
    ),
    sql<Row>`SELECT id::text,source_system_code,external_entity_code,external_id,external_code,created_at FROM master.external_reference WHERE tenant_id=${input.tenantId}::uuid AND owner_type_id=${ownerType}::uuid AND owner_id=${input.businessPartnerId}::uuid AND status='active' AND created_at<=${input.cursor.snapshotAt}::timestamptz ${after(input)} ORDER BY created_at DESC,id DESC LIMIT ${input.limit + 1}`.execute(
      transaction,
    ),
  ]);
  return [
    ...identifiers.rows.map((row) =>
      position(row, {
        kind: "identifier",
        id: text(row, "id"),
        schemeCode: text(row, "scheme_code"),
        ...(optional(row, "issuing_authority")
          ? { issuingAuthority: optional(row, "issuing_authority") }
          : {}),
        ...(optional(row, "issuing_country_code")
          ? { issuingCountryCode: optional(row, "issuing_country_code") }
          : {}),
        maskedValue: text(row, "masked_value"),
        primary: Boolean(row["is_primary"]),
        verified: Boolean(row["verified_at"]),
        ...(row["issued_at"] ? { effectiveFrom: date(row["issued_at"]) } : {}),
        ...(row["effective_until"]
          ? { effectiveUntil: date(row["effective_until"]) }
          : {}),
        revealable: Boolean(row["protected"]),
      }),
    ),
    ...taxes.rows.map((row) =>
      position(row, {
        kind: "tax",
        id: text(row, "id"),
        registrationTypeCode: text(row, "registration_type_code"),
        jurisdictionCode: text(row, "jurisdiction_code"),
        maskedValue: text(row, "masked_value"),
        primary: Boolean(row["is_primary"]),
        verified: Boolean(row["verified_at"]),
        ...(row["effective_from"]
          ? { effectiveFrom: date(row["effective_from"]) }
          : {}),
        ...(row["effective_until"]
          ? { effectiveUntil: date(row["effective_until"]) }
          : {}),
        revealable: Boolean(row["protected"]),
      }),
    ),
    ...references.rows.map((row) =>
      position(row, {
        kind: "external_reference",
        id: text(row, "id"),
        sourceSystemCode: text(row, "source_system_code"),
        externalEntityCode: text(row, "external_entity_code"),
        externalId: text(row, "external_id"),
        ...(optional(row, "external_code")
          ? { externalCode: optional(row, "external_code") }
          : {}),
        primary: false,
        verified: true,
        revealable: false,
      }),
    ),
  ];
}

function after(input: Input, at = "created_at", id = "id") {
  return input.cursor.afterAt && input.cursor.afterId
    ? sql`AND (${sql.raw(at)},${sql.raw(id)})<(${input.cursor.afterAt}::timestamptz,${input.cursor.afterId}::uuid)`
    : sql``;
}
function position<T>(row: Row, item: T): Positioned<T> {
  return {
    item,
    at: iso(row["created_at"]),
    id: optional(row, "link_id") ?? text(row, "id"),
  };
}
function source(section: Input["sectionCode"]) {
  return (
    {
      identity: "master.business_partner",
      contacts: "master.contact_person",
      addresses: "master.address_link",
      "identifiers-tax": "master.business_partner_identifier",
      governance: "master.business_partner_governance_relation",
    } as const
  )[section];
}
function group(rows: readonly Row[], key: string) {
  const result = new Map<string, Row[]>();
  for (const row of rows) {
    const value = text(row, key),
      items = result.get(value);
    if (items) items.push(row);
    else result.set(value, [row]);
  }
  return result;
}
function text(row: Row, key: string) {
  const value = row[key];
  if (value === null || value === undefined)
    throw new Error(`BP_360_REPOSITORY_FIELD_MISSING:${key}`);
  return String(value);
}
function optional(row: Row, key: string) {
  const value = row[key];
  return value === null || value === undefined ? undefined : String(value);
}
function iso(value: unknown) {
  return (
    value instanceof Date ? value : new Date(String(value))
  ).toISOString();
}
function date(value: unknown) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}
function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
