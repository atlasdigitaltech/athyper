"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Check, CircleAlert, Mail, MapPin, Phone, Plus, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { Button, Input } from "@athyper/platform-ui/primitives";
import { csrfFetch } from "@athyper/runtime-shared/client";

type OwnerType = "tenant" | "legal_entity" | "company_code";

interface OwnerNode {
  ownerType: OwnerType;
  ownerId: string;
  code: string;
  label: string;
  rank: number;
}

export interface AddressRow {
  link_id: string;
  purpose: string;
  role_qualifier: string | null;
  is_primary: boolean;
  address_id: string;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  formatted_address: string | null;
  source_label: string;
  source_rank: number;
  is_inherited: boolean;
}

export interface ChannelRow {
  link_id: string;
  channel_type: string;
  value: string;
  purpose: string;
  role_qualifier: string | null;
  is_primary: boolean;
  is_verified: boolean;
  source_label: string;
  source_rank: number;
  is_inherited: boolean;
}

interface PersonRow {
  id: string;
  contact_name: string;
  business_title: string | null;
  roles: string[];
  is_primary: boolean;
  source_label: string;
  is_inherited: boolean;
}

interface Profile {
  owner: OwnerNode;
  hierarchy: OwnerNode[];
  permissions: { canManage: boolean; permissionCode: string };
  addresses: AddressRow[];
  channels: ChannelRow[];
  people: PersonRow[];
}

const ADDRESS_PURPOSES = [
  ["default", "Default"], ["correspondence", "Correspondence"],
  ["bill_from", "Bill from"], ["bill_to", "Bill to"], ["remit_to", "Remittance"],
  ["ship_from", "Ship from"], ["ship_to", "Ship to"], ["place_of_service", "Place of service"],
] as const;

const ADDRESS_QUALIFIERS = [
  ["", "No qualifier"], ["registered_office", "Registered office"],
  ["legal_notice", "Legal notice"], ["tax_filing", "Tax filing"],
  ["statutory_correspondence", "Statutory correspondence"],
] as const;

const CONTACT_ROLES = [
  ["default", "Default", "default"],
  ["accounts_payable", "Accounts payable", "correspondence"],
  ["accounts_receivable", "Accounts receivable", "correspondence"],
  ["tax", "Tax", "correspondence"], ["treasury", "Treasury", "notification"],
  ["legal_notice", "Legal notice", "correspondence"], ["legal", "Legal", "correspondence"],
  ["compliance", "Compliance", "correspondence"],
  ["bank_reconciliation", "Bank reconciliation", "notification"],
  ["payment_notification", "Payment notification", "notification"],
  ["collection_notification", "Collection notification", "notification"],
] as const;

export const ADDRESS_CONTACT_TAB_ID = "__address_contact";

export function supportsAddressContact(entityCode: string): entityCode is OwnerType {
  return entityCode === "tenant" || entityCode === "legal_entity" || entityCode === "company_code";
}

export function AddressContactPanel({ ownerType, ownerId }: { ownerType: OwnerType; ownerId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<"address" | "contact" | null>(null);
  const [saving, setSaving] = useState(false);

  const endpoint = useMemo(
    () => `/api/relay/master/owners/${ownerType}/${encodeURIComponent(ownerId)}/address-contact-profile`,
    [ownerId, ownerType],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "You cannot view this organization scope." : "Address and contact setup could not be loaded.");
      setProfile(await response.json() as Profile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Address and contact setup could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(path: string, init: RequestInit): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const response = await csrfFetch(path, init);
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? "The change could not be saved.");
      }
      setEditor(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The change could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !profile) return <PanelState icon={<RefreshCw className="size-5 animate-spin" />} text="Loading addresses and contacts…" />;
  if (error && !profile) return <PanelState icon={<CircleAlert className="size-5 text-destructive" />} text={error} action={<Button variant="outline" onClick={() => void load()}>Retry</Button>} />;
  if (!profile) return null;

  const directAddresses = profile.addresses.filter((row) => !row.is_inherited);
  const inheritedAddresses = effectiveInheritedAddresses(profile.addresses);
  const directChannels = profile.channels.filter((row) => !row.is_inherited);
  const inheritedChannels = effectiveInheritedChannels(profile.channels);

  return (
    <section className="mx-2 mb-3 overflow-hidden rounded-xl border bg-background shadow-sm" aria-label="Addresses and contacts">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            <h2 className="text-base font-semibold">Addresses &amp; Contacts</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile.owner.label} · {scopeLabel(profile.owner.ownerType)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {profile.hierarchy.map((node, index) => (
              <span key={`${node.ownerType}:${node.ownerId}`} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden>←</span> : null}
                <span className="rounded-full border bg-background px-2 py-0.5">{node.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-1.5 size-3.5" />Refresh</Button>
          {profile.permissions.canManage ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditor(editor === "address" ? null : "address")}><Plus className="mr-1.5 size-3.5" />Address</Button>
              <Button size="sm" onClick={() => setEditor(editor === "contact" ? null : "contact")}><Plus className="mr-1.5 size-3.5" />Contact</Button>
            </>
          ) : <span className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">Inherited values are read-only</span>}
        </div>
      </div>

      {error ? <div className="border-b bg-destructive/5 px-5 py-2 text-sm text-destructive">{error}</div> : null}
      {editor === "address" ? <AddressForm saving={saving} onCancel={() => setEditor(null)} onSubmit={(body) => mutate(`${endpoint.replace(/\/address-contact-profile$/, "")}/addresses`, jsonPost(body))} /> : null}
      {editor === "contact" ? <ContactForm saving={saving} onCancel={() => setEditor(null)} onSubmit={(body) => mutate(`${endpoint.replace(/\/address-contact-profile$/, "")}/contact-channels`, jsonPost(body))} /> : null}

      <div className="grid lg:grid-cols-2">
        <ProfileSection title="Addresses" icon={<MapPin className="size-4" />} count={directAddresses.length} className="border-b lg:border-b-0 lg:border-r">
          {directAddresses.length ? directAddresses.map((row) => <AddressCard key={row.link_id} row={row} />) : <EmptyText text="No addresses configured at this scope." />}
          {inheritedAddresses.length ? <InheritedGroup label="Inherited addresses">{inheritedAddresses.map((row) => (
            <AddressCard key={row.link_id} row={row} onOverride={profile.permissions.canManage ? () => mutate(`${endpoint.replace(/\/address-contact-profile$/, "")}/addresses`, jsonPost({ addressId: row.address_id, purpose: row.purpose, roleQualifier: row.role_qualifier })) : undefined} />
          ))}</InheritedGroup> : null}
        </ProfileSection>

        <ProfileSection title="Contact channels" icon={<Mail className="size-4" />} count={directChannels.length}>
          {directChannels.length ? directChannels.map((row) => <ChannelCard key={row.link_id} row={row} canManage={profile.permissions.canManage} mutate={mutate} />) : <EmptyText text="No direct contact channels configured at this scope." />}
          {inheritedChannels.length ? <InheritedGroup label="Inherited channels">{inheritedChannels.map((row) => <ChannelCard key={row.link_id} row={row} canManage={false} mutate={mutate} />)}</InheritedGroup> : null}
        </ProfileSection>
      </div>

      {profile.people.length ? (
        <div className="border-t px-5 py-4">
          <div className="mb-3 flex items-center gap-2"><UserRound className="size-4" /><h3 className="text-sm font-semibold">Named contacts</h3></div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {profile.people.map((person) => (
              <div key={person.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-medium">{person.contact_name}</p><p className="text-xs text-muted-foreground">{person.business_title ?? person.source_label}</p></div>{person.is_primary ? <StatusPill text="Primary" /> : null}</div>
                <p className="mt-2 text-xs text-muted-foreground">{person.roles.map(labelize).join(" · ") || "General contact"}{person.is_inherited ? ` · Inherited from ${person.source_label}` : ""}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AddressForm({ saving, onCancel, onSubmit }: { saving: boolean; onCancel(): void; onSubmit(body: Record<string, unknown>): void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit(Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value).trim() || null])));
  }
  return <form onSubmit={submit} className="grid gap-3 border-b bg-primary/[0.025] px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
    <Field label="Purpose"><Select name="purpose" options={ADDRESS_PURPOSES} /></Field>
    <Field label="Specialization"><Select name="roleQualifier" options={ADDRESS_QUALIFIERS} /></Field>
    <Field label="Address line 1" className="xl:col-span-2"><Input name="line1" required placeholder="Street, building, unit" /></Field>
    <Field label="City"><Input name="city" /></Field><Field label="State / region"><Input name="region" /></Field>
    <Field label="Postal code"><Input name="postalCode" /></Field><Field label="Country"><Input name="countryCode" maxLength={2} placeholder="MY" required /></Field>
    <div className="flex justify-end gap-2 md:col-span-2 xl:col-span-4"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save address"}</Button></div>
  </form>;
}

function ContactForm({ saving, onCancel, onSubmit }: { saving: boolean; onCancel(): void; onSubmit(body: Record<string, unknown>): void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selected = CONTACT_ROLES.find(([code]) => code === data.get("role")) ?? CONTACT_ROLES[0];
    onSubmit({ channelType: data.get("channelType"), value: data.get("value"), purpose: selected[2], roleQualifier: selected[0] === "default" ? null : selected[0] });
  }
  return <form onSubmit={submit} className="grid gap-3 border-b bg-primary/[0.025] px-5 py-4 md:grid-cols-3">
    <Field label="Business role"><Select name="role" options={CONTACT_ROLES.map(([value, label]) => [value, label] as const)} /></Field>
    <Field label="Channel"><Select name="channelType" options={[["email", "Email"], ["phone", "Phone"], ["sms", "SMS"], ["whatsapp", "WhatsApp"], ["fax", "Fax"]]} /></Field>
    <Field label="Email or E.164 number"><Input name="value" required placeholder="finance@example.com or +60123456789" /></Field>
    <div className="flex justify-end gap-2 md:col-span-3"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save contact"}</Button></div>
  </form>;
}

function AddressCard({ row, onOverride }: { row: AddressRow; onOverride?: () => void }) {
  const address = row.formatted_address ?? [row.line1, row.line2, row.city, row.region, row.postal_code, row.country_code].filter(Boolean).join(", ");
  return <div className="rounded-lg border p-3">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{roleLabel(row.purpose, row.role_qualifier)}</p><p className="mt-1 text-sm text-muted-foreground">{address || "Address details incomplete"}</p></div>{row.is_primary ? <StatusPill text="Primary" /> : null}</div>
    {row.is_inherited ? <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>Inherited from {row.source_label}</span>{onOverride ? <button className="font-medium text-primary hover:underline" onClick={onOverride}>Create override</button> : null}</div> : null}
  </div>;
}

function ChannelCard({ row, canManage, mutate }: { row: ChannelRow; canManage: boolean; mutate(path: string, init: RequestInit): Promise<void> }) {
  const Icon = row.channel_type === "email" ? Mail : Phone;
  const base = `/api/relay/master/contact-links/${encodeURIComponent(row.link_id)}`;
  return <div className="rounded-lg border p-3">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="flex items-center gap-1.5 text-sm font-medium"><Icon className="size-3.5" />{roleLabel(row.purpose, row.role_qualifier)}</p><p className="mt-1 truncate text-sm text-muted-foreground">{row.value}</p></div><div className="flex gap-1">{row.is_primary ? <StatusPill text="Primary" /> : null}{row.is_verified ? <StatusPill text="Verified" success /> : null}</div></div>
    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{row.is_inherited ? `Inherited from ${row.source_label}` : labelize(row.channel_type)}</span>{canManage ? <span className="flex gap-2">{!row.is_primary ? <button className="text-primary hover:underline" onClick={() => void mutate(`${base}/set-primary`, { method: "POST" })}>Make primary</button> : null}{!row.is_verified ? <button className="text-primary hover:underline" onClick={() => void mutate(`${base}/verify`, { method: "POST" })}>Verify</button> : null}<button className="text-destructive hover:underline" onClick={() => void mutate(`${base}/deactivate`, { method: "POST" })}>Deactivate</button></span> : null}</div>
  </div>;
}

function ProfileSection({ title, icon, count, className = "", children }: { title: string; icon: ReactNode; count: number; className?: string; children: ReactNode }) {
  return <div className={`px-5 py-4 ${className}`}><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2">{icon}<h3 className="text-sm font-semibold">{title}</h3></div><span className="text-xs text-muted-foreground">{count} local</span></div><div className="space-y-2">{children}</div></div>;
}
function InheritedGroup({ label, children }: { label: string; children: ReactNode }) { return <div className="mt-4 border-t pt-3"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><div className="space-y-2 opacity-90">{children}</div></div>; }
function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) { return <label className={`space-y-1.5 ${className}`}><span className="text-xs font-medium text-muted-foreground">{label}</span>{children}</label>; }
function Select({ name, options }: { name: string; options: ReadonlyArray<readonly [string, string]> }) { return <select name={name} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>; }
function EmptyText({ text }: { text: string }) { return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{text}</p>; }
function StatusPill({ text, success = false }: { text: string; success?: boolean }) { return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${success ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{success ? <ShieldCheck className="size-3" /> : <Check className="size-3" />}{text}</span>; }
function PanelState({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) { return <div className="m-2 flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border bg-background p-6 text-sm text-muted-foreground">{icon}<p>{text}</p>{action}</div>; }
function jsonPost(body: Record<string, unknown>): RequestInit { return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }; }
function labelize(value: string): string { return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function roleLabel(purpose: string, qualifier: string | null): string { return qualifier ? labelize(qualifier) : labelize(purpose); }
function scopeLabel(ownerType: OwnerType): string { return ownerType === "company_code" ? "Company Code" : labelize(ownerType); }

export function effectiveInheritedAddresses(rows: AddressRow[]): AddressRow[] {
  const localKeys = new Set(rows.filter((row) => !row.is_inherited && row.is_primary).map(addressSlot));
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.is_inherited || !row.is_primary) return false;
    const key = addressSlot(row);
    if (localKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function effectiveInheritedChannels(rows: ChannelRow[]): ChannelRow[] {
  const localKeys = new Set(rows.filter((row) => !row.is_inherited && row.is_primary).map(channelSlot));
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.is_inherited || !row.is_primary) return false;
    const key = channelSlot(row);
    if (localKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addressSlot(row: AddressRow): string { return `${row.purpose}:${row.role_qualifier ?? ""}`; }
function channelSlot(row: ChannelRow): string { return `${row.purpose}:${row.role_qualifier ?? ""}:${row.channel_type}`; }
