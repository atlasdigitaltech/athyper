"use client";

import { Checkbox, Input } from "@athyper/platform-ui";
import { safeChannelHref } from "../related-record";

export type ContactDraft = Readonly<{
  displayName?: string;
  role?: string;
  email?: string;
  phone?: string;
  primary?: boolean;
}>;

const text = (value: unknown) => (typeof value === "string" ? value : "");

export function ContactSummaryRenderer({ data }: { readonly data: unknown }) {
  const value = data && typeof data === "object" ? (data as any).value ?? data : {};
  const name = text(value.displayName ?? value.name);
  const email = text(value.email);
  const phone = text(value.phone);
  const role = text(value.role ?? value.businessTitle);
  return <div className="a-summary-contact"><strong>{name || "No designated contact"}</strong>{role ? <p>{role}</p> : null}{email ? <a href={safeChannelHref("email", email)}>{email}</a> : null}{phone ? <a href={safeChannelHref("phone", phone)}>{phone}</a> : null}</div>;
}

export function ContactEditor({ value, onChange, disabled = false }: { readonly value: ContactDraft; readonly onChange: (next: ContactDraft) => void; readonly disabled?: boolean }) {
  const set = (key: keyof ContactDraft, next: unknown) => onChange({ ...value, [key]: next });
  return <div className="a-contact-editor"><label>Name<Input value={value.displayName ?? ""} disabled={disabled} onChange={(event) => set("displayName", event.currentTarget.value)} /></label><label>Role<Input value={value.role ?? ""} disabled={disabled} onChange={(event) => set("role", event.currentTarget.value)} /></label><label>Email<Input type="email" value={value.email ?? ""} disabled={disabled} onChange={(event) => set("email", event.currentTarget.value)} /></label><label>Phone<Input value={value.phone ?? ""} disabled={disabled} onChange={(event) => set("phone", event.currentTarget.value)} /></label><label><Checkbox checked={value.primary === true} disabled={disabled} onChange={(event) => set("primary", event.currentTarget.checked)} />Primary contact</label></div>;
}
