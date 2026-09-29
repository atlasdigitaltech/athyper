"use client";

import { Checkbox, Input } from "@athyper/platform-ui";
import { PostalAddress } from "../related-record";

export type AddressDraft = Readonly<Record<string, string | boolean | undefined>>;

/** Published metadata can provide an entity's ordered address fields and labels. */
export type AddressEditorField = Readonly<{
  readonly key: string;
  readonly label: string;
}>;

const legacyAddressFields: readonly AddressEditorField[] = [
  { key: "line1", label: "Address line 1" },
  { key: "line2", label: "Address line 2" },
  { key: "locality", label: "City" },
  { key: "region", label: "Region" },
  { key: "postalCode", label: "Postal code" },
  { key: "countryCode", label: "Country code" },
  { key: "purpose", label: "Purpose" },
];

const text = (value: unknown) => (typeof value === "string" ? value : "");

export function AddressSummaryRenderer({ data }: { readonly data: unknown }) {
  const summary = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const value = summary.value && typeof summary.value === "object" ? summary.value as Record<string, unknown> : summary;
  return <div className="a-summary-address"><strong>{text(value.purpose) || "Primary address"}</strong><PostalAddress values={value} />{value.verified === true ? <small>Verified</small> : null}</div>;
}

export function AddressEditor({ value, onChange, disabled = false, fields = legacyAddressFields }: { readonly value: AddressDraft; readonly onChange: (next: AddressDraft) => void; readonly disabled?: boolean; readonly fields?: readonly AddressEditorField[] }) {
  const set = (key: string, next: string | boolean) => onChange({ ...value, [key]: next });
  return <div className="a-address-editor">{fields.map((field) => {
    const fieldValue = value[field.key];
    return <label key={field.key}>{field.label}<Input value={typeof fieldValue === "string" ? fieldValue : ""} disabled={disabled} onChange={(event) => set(field.key, event.currentTarget.value)} /></label>;
  })}<label><Checkbox checked={value.primary === true} disabled={disabled} onChange={(event) => set("primary", event.currentTarget.checked)} />Primary address</label></div>;
}
