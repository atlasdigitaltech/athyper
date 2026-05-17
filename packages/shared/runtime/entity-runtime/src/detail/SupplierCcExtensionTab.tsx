"use client";

/**
 * SupplierCcExtensionTab — Company Setup tab for the Supplier detail page.
 *
 * Mode-adaptive layout:
 *   0 profiles → empty state + onboarding CTA
 *   1 profile  → single-CC flat view (no segment language)
 *   2+ profiles → expandable profile card list
 *
 * No-hardcode contract:
 *   • Field labels   — OperationalFieldLabel reads from entity metadata (entity_field.label)
 *   • Field values   — OperationalFieldValue resolves references via field.reference_config
 *   • Display fields — SQL presentation_config.profile_display_fields (tab.config)
 *   • Policy sections— SQL presentation_config.policy_sections (tab.config)
 *   • Intake forms   — EntityForm reads control.entity_field by entityCode
 *   • CSS            — Tailwind semantic tokens only (no hardcoded colours)
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, Building2, Edit2, Loader2, AlertCircle,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Button, Skeleton,
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@athyper/ui/primitives";
import { EntityForm, type EntityFormHandle } from "../form/EntityForm";
import { titleCase } from "@athyper/runtime-shared/core";
import type { SummaryCardsConfig, MasterTab } from "@athyper/metadata-client/compiled-reader";
import {
  OperationalDisplayMetadataProvider,
  OperationalFieldLabel,
  OperationalFieldValue,
} from "./OperationalPresentationView";
import type { ViewOnlyReason } from "./ChildSummaryCardsPanel";

// ── Types ─────────────────────────────────────────────────────────────────────

type CcProfile = {
  id: string;
  company_code_id?: string;
  currency_code?: string;
  payment_term_id?: string;
  payment_method_id?: string;
  preferred_remittance_bank_link_id?: string;
  default_accounting_profile_id?: string;
  tax_group_id?: string;
  default_wht_tax_group_id?: string;
  invoice_hold_policy_id?: string;
  is_blocked?: boolean;
  block_reason?: string;
  status?: string;
  [key: string]: unknown;
};

type PolicySectionConfig = {
  id: string;
  label: string;
  entity_code: string;
  add_label?: string;
};

type ExtPresentationConfig = {
  profile_display_fields?: string[];
  policy_sections?: PolicySectionConfig[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELD_LABEL_CLS = "text-xs font-medium leading-normal text-muted-foreground";
const FIELD_VALUE_CLS = "text-sm leading-snug text-foreground";

// Fallbacks used only when SQL presentation_config is absent.
const FALLBACK_PROFILE_FIELDS = [
  "currency_code", "payment_term_id", "payment_method_id",
  "preferred_remittance_bank_link_id", "default_accounting_profile_id",
  "tax_group_id", "default_wht_tax_group_id", "invoice_hold_policy_id",
];

const FALLBACK_POLICY_SECTIONS: PolicySectionConfig[] = [
  { id: "spend_policies",    label: "Buy Policies",      entity_code: "commodity_category_buy_policy", add_label: "Add Buy Policy" },
  { id: "posting_overrides", label: "Posting Overrides", entity_code: "supplier_posting_override",       add_label: "Add Override" },
];

// Fields that are always internal / parent-FK — never shown as primary in policy rows.
const POLICY_SKIP_FIELDS = new Set([
  "id", "tenant_id",
  "supplier_profile_id",  // parent FK common to all three policy entities
  "scope_type", "scope_id",
  "created_at", "updated_at", "created_by", "updated_by",
]);

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Resolve which fields to show for a policy record row.
 * Skips system / parent-FK fields. Primary is first remaining; facts are next 3.
 * UUID values are still returned — OperationalFieldValue resolves them.
 */
function policyDisplayFields(rec: Record<string, unknown>): { primary: string | null; facts: string[] } {
  const keys = Object.keys(rec).filter((k) => !POLICY_SKIP_FIELDS.has(k));
  return { primary: keys[0] ?? null, facts: keys.slice(1, 4) };
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status, isBlocked }: { status?: string; isBlocked?: boolean }) {
  if (isBlocked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3 w-3" />
        Blocked
      </span>
    );
  }
  if (!status) return null;
  const upper = status.toUpperCase();
  return (
    <span className={cn(
      "rounded-full px-2 py-0.5 text-xs font-medium",
      upper === "ACTIVE" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
    )}>
      {status}
    </span>
  );
}

// ── Add / Edit profile sheet ──────────────────────────────────────────────────

function ProfileFormSheet({
  open, onOpenChange, supplierUuid, existing, onSuccess,
}: {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  supplierUuid: string;
  existing?:    CcProfile | null;
  onSuccess:    () => void;
}) {
  const formRef = useRef<EntityFormHandle>(null);

  const mutation = useMutation({
    mutationFn: async (formData: Record<string, unknown>) => {
      const url = existing
        ? `/api/relay/api/records/company_code_supplier_profile/${encodeURIComponent(existing.id)}`
        : `/api/relay/api/records/company_code_supplier_profile`;
      const body = existing
        ? { data: formData }
        : { data: { ...formData, parent_id: supplierUuid } };
      const res = await fetch(url, {
        method:  existing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Failed to save profile");
      }
    },
    onSuccess: () => { onOpenChange(false); onSuccess(); },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6">
          <SheetTitle>{existing ? "Edit Company Profile" : "Add Company Profile"}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* EntityForm reads control.entity_field by entityCode — no hardcoded fields */}
          <EntityForm
            ref={formRef}
            entityCode="company_code_supplier_profile"
            initialData={existing ?? undefined}
            onSubmit={async (fd) => { await mutation.mutateAsync(fd); }}
            submitting={mutation.isPending}
            hideActions
            noFrame
          />
        </div>
        <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void formRef.current?.submit()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {existing ? "Save changes" : "Create"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Policy child-record sheet ─────────────────────────────────────────────────

function PolicyFormSheet({
  open, onOpenChange, section, profile, existing, onSuccess,
}: {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  section:      PolicySectionConfig;
  profile:      CcProfile;
  existing?:    Record<string, unknown> | null;
  onSuccess:    () => void;
}) {
  const formRef = useRef<EntityFormHandle>(null);
  const profileId = profile.id;
  const newRecordDefaults = section.entity_code === "commodity_category_buy_policy"
    ? { scope_type: "SUPPLIER_PROFILE", scope_id: profileId, company_code_id: profile.company_code_id }
    : section.entity_code === "supplier_posting_override"
      ? { supplier_profile_id: profileId }
      : { parent_id: profileId };

  const mutation = useMutation({
    mutationFn: async (formData: Record<string, unknown>) => {
      const recId = String(existing?.["id"] ?? "");
      const url   = existing
        ? `/api/relay/api/records/${encodeURIComponent(section.entity_code)}/${encodeURIComponent(recId)}`
        : `/api/relay/api/records/${encodeURIComponent(section.entity_code)}`;
      const body  = existing
        ? { data: formData }
        : { data: { ...newRecordDefaults, ...formData } };
      const res = await fetch(url, {
        method:  existing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Failed to save record");
      }
    },
    onSuccess: () => { onOpenChange(false); onSuccess(); },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6">
          <SheetTitle>{existing ? `Edit ${section.label}` : (section.add_label ?? `Add ${section.label}`)}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* EntityForm reads control.entity_field by entityCode — no hardcoded fields */}
          <EntityForm
            ref={formRef}
            entityCode={section.entity_code}
            initialData={existing ?? newRecordDefaults}
            onSubmit={async (fd) => { await mutation.mutateAsync(fd); }}
            submitting={mutation.isPending}
            hideActions
            noFrame
          />
        </div>
        <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void formRef.current?.submit()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {existing ? "Save changes" : "Create"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Policy records section ────────────────────────────────────────────────────
// Wrapped in its own OperationalDisplayMetadataProvider so OperationalFieldValue
// resolves references via the POLICY entity's field metadata (not the profile's).

type PolicyRecord = Record<string, unknown>;

function PolicyRecordsSection({
  section, profile, editMode, viewOnlyReason,
}: {
  section:        PolicySectionConfig;
  profile:        CcProfile;
  editMode:       boolean;
  viewOnlyReason: ViewOnlyReason | null;
}) {
  const queryClient = useQueryClient();
  const profileId = profile.id;
  const queryKey    = ["cc-policy-records", section.entity_code, profileId] as const;

  const [sheetOpen,     setSheetOpen]     = useState(false);
  const [editingRecord, setEditingRecord] = useState<PolicyRecord | null>(null);

  const { data, isLoading, isError } = useQuery<{ data: PolicyRecord[] }>({
    queryKey,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (section.entity_code === "commodity_category_buy_policy") {
        params.set("filter.scope_type", "SUPPLIER_PROFILE");
        params.set("filter.scope_id", profileId);
      } else if (section.entity_code === "supplier_posting_override") {
        params.set("filter.supplier_profile_id", profileId);
      } else {
        params.set("parent_id", profileId);
      }
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(section.entity_code)}?${params.toString()}`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: PolicyRecord[] }>;
    },
    staleTime: 60_000,
  });

  const records  = data?.data ?? [];
  const canAdd   = editMode && !viewOnlyReason;

  // Minimal config: no presentation_config needed here — OperationalFieldValue
  // uses the entity field's own reference_config for resolution.
  const minimalConfig: SummaryCardsConfig = { title: "" };

  return (
    // Provider scoped to the POLICY entity: OperationalFieldValue inside uses
    // this entity's field metadata (reference_config) for UUID resolution.
    <OperationalDisplayMetadataProvider entityCode={section.entity_code} config={minimalConfig}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${records.length} record${records.length !== 1 ? "s" : ""}`}
          </p>
          {canAdd && (
            <Button
              variant="outline" size="sm" className="h-7 gap-1 text-xs"
              onClick={() => { setEditingRecord(null); setSheetOpen(true); }}
            >
              <Plus className="h-3 w-3" />
              {section.add_label ?? "Add"}
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="space-y-1.5">
            {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            <p className="text-xs text-destructive">Failed to load records.</p>
          </div>
        )}

        {!isLoading && !isError && records.length === 0 && (
          <div className="flex items-center justify-center rounded-md border border-dashed border-border px-3 py-5">
            <p className="text-xs text-muted-foreground">
              No {section.label.toLowerCase()} configured.
            </p>
          </div>
        )}

        {!isLoading && !isError && records.length > 0 && (
          <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {records.map((rec) => {
              const recId   = String(rec["id"] ?? "");
              const status  = String(rec["status"] ?? "");
              const { primary, facts } = policyDisplayFields(rec);

              return (
                <div key={recId} className="flex items-center gap-3 bg-card px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    {/* Primary field — OperationalFieldValue resolves UUID references
                        via the policy entity's field.reference_config (no hardcode) */}
                    <p className="truncate text-sm font-medium text-foreground">
                      {primary
                        ? <OperationalFieldValue field={primary} value={rec[primary]} variant="code-label" />
                        : <span className="text-muted-foreground">{recId.slice(0, 8)}…</span>
                      }
                    </p>
                    {/* Fact fields — same reference resolution */}
                    {facts.length > 0 && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1 truncate text-xs text-muted-foreground">
                        {facts.map((f, idx) => (
                          <span key={f} className="inline-flex items-center gap-x-1">
                            {idx > 0 && <span aria-hidden className="text-border">·</span>}
                            <OperationalFieldValue field={f} value={rec[f]} />
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  {status && (
                    <span className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      status.toUpperCase() === "ACTIVE"
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground",
                    )}>
                      {status}
                    </span>
                  )}
                  {canAdd && (
                    <button
                      type="button"
                      onClick={() => { setEditingRecord(rec); setSheetOpen(true); }}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Edit record"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

          <PolicyFormSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            section={section}
            profile={profile}
            existing={editingRecord}
            onSuccess={() => void queryClient.invalidateQueries({ queryKey })}
          />
    </OperationalDisplayMetadataProvider>
  );
}

// ── AP profile fields section ─────────────────────────────────────────────────
// Reads field labels via OperationalFieldLabel (entity metadata, no hardcode).
// Renders values via OperationalFieldValue (resolves UUID references, no hardcode).
// Both components use the nearest OperationalDisplayMetadataProvider context.

function ApProfileSection({
  profile, profileDisplayFields,
}: {
  profile:              CcProfile;
  profileDisplayFields: string[];
}) {
  const fieldNames = profileDisplayFields.filter((name) => profile[name] !== undefined && profile[name] !== null);

  if (fieldNames.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">No AP profile fields available.</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
      {fieldNames.map((name) => (
        <div key={name}>
          {/* Label from entity_field.label via OperationalFieldLabel — no hardcode */}
          <dt className={cn("mb-0.5", FIELD_LABEL_CLS)}>
            <OperationalFieldLabel
              field={name}
              fallback={titleCase(name.replace(/_id$/, ""))}
            />
          </dt>
          {/* Value from entity_field.reference_config via OperationalFieldValue — no hardcode */}
          <dd className={FIELD_VALUE_CLS}>
            <OperationalFieldValue field={name} value={profile[name]} />
          </dd>
        </div>
      ))}
    </div>
  );
}

// ── Per-profile body ──────────────────────────────────────────────────────────

function ProfileBody({
  profile, profileDisplayFields, policySections, editMode, viewOnlyReason,
}: {
  profile:              CcProfile;
  profileDisplayFields: string[];
  policySections:       PolicySectionConfig[];
  editMode:             boolean;
  viewOnlyReason:       ViewOnlyReason | null;
}) {
  const [activeSection, setActiveSection] = useState<string | null>(policySections[0]?.id ?? null);
  const activePolicySection = policySections.find((s) => s.id === activeSection);

  return (
    <div className="space-y-4 pt-3">
      {/* AP Profile field grid */}
      <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
        <p className={cn("mb-2.5 uppercase tracking-wide", FIELD_LABEL_CLS)}>AP Profile</p>
        <ApProfileSection profile={profile} profileDisplayFields={profileDisplayFields} />
      </div>

      {/* Policy sub-nav */}
      {policySections.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-1 border-b border-border">
            {policySections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  "px-3 pb-2 pt-1.5 text-xs font-medium transition-colors",
                  activeSection === s.id
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {activePolicySection && (
            <PolicyRecordsSection
              section={activePolicySection}
              profile={profile}
              editMode={editMode}
              viewOnlyReason={viewOnlyReason}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Profile card (multi-CC) ───────────────────────────────────────────────────

function ProfileCard({
  profile, profileDisplayFields, policySections, editMode, viewOnlyReason, onEdit,
}: {
  profile:              CcProfile;
  profileDisplayFields: string[];
  policySections:       PolicySectionConfig[];
  editMode:             boolean;
  viewOnlyReason:       ViewOnlyReason | null;
  onEdit:               () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Collapsed summary: skip UUID values (shown via OperationalFieldValue when expanded).
  const summaryFacts = profileDisplayFields
    .slice(0, 4)
    .map((name) => {
      const val = profile[name];
      if (!val) return null;
      const str = String(val);
      return isUuidLike(str) ? null : str;
    })
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn(
      "overflow-hidden rounded-lg border bg-card transition-colors",
      expanded ? "border-border" : "border-border/70",
    )}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* company_code_id resolved via OperationalFieldValue + entity field.reference_config */}
            <span className="text-sm font-semibold text-foreground">
              <OperationalFieldValue
                field="company_code_id"
                value={profile.company_code_id}
                variant="code-label"
              />
            </span>
            <StatusChip status={String(profile.status ?? "")} isBlocked={profile.is_blocked} />
          </div>
          {!expanded && summaryFacts && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{summaryFacts}</p>
          )}
        </div>

        {editMode && !viewOnlyReason && (
          <Button
            variant="outline" size="sm" className="shrink-0 h-7 gap-1.5 text-xs"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Edit2 className="h-3 w-3" />
            Edit
          </Button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4">
          <ProfileBody
            profile={profile}
            profileDisplayFields={profileDisplayFields}
            policySections={policySections}
            editMode={editMode}
            viewOnlyReason={viewOnlyReason}
          />
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyView({
  editMode, viewOnlyReason, onAdd,
}: {
  editMode:       boolean;
  viewOnlyReason: ViewOnlyReason | null;
  onAdd:          () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
      <Building2 className="h-8 w-8 text-muted-foreground/30" />
      <div>
        <p className="text-sm font-medium text-muted-foreground">No company profiles configured</p>
        <p className="mt-0.5 max-w-xs mx-auto text-xs text-muted-foreground/60">
          Add a company profile to configure per-company AP settings and procurement policies.
        </p>
      </div>
      {editMode && !viewOnlyReason && (
        <Button size="sm" variant="outline" onClick={onAdd} className="mt-1 gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Company Profile
        </Button>
      )}
    </div>
  );
}

// ── Single-CC view ─────────────────────────────────────────────────────────────

function SingleCcView({
  profile, profileDisplayFields, policySections, editMode, viewOnlyReason, onEdit,
}: {
  profile:              CcProfile;
  profileDisplayFields: string[];
  policySections:       PolicySectionConfig[];
  editMode:             boolean;
  viewOnlyReason:       ViewOnlyReason | null;
  onEdit:               () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* company_code_id resolved via OperationalFieldValue — no hardcode */}
          <span className="text-sm font-semibold text-foreground">
            <OperationalFieldValue
              field="company_code_id"
              value={profile.company_code_id}
              variant="code-label"
            />
          </span>
          <StatusChip status={String(profile.status ?? "")} isBlocked={profile.is_blocked} />
        </div>
        {editMode && !viewOnlyReason && (
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onEdit}>
            <Edit2 className="h-3 w-3" />
            Edit
          </Button>
        )}
      </div>

      <ProfileBody
        profile={profile}
        profileDisplayFields={profileDisplayFields}
        policySections={policySections}
        editMode={editMode}
        viewOnlyReason={viewOnlyReason}
      />
    </div>
  );
}

// ── Multi-CC view ─────────────────────────────────────────────────────────────

function MultiCcView({
  profiles, profileDisplayFields, policySections, editMode, viewOnlyReason, onEditProfile, onAdd,
}: {
  profiles:             CcProfile[];
  profileDisplayFields: string[];
  policySections:       PolicySectionConfig[];
  editMode:             boolean;
  viewOnlyReason:       ViewOnlyReason | null;
  onEditProfile:        (p: CcProfile) => void;
  onAdd:                () => void;
}) {
  const active  = profiles.filter((p) => !p.is_blocked && String(p.status ?? "").toUpperCase() !== "INACTIVE");
  const blocked = profiles.filter((p) => p.is_blocked);

  return (
    <div className="space-y-3">
      {/* Health bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {active.length} active
        </span>
        {blocked.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {blocked.length} blocked
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {profiles.length} company code{profiles.length !== 1 ? "s" : ""} total
        </span>
        <div className="ml-auto">
          {editMode && !viewOnlyReason && (
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onAdd}>
              <Plus className="h-3 w-3" />
              Add Profile
            </Button>
          )}
        </div>
      </div>

      {/* Profile cards — each card uses the parent OperationalDisplayMetadataProvider context */}
      <div className="space-y-2">
        {profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            profileDisplayFields={profileDisplayFields}
            policySections={policySections}
            editMode={editMode}
            viewOnlyReason={viewOnlyReason}
            onEdit={() => onEditProfile(profile)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Public props ──────────────────────────────────────────────────────────────

export interface SupplierCcExtensionTabProps {
  supplierUuid:   string;
  editMode:       boolean;
  viewOnlyReason: ViewOnlyReason | null;
  tab:            MasterTab;
}

// ── Main component ────────────────────────────────────────────────────────────

export function SupplierCcExtensionTab({
  supplierUuid, editMode, viewOnlyReason, tab,
}: SupplierCcExtensionTabProps) {
  const queryClient = useQueryClient();
  const profilesKey = ["cc-ext-profiles", supplierUuid] as const;

  // SQL-driven config (no hardcode in TSX — falls back only if SQL absent).
  const extConfig         = (tab.config?.presentation_config ?? {}) as ExtPresentationConfig;
  const profileDisplayFields = extConfig.profile_display_fields ?? FALLBACK_PROFILE_FIELDS;
  const policySections       = extConfig.policy_sections        ?? FALLBACK_POLICY_SECTIONS;

  // Profile entity config: used by OperationalDisplayMetadataProvider to know
  // which entity's field metadata to fetch for label + reference resolution.
  const profileEntityConfig: SummaryCardsConfig = tab.config ?? { title: "company_code_id" };

  const { data, isLoading, isError } = useQuery<{ data: CcProfile[] }>({
    queryKey: profilesKey,
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/company_code_supplier_profile?parent_id=${supplierUuid}`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: CcProfile[] }>;
    },
    staleTime: 60_000,
  });

  const [sheetOpen,      setSheetOpen]      = useState(false);
  const [editingProfile, setEditingProfile] = useState<CcProfile | null>(null);

  function openAdd()              { setEditingProfile(null);    setSheetOpen(true); }
  function openEdit(p: CcProfile) { setEditingProfile(p);       setSheetOpen(true); }
  function onSuccess()            { void queryClient.invalidateQueries({ queryKey: profilesKey }); }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        <p className="text-sm text-destructive">Failed to load company profiles.</p>
      </div>
    );
  }

  const profiles = data?.data ?? [];

  return (
    // Single OperationalDisplayMetadataProvider for company_code_supplier_profile.
    // Internally calls useCompiledEntity("company_code_supplier_profile") once.
    // Provides fieldMap + settings to all nested OperationalFieldLabel /
    // OperationalFieldValue components for label and reference resolution.
    <OperationalDisplayMetadataProvider entityCode="company_code_supplier_profile" config={profileEntityConfig}>
      <>
        {profiles.length === 0 && (
          <EmptyView editMode={editMode} viewOnlyReason={viewOnlyReason} onAdd={openAdd} />
        )}

        {profiles.length === 1 && (
          <SingleCcView
            profile={profiles[0]!}
            profileDisplayFields={profileDisplayFields}
            policySections={policySections}
            editMode={editMode}
            viewOnlyReason={viewOnlyReason}
            onEdit={() => openEdit(profiles[0]!)}
          />
        )}

        {profiles.length >= 2 && (
          <MultiCcView
            profiles={profiles}
            profileDisplayFields={profileDisplayFields}
            policySections={policySections}
            editMode={editMode}
            viewOnlyReason={viewOnlyReason}
            onEditProfile={openEdit}
            onAdd={openAdd}
          />
        )}

        <ProfileFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          supplierUuid={supplierUuid}
          existing={editingProfile}
          onSuccess={onSuccess}
        />
      </>
    </OperationalDisplayMetadataProvider>
  );
}
