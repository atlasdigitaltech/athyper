import {
  dataFieldVisible,
  type EntityIntakeSurfaceV1,
} from "@athyper/contract-platform-entity-runtime";

export interface AddressDraft {
  readonly stateRegionCode?: string;
  readonly regionEntryMode?: "directory" | "manual";
  readonly addressKind?: "street" | "po_box" | "rural" | "military" | "other";
  readonly buildingName?: string;
  readonly floor?: string;
  readonly unit?: string;
  readonly houseNumber?: string;
  readonly streetName?: string;
  readonly poBox?: string;
  readonly key: string;
  readonly purpose: string;
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly isPrimary: boolean;
}

export interface ContactDraft {
  readonly key: string;
  readonly contactName: string;
  readonly businessTitle: string;
  readonly departmentName: string;
  readonly isPrimary: boolean;
  readonly channels: readonly Readonly<{
    key: string;
    channelType: string;
    value: string;
    purpose: string;
    isPrimary: boolean;
  }>[];
}

export interface RequestRelationshipExtensions {
  readonly addresses: readonly Readonly<Record<string, unknown>>[];
  readonly contactPersons: readonly Readonly<Record<string, unknown>>[];
  readonly contactChannels: readonly Readonly<Record<string, unknown>>[];
}

export function newAddress(index = 0): AddressDraft {
  return {
    key: index === 0 ? "address-1" : itemKey("address"),
    purpose: "default",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
    countryCode: "",
    isPrimary: index === 0,
  };
}
export function newContact(index = 0): ContactDraft {
  return {
    key: index === 0 ? "contact-1" : itemKey("contact"),
    contactName: "",
    businessTitle: "",
    departmentName: "",
    isPrimary: index === 0,
    channels: [
      {
        key: index === 0 ? "channel-1" : itemKey("channel"),
        channelType: "email",
        value: "",
        purpose: "default",
        isPrimary: true,
      },
    ],
  };
}

export async function buildRelationshipExtensions(
  addresses: readonly AddressDraft[],
  contacts: readonly ContactDraft[],
): Promise<RequestRelationshipExtensions> {
  return Object.freeze({
    addresses: Object.freeze(
      await Promise.all(
        addresses.map(async (item) =>
          Object.freeze({
            clientItemKey: item.key,
            definitionFieldCode: "address.primary",
            purpose: item.purpose,
            addressKind: item.addressKind || "street",
            ...(item.stateRegionCode
              ? { stateRegionCode: item.stateRegionCode }
              : {}),
            ...(item.regionEntryMode
              ? { regionEntryMode: item.regionEntryMode }
              : {}),
            ...Object.fromEntries(
              [
                "buildingName",
                "floor",
                "unit",
                "houseNumber",
                "streetName",
                "poBox",
              ].flatMap((key) => {
                const value = String(
                  item[key as keyof AddressDraft] ?? "",
                ).trim();
                return value ? [[key, value]] : [];
              }),
            ),
            line1: String(item.line1 ?? "").trim(),
            ...(String(item.line2 ?? "").trim()
              ? { line2: String(item.line2 ?? "").trim() }
              : {}),
            city: String(item.city ?? "").trim(),
            ...(String(item.region ?? "").trim()
              ? { region: String(item.region ?? "").trim() }
              : {}),
            ...(String(item.postalCode ?? "").trim()
              ? { postalCode: String(item.postalCode ?? "").trim() }
              : {}),
            countryCode: String(item.countryCode ?? "").toUpperCase(),
            isPrimary: item.isPrimary,
            normalizedHash: await sha256(
              [
                item.line1,
                item.line2,
                item.city,
                item.stateRegionCode || item.region,
                item.postalCode,
                item.countryCode,
                ...((item.addressKind && item.addressKind !== "street") ||
                [
                  item.buildingName,
                  item.floor,
                  item.unit,
                  item.houseNumber,
                  item.streetName,
                  item.poBox,
                ].some((v) => String(v ?? "").trim())
                  ? [
                      item.addressKind || "street",
                      item.buildingName,
                      item.floor,
                      item.unit,
                      item.houseNumber,
                      item.streetName,
                      item.poBox,
                    ]
                  : []),
              ]
                .map((value) =>
                  String(value ?? "")
                    .trim()
                    .toLowerCase(),
                )
                .join("|"),
            ),
          }),
        ),
      ),
    ),
    contactPersons: Object.freeze(
      contacts.map((item) =>
        Object.freeze({
          clientItemKey: item.key,
          definitionFieldCode: "contact.primary",
          contactName: String(item.contactName ?? "").trim(),
          ...(String(item.businessTitle ?? "").trim()
            ? { businessTitle: String(item.businessTitle ?? "").trim() }
            : {}),
          ...(String(item.departmentName ?? "").trim()
            ? { departmentName: String(item.departmentName ?? "").trim() }
            : {}),
          isPrimary: item.isPrimary,
        }),
      ),
    ),
    contactChannels: Object.freeze(
      contacts.flatMap((contact) =>
        contact.channels.map((channel) =>
          Object.freeze({
            clientItemKey: channel.key,
            definitionFieldCode: `contact.channel.${channel.channelType}`,
            contactClientItemKey: contact.key,
            channelType: channel.channelType,
            value: channel.value.trim(),
            purpose: channel.purpose,
            isPrimary: channel.isPrimary,
          }),
        ),
      ),
    ),
  });
}

function itemKey(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
async function sha256(value: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Collection ownership is declared by the published root binding, not page JSX. */
export async function buildProfileExtensions(
  surface: EntityIntakeSurfaceV1,
  values: Readonly<Record<string, unknown>>,
  protect?: (
    kind: "tax" | "certificate" | "bank",
    value: string,
    bank?: { bankCountryCode: string; accountIdType: string },
  ) => Promise<{
    protectedValueToken: string;
    valueHash: string;
    maskedValue: string;
  }>,
  surfaces: readonly EntityIntakeSurfaceV1[] = [],
  previous: Readonly<Record<string, readonly Record<string, unknown>[]>> = {},
): Promise<Readonly<Record<string, readonly Record<string, unknown>[]>>> {
  const result: Record<string, readonly Record<string, unknown>[]> = {};
  for (const field of surface.sections.flatMap((s) => s.fields)) {
    if (
      field.control !== "repeatableGroup" ||
      !field.extensionGroup ||
      values[field.valueKey] === undefined
    )
      continue;
    const rows = values[field.valueKey];
    if (!Array.isArray(rows)) throw Error("Invalid profile collection");
    result[field.extensionGroup] = await Promise.all(
      rows.map(async (row) => {
        const { key, supportingDocuments, ...values } = row;
        if (Array.isArray(supportingDocuments)) {
          const docs = supportingDocuments.map(
            ({ key: documentKey, ...document }) => ({
              ...document,
              clientItemKey: documentKey,
              definitionFieldCode: "supporting_documents",
              sectionCode: field.extensionGroup,
              entryKey: key,
            }),
          );
          result.supportingDocuments = [
            ...(result.supportingDocuments ?? []),
            ...docs,
          ];
        }
        const item: Record<string, unknown> = {
          ...Object.fromEntries(
            Object.entries(values).filter(
              ([, v]) => v !== "" && v !== undefined && v !== null,
            ),
          ),
          clientItemKey: key,
          definitionFieldCode: field.extensionGroup!.replace(
            /[A-Z]/g,
            (c) => "_" + c.toLowerCase(),
          ),
        };
        for (const child of surfaces
          .find((s) => s.key === field.itemSurfaceKey)
          ?.sections.flatMap((s) => s.fields) ?? []) {
          if (
            child.control === "input" &&
            child.payload &&
            child.valueKey !== child.payload.path &&
            item[child.valueKey] !== undefined
          ) {
            item[child.payload.path] = item[child.valueKey];
            delete item[child.valueKey];
          }
        }
        const prior = previous[field.extensionGroup!]?.find(
          (entry) => entry.clientItemKey === key,
        );
        const protectValue = async (
          kind: "bank" | "tax" | "certificate",
          raw: string,
        ) => {
          const masked =
            kind === "certificate"
              ? prior?.maskedCertificateNumber
              : prior?.maskedValue;
          const token =
            kind === "certificate"
              ? prior?.certificateNumberToken
              : prior?.protectedValueToken;
          if (
            prior &&
            kind === "bank" &&
            masked === raw &&
            (prior.bankCountryCode !== item.bankCountryCode ||
              prior.accountIdType !== item.accountIdType)
          )
            throw Error(
              "Re-enter the account identifier after changing bank country or identifier type.",
            );
          if (prior && token && masked === raw)
            return {
              protectedValueToken: String(token),
              maskedValue: String(masked),
              valueHash: String(prior.valueHash ?? ""),
            };
          if (!protect) throw Error("Protected capture is unavailable");
          return protect(
            kind,
            raw,
            kind === "bank"
              ? {
                  bankCountryCode: String(item.bankCountryCode),
                  accountIdType: String(item.accountIdType),
                }
              : undefined,
          );
        };
        if (field.extensionGroup === "bankAccounts" && item.accountIdentifier) {
          if (!protect) throw Error("Protected bank capture is unavailable");
          const protectedValue = await protectValue(
            "bank",
            String(item.accountIdentifier ?? ""),
          );
          delete item.accountIdentifier;
          Object.assign(item, protectedValue);
        }
        if (field.extensionGroup === "identifiers") {
          const value = String(item.value ?? "");
          item.valueHash = await sha256(value);
          item.maskedValue =
            value.length > 4 ? "••••" + value.slice(-4) : "••••";
        }
        if (
          (field.extensionGroup === "taxRegistrations" && item.value) ||
          (field.extensionGroup === "certifications" && item.certificateNumber)
        ) {
          if (!protect)
            throw Error("Protected registration capture is unavailable");
          const certificate = field.extensionGroup === "certifications",
            result = await protectValue(
              certificate ? "certificate" : "tax",
              String(certificate ? item.certificateNumber : item.value),
            );
          delete item.value;
          delete item.certificateNumber;
          if (certificate) {
            item.certificateNumberToken = result.protectedValueToken;
            item.maskedCertificateNumber = result.maskedValue;
          } else Object.assign(item, result);
        }
        return item;
      }),
    );
  }
  return result;
}

/** Prevent a view switch from silently dropping populated fields from the request. */
export function hiddenProfileValues(
  surface: EntityIntakeSurfaceV1,
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
  surfaces: readonly EntityIntakeSurfaceV1[] = [],
): boolean {
  return Boolean(hiddenProfileChangeMessage(surface, before, after, surfaces));
}
export function hiddenProfileChangeMessage(
  surface: EntityIntakeSurfaceV1,
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
  surfaces: readonly EntityIntakeSurfaceV1[] = [],
): string | undefined {
  const fields = surface.sections.flatMap((s) => s.fields);
  for (const f of fields) {
    if (f.control !== "input" && f.control !== "repeatableGroup") continue;
    const value = before[f.valueKey],
      populated = Array.isArray(value)
        ? value.length > 0
        : value !== undefined &&
          value !== null &&
          value !== "" &&
          value !== false;
    if (
      f.visibleWhen &&
      populated &&
      dataFieldVisible(f, surface, before) &&
      !dataFieldVisible(f, surface, after)
    ) {
      const changed = fields.find(
        (c) =>
          c.control === "input" && before[c.valueKey] !== after[c.valueKey],
      );
      return changed?.control === "input"
        ? (changed.helpText ?? f.label)
        : f.label;
    }
    if (
      f.control === "repeatableGroup" &&
      Array.isArray(value) &&
      Array.isArray(after[f.valueKey])
    ) {
      const child = surfaces.find((s) => s.key === f.itemSurfaceKey);
      if (!child) continue;
      for (const row of value) {
        const next = (after[f.valueKey] as Record<string, unknown>[]).find(
          (r) => r.key === row.key,
        );
        if (!next) continue;
        const message = hiddenProfileChangeMessage(child, row, next, surfaces);
        if (message) return message;
      }
    }
  }
  return undefined;
}

/** Restore only metadata-declared fields; protected values return as masked placeholders. */
export function restoreProfileAnswers(
  surface: EntityIntakeSurfaceV1,
  surfaces: readonly EntityIntakeSurfaceV1[],
  payload: Readonly<Record<string, unknown>>,
  organizationId?: string,
): Readonly<Record<string, unknown>> {
  const extensions = (payload.relationshipProposals ?? {}) as Record<
    string,
    Record<string, unknown>[]
  >;
  const result: Record<string, unknown> = {};
  for (const f of surface.sections.flatMap((s) => s.fields)) {
    if (f.control === "input" && f.payload)
      result[f.valueKey] =
        f.payload.target === "canonical"
          ? payload[f.payload.path]
          : f.payload.target === "context"
            ? organizationId
            : ((payload.tenantFields as Record<string, unknown> | undefined)?.[
                f.payload.path
              ] ?? f.defaultValue);
    if (f.control !== "repeatableGroup") continue;
    const group =
      f.extensionGroup ??
      (f.valueKey === "contacts" ? "contactPersons" : f.valueKey);
    result[f.valueKey] = (extensions[group] ?? []).map((row) => {
      const value: Record<string, unknown> = { ...row, key: row.clientItemKey };
      if (group === "addresses" && !value.regionEntryMode)
        value.regionEntryMode = value.stateRegionCode
          ? "directory"
          : value.region
            ? "manual"
            : "directory";
      for (const child of surfaces
        .find((s) => s.key === f.itemSurfaceKey)
        ?.sections.flatMap((s) => s.fields) ?? [])
        if (child.control === "input" && child.payload)
          value[child.valueKey] = row[child.payload.path];
      if (group === "taxRegistrations") value.value = row.maskedValue;
      if (group === "certifications")
        value.certificateNumber = row.maskedCertificateNumber;
      if (group === "bankAccounts") value.accountIdentifier = row.maskedValue;
      value.supportingDocuments = (extensions.supportingDocuments ?? [])
        .filter(
          (doc) =>
            doc.sectionCode === group && doc.entryKey === row.clientItemKey,
        )
        .map((doc) => ({ ...doc, key: doc.clientItemKey }));
      if (group === "contactPersons")
        value.channels = (extensions.contactChannels ?? [])
          .filter((c) => c.contactClientItemKey === row.clientItemKey)
          .map((c) => ({ ...c, key: c.clientItemKey }));
      return value;
    });
  }
  return result;
}
