"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail, Phone, MessageCircle, Globe,
  Copy, ExternalLink, CheckCircle2,
  ChevronDown, ChevronUp, Plus, AlertCircle,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Badge, Button, DrawerShell, Skeleton,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@athyper/ui/primitives";
import type { MasterTab } from "@athyper/metadata-client/compiled-reader";
import { EntityForm, type EntityFormHandle } from "../form/EntityForm";
import type { ViewOnlyReason } from "./ChildSummaryCardsPanel";
import { titleCase } from "@athyper/runtime-shared/core";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChannelRow {
  id:           string;
  contact_id:   string;
  channel_type: string;
  value:        string;
  purpose:      string | null;
  is_primary:   boolean;
  is_verified:  boolean;
  verified_at:  string | null;
  status:       string;
  mx_valid:     boolean | null;
  bounce_count: number | null;
  e164:         string | null;
  carrier_hint: string | null;
  line_type:    string | null;
}

interface ContactRow {
  id:             string;
  contact_name:   string;
  business_title: string | null;
  contact_role:   string | null;
  is_primary:     boolean;
  status:         string;
  created_at:     string;
  channels:       ChannelRow[];
}

interface ContactsResponse {
  contacts: ContactRow[];
  summary:  { total_contacts: number; verified_channel_count: number };
}

interface GroupedChannel {
  id:           string;
  channel_type: string;
  value:        string;
  purposes:     string[];
  is_primary:   boolean;
  is_verified:  boolean;
  verified_at:  string | null;
  status:       string;
  mx_valid:     boolean | null;
  bounce_count: number | null;
  e164:         string | null;
  carrier_hint: string | null;
  line_type:    string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIMARY_INDICATOR_CLASS = "bg-muted/40 text-muted-foreground";
const CONTACT_FIELD_LABEL_CLASS = "text-xs font-medium leading-normal text-muted-foreground";
const CONTACT_FIELD_VALUE_CLASS = "text-sm leading-snug text-foreground";
const CONTACT_FIELD_HELPER_CLASS = "text-sm text-muted-foreground";
const CONTACT_ITEM_TITLE_CLASS = "text-sm font-semibold leading-snug text-foreground";

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function groupChannels(rows: ChannelRow[]): GroupedChannel[] {
  const map = new Map<string, GroupedChannel>();
  for (const row of rows) {
    const key      = `${row.channel_type}:${row.value}`;
    const existing = map.get(key);
    if (existing) {
      if (row.purpose && !existing.purposes.includes(row.purpose)) {
        existing.purposes.push(row.purpose);
      }
      if (row.is_primary)  existing.is_primary  = true;
      if (row.is_verified) existing.is_verified = true;
      if (row.verified_at && !existing.verified_at) existing.verified_at = row.verified_at;
    } else {
      map.set(key, {
        id:           row.id,
        channel_type: row.channel_type,
        value:        row.value,
        purposes:     row.purpose ? [row.purpose] : [],
        is_primary:   row.is_primary,
        is_verified:  row.is_verified,
        verified_at:  row.verified_at,
        status:       row.status,
        mx_valid:     row.mx_valid,
        bounce_count: row.bounce_count,
        e164:         row.e164,
        carrier_hint: row.carrier_hint,
        line_type:    row.line_type,
      });
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.channel_type.localeCompare(b.channel_type);
  });
}

function formatDate(val: string | null): string {
  if (!val) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    }).format(new Date(val));
  } catch { return val; }
}

function channelIcon(type: string, className = "size-3.5") {
  switch (type) {
    case "email":    return <Mail className={className} />;
    case "whatsapp": return <MessageCircle className={className} />;
    case "website":
    case "url":      return <Globe className={className} />;
    default:         return <Phone className={className} />;
  }
}

function hasPhoneChannel(grouped: GroupedChannel[]): boolean {
  return grouped.some((c) => ["phone", "mobile", "whatsapp"].includes(c.channel_type));
}

function statusVariant(
  status: string,
): "default" | "secondary" | "success" | "warning" | "destructive" | "muted" {
  switch (status.toLowerCase()) {
    case "active":   return "success";
    case "inactive": return "muted";
    case "blocked":  return "destructive";
    default:         return "muted";
  }
}

function buildMetaLine(ch: GroupedChannel): string {
  const parts: string[] = [];
  if (ch.is_verified && ch.verified_at) parts.push(`verified ${formatDate(ch.verified_at)}`);
  if (ch.channel_type === "email") {
    if (ch.mx_valid === true)  parts.push("MX valid");
    if (ch.mx_valid === false) parts.push("MX invalid");
    if (ch.bounce_count != null && ch.bounce_count > 0)
      parts.push(`${ch.bounce_count} bounce${ch.bounce_count !== 1 ? "s" : ""}`);
    else if (ch.bounce_count === 0) parts.push("0 bounces");
  } else {
    if (ch.carrier_hint) parts.push(ch.carrier_hint);
    if (ch.line_type && ch.line_type !== "unknown") parts.push(ch.line_type);
    if (ch.e164) parts.push("E.164");
  }
  return parts.join(" · ");
}

// ── ContactAvatar ─────────────────────────────────────────────────────────────

function ContactAvatar({ name }: { name: string }) {
  return (
    <div className={cn(
      "size-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 select-none",
      "bg-foreground text-background",
    )}>
      {getInitials(name)}
    </div>
  );
}

// ── ChannelPill ───────────────────────────────────────────────────────────────

function ChannelPill({ ch }: { ch: GroupedChannel }) {
  const isEmail = ch.channel_type === "email";
  const displayValue = isEmail ? ch.value : (ch.e164 ?? ch.value);

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
      isEmail ? "max-w-[320px] sm:max-w-[420px]" : "max-w-[180px]",
    )}>
      {channelIcon(ch.channel_type, "size-3 flex-shrink-0")}
      <span className="min-w-0 truncate">{displayValue}</span>
      {ch.is_verified && <CheckCircle2 className="size-3 text-success flex-shrink-0" />}
    </span>
  );
}

// ── ChannelDetailRow ──────────────────────────────────────────────────────────

function ChannelDetailRow({
  ch, onVerify, verifying,
}: {
  ch:       GroupedChannel;
  onVerify: (id: string) => void;
  verifying: boolean;
}) {
  function copyValue() {
    void navigator.clipboard.writeText(ch.value);
  }

  const meta = buildMetaLine(ch);

  return (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-border/50 last:border-0">
      <div className="mt-0.5 size-7 rounded-md flex items-center justify-center bg-muted flex-shrink-0">
        {channelIcon(ch.channel_type, "size-3.5 text-muted-foreground")}
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={CONTACT_FIELD_VALUE_CLASS}>{ch.value}</span>
          {ch.is_primary && (
            <Badge
              variant="outline"
              className={cn(PRIMARY_INDICATOR_CLASS, "text-doc-support h-4 px-1.5 leading-none")}
            >
              primary
            </Badge>
          )}
          {ch.purposes.map((p) => (
            <Badge key={p} variant="muted" className="text-doc-support h-4 px-1.5 leading-none">{p}</Badge>
          ))}
          {ch.line_type && ch.line_type !== "unknown" && (
            <Badge variant="muted" className="text-doc-support h-4 px-1.5 leading-none">{ch.line_type}</Badge>
          )}
          {ch.channel_type === "whatsapp" && (
            <Badge variant="muted" className="text-doc-support h-4 px-1.5 leading-none">whatsapp</Badge>
          )}
          {!ch.is_verified && (
            <Badge variant="warning" className="text-doc-support h-4 px-1.5 leading-none">unverified</Badge>
          )}
        </div>
        {meta && (
          <p className="text-xs leading-normal text-muted-foreground">{meta}</p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
        {!ch.is_verified && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => onVerify(ch.id)}
            loading={verifying}
          >
            Verify
          </Button>
        )}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="size-6" onClick={copyValue}>
                <Copy className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy</TooltipContent>
          </Tooltip>

          {ch.channel_type === "email" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a href={`mailto:${ch.value}`} target="_blank" rel="noopener noreferrer">
                  <Button size="icon" variant="ghost" className="size-6">
                    <ExternalLink className="size-3" />
                  </Button>
                </a>
              </TooltipTrigger>
              <TooltipContent>Send email</TooltipContent>
            </Tooltip>
          )}

          {["phone", "mobile", "whatsapp"].includes(ch.channel_type) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a href={`tel:${ch.e164 ?? ch.value}`} target="_blank" rel="noopener noreferrer">
                  <Button size="icon" variant="ghost" className="size-6">
                    <ExternalLink className="size-3" />
                  </Button>
                </a>
              </TooltipTrigger>
              <TooltipContent>Call</TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
}

// ── ContactCard ───────────────────────────────────────────────────────────────

function ContactCard({
  contact, expanded, onToggle, onAddChannel,
  canMutate, verifyingChannelId, onVerify,
}: {
  contact:            ContactRow;
  expanded:           boolean;
  onToggle:           () => void;
  onAddChannel:       () => void;
  canMutate:          boolean;
  verifyingChannelId: string | null;
  onVerify:           (channelId: string) => void;
}) {
  const grouped = groupChannels(contact.channels);
  const noPhone = !hasPhoneChannel(grouped);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Always-visible header row */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none hover:bg-muted/30 transition-colors"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
      >
        <ContactAvatar name={contact.contact_name} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={CONTACT_ITEM_TITLE_CLASS}>{contact.contact_name}</span>
            {contact.is_primary && (
              <Badge variant="outline" size="sm" className={PRIMARY_INDICATOR_CLASS}>Primary</Badge>
            )}
            <Badge variant={statusVariant(contact.status)} size="sm">{titleCase(contact.status)}</Badge>
          </div>
          {contact.business_title && (
            <p className={cn("mt-0.5", CONTACT_FIELD_HELPER_CLASS)}>{contact.business_title}</p>
          )}
        </div>

        {expanded
          ? <ChevronUp   className="size-4 text-muted-foreground flex-shrink-0" />
          : <ChevronDown className="size-4 text-muted-foreground flex-shrink-0" />}
      </div>

      {/* At-a-glance channel pills — always visible when channels exist */}
      {(grouped.length > 0 || (canMutate && noPhone)) && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3 -mt-1">
          {grouped.map((ch) => <ChannelPill key={ch.id} ch={ch} />)}
          {canMutate && noPhone && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddChannel(); }}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="size-3" /> Add phone
            </button>
          )}
        </div>
      )}

      {/* Expanded channel detail */}
      {expanded && (
        <div className="border-t border-border px-4 pt-3 pb-4">
          <p className={cn("mb-1", CONTACT_FIELD_LABEL_CLASS)}>
            Channel Detail
          </p>
          {grouped.length === 0 ? (
            <p className={cn("py-3", CONTACT_FIELD_HELPER_CLASS)}>No channels registered.</p>
          ) : (
            <div>
              {grouped.map((ch) => (
                <ChannelDetailRow
                  key={ch.id}
                  ch={ch}
                  onVerify={onVerify}
                  verifying={verifyingChannelId === ch.id}
                />
              ))}
            </div>
          )}
          {canMutate && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3 h-7 text-xs"
              onClick={(e) => { e.stopPropagation(); onAddChannel(); }}
            >
              <Plus className="size-3 mr-1" /> Add channel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── ContactsChannelPanel ──────────────────────────────────────────────────────

export function ContactsChannelPanel({
  tab,
  recordUuid,
  editMode,
  viewOnlyReason,
}: {
  tab:            MasterTab;
  recordUuid:     string;
  editMode:       boolean;
  viewOnlyReason: ViewOnlyReason | null;
}) {
  const qc = useQueryClient();

  const contactEntityCode = tab.entity_code ?? "business_partner_contact_person";
  const partyTypeFilter   = tab.party_type_filter ?? null;

  const queryKey = ["contacts-channel", contactEntityCode, recordUuid] as const;

  const searchParams = new URLSearchParams({ contact_entity_code: contactEntityCode, parent_id: recordUuid });
  if (partyTypeFilter) searchParams.set("party_type_filter", partyTypeFilter);

  const { data, isLoading, isError } = useQuery<ContactsResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/relay/api/master/contacts?${searchParams.toString()}`);
      if (!res.ok) throw new Error("Failed to load contacts");
      return res.json() as Promise<ContactsResponse>;
    },
  });

  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addChannelFor,  setAddChannelFor]  = useState<string | null>(null);
  const [verifyingId,    setVerifyingId]    = useState<string | null>(null);
  const [contactPending, setContactPending] = useState(false);
  const [channelPending, setChannelPending] = useState(false);

  const contactFormRef = useRef<EntityFormHandle>(null);
  const channelFormRef = useRef<EntityFormHandle>(null);

  const canMutate = editMode && !viewOnlyReason;

  // ── Verify channel mutation ─────────────────────────────────────────────────
  const verifyMutation = useMutation({
    mutationFn: async (channelId: string) => {
      setVerifyingId(channelId);
      const res = await fetch(
        `/api/relay/api/records/contact_link/${encodeURIComponent(channelId)}`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ data: { is_verified: true, verified_at: new Date().toISOString() } }),
        },
      );
      if (!res.ok) throw new Error("Verify failed");
    },
    onSettled: () => {
      setVerifyingId(null);
      void qc.invalidateQueries({ queryKey });
    },
  });

  // ── Add contact ─────────────────────────────────────────────────────────────
  async function handleAddContact(formData: Record<string, unknown>) {
    setContactPending(true);
    try {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(contactEntityCode)}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            data: {
              ...formData,
              party_id:   recordUuid,
              ...(partyTypeFilter ? { party_type: partyTypeFilter } : {}),
            },
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Failed to create contact");
      }
      setAddContactOpen(false);
      void qc.invalidateQueries({ queryKey });
    } finally {
      setContactPending(false);
    }
  }

  // ── Add channel ─────────────────────────────────────────────────────────────
  async function handleAddChannel(formData: Record<string, unknown>) {
    setChannelPending(true);
    try {
      const res = await fetch(
        `/api/relay/api/records/contact_link`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            data: {
              ...formData,
              owner_type: contactEntityCode,
              owner_id:   addChannelFor,
            },
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Failed to add channel");
      }
      setAddChannelFor(null);
      void qc.invalidateQueries({ queryKey });
    } finally {
      setChannelPending(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertCircle className="size-4 flex-shrink-0" />
        Failed to load contacts.
      </div>
    );
  }

  const contacts = data?.contacts ?? [];
  const summary  = data?.summary  ?? { total_contacts: 0, verified_channel_count: 0 };

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center justify-between mb-4">
        <p className={CONTACT_FIELD_HELPER_CLASS}>
          {summary.total_contacts > 0
            ? `${summary.total_contacts} contact${summary.total_contacts !== 1 ? "s" : ""} · ${summary.verified_channel_count} verified channel${summary.verified_channel_count !== 1 ? "s" : ""}`
            : (tab.empty_title ?? "No contacts registered")}
        </p>
        {canMutate && (
          <Button size="sm" variant="outline" onClick={() => setAddContactOpen(true)}>
            <Plus className="size-3.5 mr-1.5" />
            {tab.add_label ?? "Add contact"}
          </Button>
        )}
      </div>

      {/* Contact list */}
      {contacts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
          <p className={CONTACT_FIELD_HELPER_CLASS}>{tab.empty_title ?? "No contacts registered"}</p>
          {tab.empty_description && (
            <p className="text-xs text-muted-foreground/60 max-w-xs">{tab.empty_description}</p>
          )}
          {canMutate && (
            <Button size="sm" variant="outline" className="mt-1" onClick={() => setAddContactOpen(true)}>
              <Plus className="size-3.5 mr-1.5" />
              {tab.add_label ?? "Add contact"}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              expanded={expandedId === c.id}
              onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
              onAddChannel={() => setAddChannelFor(c.id)}
              canMutate={canMutate}
              verifyingChannelId={verifyingId}
              onVerify={(id) => verifyMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Add Contact drawer */}
      <DrawerShell
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        intent="transactional"
        widthKey="master:contact:create"
        defaultWidth={520}
        minWidth={400}
        resizable
        badge="CONTACT PERSON"
        title="New Contact"
        footerEnd={
          <>
            <Button variant="outline" size="sm" onClick={() => setAddContactOpen(false)} disabled={contactPending}>
              Cancel
            </Button>
            <Button size="sm" loading={contactPending} onClick={() => void contactFormRef.current?.submit()}>
              Create
            </Button>
          </>
        }
      >
        <div className="px-5 py-4">
          <EntityForm
            ref={contactFormRef}
            entityCode={contactEntityCode}
            onSubmit={handleAddContact}
            onChange={() => {}}
            submitting={contactPending}
            hideActions
            noFrame
          />
        </div>
      </DrawerShell>

      {/* Add Channel drawer */}
      <DrawerShell
        open={addChannelFor !== null}
        onOpenChange={(v) => { if (!v) setAddChannelFor(null); }}
        intent="transactional"
        widthKey="master:contact:add-channel"
        defaultWidth={480}
        minWidth={380}
        resizable
        badge="CHANNEL"
        title="Add Channel"
        footerEnd={
          <>
            <Button variant="outline" size="sm" onClick={() => setAddChannelFor(null)} disabled={channelPending}>
              Cancel
            </Button>
            <Button size="sm" loading={channelPending} onClick={() => void channelFormRef.current?.submit()}>
              Save
            </Button>
          </>
        }
      >
        <div className="px-5 py-4">
          <EntityForm
            ref={channelFormRef}
            entityCode="contact_link"
            onSubmit={handleAddChannel}
            onChange={() => {}}
            submitting={channelPending}
            hideActions
            noFrame
          />
        </div>
      </DrawerShell>
    </div>
  );
}
