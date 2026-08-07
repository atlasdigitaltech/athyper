"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Database,
  FileText,
  FlaskConical,
  GitBranch,
  Layers3,
  Landmark,
  ListTree,
  RefreshCw,
  Route,
  Search,
} from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import { Badge, Button } from "@athyper/platform-ui/primitives";
import { ReportMetricCard, ReportMetricGrid } from "../components/ReportScaffold";
import { TaxonomyWorkbenchHeader } from "../components/TaxonomyWorkbenchHeader";
import {
  getTaxonomyWorkbenchDefinition,
  type TaxonomyRelatedApp,
  type TaxonomyWorkbenchMode,
} from "../components/taxonomyWorkbenchManifest";
import {
  useAccountingProfiles,
  type AccountingProfileConfigRow,
  type AccountingProfileEventRow,
  type AccountingProfilePayload,
  type AccountingProfileRow,
  type AccountingProfileRuleRow,
  type AccountingProfileTemplateRow,
} from "../hooks/useTaxonomyWorkbenches";

type AccountingProfileMode = Extract<TaxonomyWorkbenchMode, "overview" | "profile" | "simulator">;

const ACCOUNTING_PROFILE_WORKBENCH_HREF = "/workbench/finance/accounting-profiles";
const ACCOUNTING_PROFILE_WORKBENCH_ENTITIES = new Set([
  "accounting_profile",
  "intent_to_accounting_profile_rule",
  "acct_profile_book_rule",
  "acct_profile_commitment_config",
  "acct_profile_config",
  "acct_profile_dimension_rule",
  "acct_profile_entry_template",
  "acct_profile_event",
  "acct_profile_revenue_config",
  "acct_profile_settlement_config",
]);

interface SimulatorInputs {
  intentId: string;
  direction: string;
  flowCode: string;
  docType: string;
  amount: number | null;
  currencyCode: string;
  isCrossBorder: boolean;
  isIntercompany: boolean;
  commodityDomain: string;
  commitmentType: string;
  counterpartyTier: string;
  revenueType: string;
}

interface SimulationResult {
  rule: AccountingProfileRuleRow | null;
  config: AccountingProfileConfigRow | null;
  profile: AccountingProfileRow | null;
  event: AccountingProfileEventRow | null;
  templates: AccountingProfileTemplateRow[];
  skippedByApplicability: number;
}

const EMPTY_SUMMARY: AccountingProfilePayload["summary"] = {
  total: 0,
  activeProfiles: 0,
  activeConfigs: 0,
  intentRules: 0,
  activeIntentRules: 0,
  events: 0,
  entryTemplates: 0,
  optionalConfigs: 0,
  profilesWithoutConfig: 0,
  profilesWithoutRules: 0,
  profilesWithoutTemplates: 0,
};

const DEFAULT_SIMULATOR_INPUTS: SimulatorInputs = {
  intentId: "",
  direction: "INBOUND",
  flowCode: "NON_PO",
  docType: "STANDARD",
  amount: 12_000,
  currencyCode: "USD",
  isCrossBorder: false,
  isIntercompany: false,
  commodityDomain: "",
  commitmentType: "",
  counterpartyTier: "",
  revenueType: "",
};

const WORKBENCH_TYPOGRAPHY_SCOPE = [
  "text-sm leading-5",
  "[&_input]:text-sm",
  "[&_select]:text-sm",
].join(" ");

function modeFromParam(value: string | null): AccountingProfileMode | null {
  return value === "overview" || value === "profile" || value === "simulator" ? value : null;
}

function displayPct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function labelize(value: string | null | undefined): string {
  if (!value) return "Any";
  return value.replace(/_/g, " ");
}

function statusTone(isActive: boolean | null | undefined): "success" | "muted" {
  return isActive ? "success" : "muted";
}

function directionTone(direction: string): string {
  switch (direction) {
    case "INBOUND":
      return "border-info/30 bg-info/10 text-info";
    case "OUTBOUND":
      return "border-success/30 bg-success/10 text-success";
    default:
      return "border-warning/30 bg-warning/10 text-warning";
  }
}

function workbenchHref(mode: AccountingProfileMode = "profile", selectedId?: string | null): string {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (selectedId) params.set("selected", selectedId);
  return `${ACCOUNTING_PROFILE_WORKBENCH_HREF}?${params.toString()}`;
}

function profileHref(profile?: AccountingProfileRow | null): string {
  return workbenchHref("profile", profile?.id);
}

function ruleHref(rule?: AccountingProfileRuleRow | null): string {
  return workbenchHref("profile", rule?.accountingProfileId);
}

function configHref(config?: AccountingProfileConfigRow | null): string {
  return workbenchHref("profile", config?.accountingProfileId);
}

function eventHref(event?: AccountingProfileEventRow | null): string {
  return workbenchHref("profile", event?.accountingProfileId);
}

function templateHref(template?: AccountingProfileTemplateRow | null): string {
  return workbenchHref("profile", template?.accountingProfileId);
}

function relationHref(app: TaxonomyRelatedApp, selected?: AccountingProfileRow | null): string {
  if (ACCOUNTING_PROFILE_WORKBENCH_ENTITIES.has(app.entityCode)) {
    return workbenchHref("profile", selected?.id);
  }
  if (!selected || !app.context) return app.href;
  const [path = app.href, query = ""] = app.href.split("?");
  const params = new URLSearchParams(query);
  if (app.context.source === "id") params.set(app.context.param, selected.id);
  if (app.context.source === "code") params.set(app.context.param, selected.code);
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}

function sourceProfileId(
  payload: AccountingProfilePayload,
  sourceEntity: string | null,
  sourceId: string | null,
): string | null {
  if (!sourceEntity || !sourceId) return null;
  const entityCode = sourceEntity.replace(/-/g, "_");
  switch (entityCode) {
    case "accounting_profile":
      return payload.items.find((profile) => profile.id === sourceId || profile.code === sourceId)?.id ?? null;
    case "intent_to_accounting_profile_rule":
      return payload.rules.find((rule) => rule.id === sourceId)?.accountingProfileId ?? null;
    case "acct_profile_config":
      return payload.configs.find((config) => config.id === sourceId)?.accountingProfileId ?? null;
    case "acct_profile_event":
      return payload.events.find((event) => event.id === sourceId)?.accountingProfileId ?? null;
    case "acct_profile_entry_template":
      return payload.templates.find((template) => template.id === sourceId)?.accountingProfileId ?? null;
    default:
      return null;
  }
}

function textMatches(row: AccountingProfileRow, query: string): boolean {
  const search = query.trim().toLowerCase();
  if (!search) return true;
  return [
    row.code,
    row.name,
    row.description,
    row.direction,
    row.subledgerType,
    row.domainHint,
    row.activeProfileType,
  ].some((value) => (value ?? "").toLowerCase().includes(search));
}

function hasApplicableValue(list: string[], value: string): boolean {
  if (list.length === 0 || !value) return true;
  return list.includes(value);
}

function nullableTextMatches(ruleValue: string | null, inputValue: string): boolean {
  return ruleValue === null || inputValue === "" || ruleValue === inputValue;
}

function nullableBoolMatches(ruleValue: boolean | null, inputValue: boolean): boolean {
  return ruleValue === null || ruleValue === inputValue;
}

function nullableAmountMatches(min: number | null, max: number | null, amount: number | null): boolean {
  if (amount === null) return min === null && max === null;
  return (min === null || amount >= min) && (max === null || amount <= max);
}

function eventCodeForDocType(docType: string): string {
  const normalized = docType.toUpperCase();
  if (normalized === "ADVANCE" || normalized === "DOWN_PAYMENT") return "ADVANCE_PAID";
  if (normalized === "RETENTION_RELEASE") return "RETENTION_RELEASED";
  return "ORDER_APPROVAL";
}

function resolveSimulation(
  inputs: SimulatorInputs,
  payload: AccountingProfilePayload,
): SimulationResult {
  const configsById = new Map(payload.configs.map((config) => [config.id, config]));
  const profilesById = new Map(payload.items.map((profile) => [profile.id, profile]));
  const sortedRules = payload.rules
    .filter((rule) => rule.isActive)
    .sort((left, right) => left.priority - right.priority);

  let skippedByApplicability = 0;

  for (const rule of sortedRules) {
    const intentMatches = rule.intentId === null || rule.intentId === inputs.intentId;
    const predicatesMatch = intentMatches
      && nullableTextMatches(rule.direction, inputs.direction)
      && nullableTextMatches(rule.flowCode, inputs.flowCode)
      && nullableTextMatches(rule.docType, inputs.docType)
      && nullableTextMatches(rule.currencyCode, inputs.currencyCode)
      && nullableTextMatches(rule.commodityDomain, inputs.commodityDomain)
      && nullableTextMatches(rule.commitmentType, inputs.commitmentType)
      && nullableTextMatches(rule.counterpartyTier, inputs.counterpartyTier)
      && nullableTextMatches(rule.revenueType, inputs.revenueType)
      && nullableBoolMatches(rule.isCrossBorder, inputs.isCrossBorder)
      && nullableBoolMatches(rule.isIntercompany, inputs.isIntercompany)
      && nullableAmountMatches(rule.minAmount, rule.maxAmount, inputs.amount);

    if (!predicatesMatch) continue;

    const config = configsById.get(rule.resolvedProfileConfigId) ?? null;
    if (!config || !config.isActive) {
      skippedByApplicability += 1;
      continue;
    }

    if (!hasApplicableValue(config.applicableFlowCodes, inputs.flowCode) || !hasApplicableValue(config.applicableDocTypes, inputs.docType)) {
      skippedByApplicability += 1;
      continue;
    }

    const preferredEventCode = eventCodeForDocType(inputs.docType);
    const configEvents = payload.events.filter((event) => event.profileConfigId === config.id && event.isActive);
    const event = configEvents.find((item) => item.eventCode === preferredEventCode) ?? configEvents[0] ?? null;
    const templates = event
      ? payload.templates.filter((template) => template.profileEventId === event.id && template.isActive)
      : [];

    return {
      rule,
      config,
      profile: profilesById.get(config.accountingProfileId) ?? null,
      event,
      templates,
      skippedByApplicability,
    };
  }

  return { rule: null, config: null, profile: null, event: null, templates: [], skippedByApplicability };
}

function OptionSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {children}
      </select>
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
    </label>
  );
}

function AccountingProfileOverview({
  payload,
  apps,
}: {
  payload: AccountingProfilePayload;
  apps: TaxonomyRelatedApp[];
}) {
  const summary = payload.summary ?? EMPTY_SUMMARY;
  const configuredPct = displayPct(summary.total - summary.profilesWithoutConfig, summary.total);
  const postingPct = displayPct(summary.total - summary.profilesWithoutTemplates, summary.total);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      {!payload.hasIdentityTable && (
        <section className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-warning">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Accounting profile identity table is not installed.</div>
              <div className="mt-1 text-xs">
                Install the AP Non-PO accounting profile module or move `master.accounting_profile` into the base DDL before using this workbench.
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-lg border bg-card p-3 shadow-sm">
        <ReportMetricGrid className="lg:grid-cols-5">
          <ReportMetricCard label="Profiles" value={summary.total.toLocaleString()} detail={`${summary.activeProfiles} active / ${configuredPct} configured`} />
          <ReportMetricCard label="Configs" value={summary.activeConfigs.toLocaleString()} detail={`${summary.profilesWithoutConfig} profiles without active config`} tone={summary.profilesWithoutConfig ? "warning" : "success"} />
          <ReportMetricCard label="Intent Rules" value={summary.activeIntentRules.toLocaleString()} detail={`${summary.intentRules} total rules`} tone="neutral" />
          <ReportMetricCard label="Events" value={summary.events.toLocaleString()} detail={`${summary.entryTemplates} entry template lines`} tone={summary.entryTemplates ? "success" : "warning"} />
          <ReportMetricCard label="Posting Coverage" value={postingPct} detail={`${summary.profilesWithoutTemplates} profiles without templates`} tone={summary.profilesWithoutTemplates ? "warning" : "success"} />
        </ReportMetricGrid>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Route className="h-4 w-4 text-muted-foreground" />
          Resolution Contract
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          {[
            { label: "Business Intent", detail: "Purpose and domain", icon: GitBranch },
            { label: "Intent Rule", detail: "Priority + wildcard predicates", icon: ListTree },
            { label: "Profile Config", detail: "Versioned runtime behavior", icon: Layers3 },
            { label: "Entry Template", detail: "Event-driven Dr/Cr lines", icon: FileText },
          ].map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="relative rounded-lg border bg-background p-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="font-medium text-foreground">{step.label}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{step.detail}</div>
                {index < 3 && <ArrowRight className="absolute -right-5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground md:block" />}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Database className="h-4 w-4 text-muted-foreground" />
          Apps in the universe
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {apps.map((app) => (
            <Link
              key={`${app.entityCode}:${app.href}`}
              href={app.href}
              className="rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40"
            >
              <div className="font-medium text-foreground">{app.label}</div>
              {app.description && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{app.description}</div>}
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}

function ProfileRail({
  rows,
  selectedId,
  search,
  direction,
  onSearchChange,
  onDirectionChange,
  onSelect,
}: {
  rows: AccountingProfileRow[];
  selectedId?: string | null;
  search: string;
  direction: string;
  onSearchChange: (value: string) => void;
  onDirectionChange: (value: string) => void;
  onSelect: (row: AccountingProfileRow) => void;
}) {
  const filtered = rows.filter((row) => textMatches(row, search) && (direction === "all" || row.direction === direction));
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search profiles..."
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
          {["all", "INBOUND", "OUTBOUND"].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onDirectionChange(value)}
              className={cn(
                "h-8 rounded-md px-2 text-xs font-medium transition-colors",
                direction === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60",
              )}
            >
              {value === "all" ? "All" : value}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {filtered.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">No profiles matched.</div>
        ) : filtered.map((row) => {
          const active = row.id === selectedId;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelect(row)}
              className={cn(
                "mb-1 flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
                active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", row.isActive ? "bg-success" : "bg-muted-foreground", active && "bg-primary-foreground")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate tabular-nums text-xs font-medium">{row.code}</span>
                <span className="block truncate text-sm font-medium">{row.name}</span>
                <span className={cn("block truncate text-xs", active ? "text-primary-foreground/75" : "text-muted-foreground")}>
                  {row.subledgerType} / {row.activeProfileType ?? "no config"} / {row.intentRuleCount} rules
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ProfileDetail({
  selected,
  payload,
  apps,
}: {
  selected?: AccountingProfileRow;
  payload: AccountingProfilePayload;
  apps: TaxonomyRelatedApp[];
}) {
  if (!selected) {
    return (
      <section className="flex min-h-[360px] items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
        Select an accounting profile.
      </section>
    );
  }

  const configs = payload.configs.filter((config) => config.accountingProfileId === selected.id);
  const activeConfig = configs.find((config) => config.id === selected.activeConfigId) ?? configs.find((config) => config.isActive) ?? configs[0];
  const rules = activeConfig ? payload.rules.filter((rule) => rule.resolvedProfileConfigId === activeConfig.id) : [];
  const events = activeConfig ? payload.events.filter((event) => event.profileConfigId === activeConfig.id) : [];
  const templates = activeConfig ? payload.templates.filter((template) => template.profileConfigId === activeConfig.id) : [];

  return (
    <section className="flex min-h-0 flex-col gap-3 overflow-auto">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="tabular-nums text-xs text-muted-foreground">{selected.code}</div>
            <h2 className="mt-1 truncate text-lg font-medium text-foreground">{selected.name}</h2>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{selected.description ?? "No description"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={directionTone(selected.direction)}>{selected.direction}</Badge>
            <Badge variant={statusTone(selected.isActive)}>{selected.status}</Badge>
            <Button asChild variant="outline" size="sm">
              <Link href={profileHref(selected)}>Open record</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <ProfileFact icon={<Layers3 className="h-4 w-4" />} label="Active Config" value={activeConfig ? `v${activeConfig.version}` : "None"} detail={activeConfig?.profileType ?? "No runtime configuration"} href={configHref(activeConfig)} />
        <ProfileFact icon={<Route className="h-4 w-4" />} label="Intent Rules" value={rules.length.toLocaleString()} detail="Priority rules resolving this config" href={ruleHref(rules[0])} />
        <ProfileFact icon={<GitBranch className="h-4 w-4" />} label="Events" value={events.length.toLocaleString()} detail="Lifecycle events for posting" href={eventHref(events[0])} />
        <ProfileFact icon={<FileText className="h-4 w-4" />} label="Entry Lines" value={templates.length.toLocaleString()} detail="Debit and credit templates" href={workbenchHref("profile", selected.id)} />
      </section>

      <section className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="font-medium text-foreground">Runtime Configuration</div>
            {activeConfig && <Badge variant={activeConfig.isActive ? "success" : "muted"}>{activeConfig.status}</Badge>}
          </div>
          {activeConfig ? (
            <div className="divide-y">
              <ConfigLine label="Profile type" value={activeConfig.profileType} detail={`${activeConfig.direction} / ${activeConfig.subledgerType}`} />
              <ConfigLine label="Applicability" value={activeConfig.applicableFlowCodes.join(", ") || "Any flow"} detail={activeConfig.applicableDocTypes.join(", ") || "Any doc type"} />
              <ConfigLine label="Recognition" value={activeConfig.recognitionTiming} detail={`${activeConfig.taxTreatment} tax / ${activeConfig.matchingType} matching`} />
              <ConfigLine label="Effectivity" value={activeConfig.effectiveFrom} detail={activeConfig.effectiveTo ? `until ${activeConfig.effectiveTo}` : "open ended"} />
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No config version exists for this profile.</div>
          )}
        </section>

        <section className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 font-medium text-foreground">Related Tables</div>
          <div className="divide-y">
            {apps.map((app) => (
              <Link
                key={`${app.entityCode}:${app.href}`}
                href={relationHref(app, selected)}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{app.label}</span>
                  {app.description && <span className="block truncate text-xs text-muted-foreground">{app.description}</span>}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      </section>

      <section className="grid min-h-0 gap-3 xl:grid-cols-2">
        <RuleList rules={rules} />
        <EventTemplateList events={events} templates={templates} />
      </section>
    </section>
  );
}

function ProfileFact({ icon, label, value, detail, href }: { icon: ReactNode; label: string; value: string; detail: string; href: string }) {
  return (
    <Link href={href} className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs font-medium">{label}</span></div>
      <div className="mt-2 text-xl font-medium text-foreground">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
    </Link>
  );
}

function ConfigLine({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="grid gap-3 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)]">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function RuleList({ rules }: { rules: AccountingProfileRuleRow[] }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3 font-medium text-foreground">Intent Routing Rules</div>
      <div className="max-h-[360px] overflow-auto">
        {rules.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No intent rules resolve to this config.</div>
        ) : rules.map((rule) => (
          <Link key={rule.id} href={ruleHref(rule)} className="grid gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-muted/40 md:grid-cols-[90px_minmax(0,1fr)_90px]">
            <Badge variant="outline">P{rule.priority}</Badge>
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{rule.intentCode ?? rule.intentDomain ?? "Wildcard intent"}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {labelize(rule.direction)} / {labelize(rule.flowCode)} / {labelize(rule.docType)}
              </span>
            </span>
            <Badge variant={rule.isActive ? "success" : "muted"}>{rule.status}</Badge>
          </Link>
        ))}
      </div>
    </section>
  );
}

function EventTemplateList({
  events,
  templates,
}: {
  events: AccountingProfileEventRow[];
  templates: AccountingProfileTemplateRow[];
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3 font-medium text-foreground">Events and Templates</div>
      <div className="max-h-[360px] overflow-auto">
        {events.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No posting events are configured.</div>
        ) : events.map((event) => {
          const eventTemplates = templates.filter((template) => template.profileEventId === event.id);
          return (
            <div key={event.id} className="border-b px-4 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <Link href={eventHref(event)} className="min-w-0 font-medium text-foreground hover:underline">
                  {event.eventCode}
                </Link>
                <Badge variant={event.createsJe ? "success" : "muted"}>{eventTemplates.length} lines</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{event.eventName}</div>
              {eventTemplates.length > 0 && (
                <div className="mt-2 grid gap-1">
                  {eventTemplates.slice(0, 4).map((template) => (
                    <div key={template.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2 py-1 text-xs">
                      <span className="truncate">{template.lineSeq}. {template.description}</span>
                      <span className="shrink-0 tabular-nums">{template.postingSide}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AccountingProfileSimulator({ payload }: { payload: AccountingProfilePayload }) {
  const [inputs, setInputs] = useState<SimulatorInputs>(DEFAULT_SIMULATOR_INPUTS);
  const intentOptions = useMemo(() => {
    const byId = new Map<string, AccountingProfileRuleRow>();
    for (const rule of payload.rules) {
      if (rule.intentId && !byId.has(rule.intentId)) byId.set(rule.intentId, rule);
    }
    return Array.from(byId.values()).sort((a, b) => (a.intentCode ?? "").localeCompare(b.intentCode ?? ""));
  }, [payload.rules]);

  useEffect(() => {
    if (!inputs.intentId && intentOptions[0]?.intentId) {
      setInputs((current) => ({ ...current, intentId: intentOptions[0]!.intentId! }));
    }
  }, [inputs.intentId, intentOptions]);

  const result = useMemo(() => resolveSimulation(inputs, payload), [inputs, payload]);

  return (
    <section className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="min-h-0 overflow-auto rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          Resolution Inputs
        </div>
        <div className="mt-4 grid gap-3">
          <OptionSelect label="Business intent" value={inputs.intentId} onChange={(intentId) => setInputs((current) => ({ ...current, intentId }))}>
            <option value="">Wildcard / not supplied</option>
            {intentOptions.map((rule) => (
              <option key={rule.intentId ?? rule.id} value={rule.intentId ?? ""}>
                {rule.intentCode ?? rule.intentDomain ?? "Intent"} - {rule.intentName ?? rule.intentDomain ?? "Rule"}
              </option>
            ))}
          </OptionSelect>
          <div className="grid gap-3 sm:grid-cols-2">
            <OptionSelect label="Direction" value={inputs.direction} onChange={(direction) => setInputs((current) => ({ ...current, direction }))}>
              <option value="INBOUND">INBOUND</option>
              <option value="OUTBOUND">OUTBOUND</option>
              <option value="BILATERAL">BILATERAL</option>
            </OptionSelect>
            <TextInput label="Flow code" value={inputs.flowCode} onChange={(flowCode) => setInputs((current) => ({ ...current, flowCode: flowCode.toUpperCase() }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Doc type" value={inputs.docType} onChange={(docType) => setInputs((current) => ({ ...current, docType: docType.toUpperCase() }))} />
            <TextInput label="Currency" value={inputs.currencyCode} onChange={(currencyCode) => setInputs((current) => ({ ...current, currencyCode: currencyCode.toUpperCase() }))} />
          </div>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Amount</span>
            <input
              type="number"
              value={inputs.amount ?? ""}
              onChange={(event) => setInputs((current) => ({ ...current, amount: event.target.value === "" ? null : Number(event.target.value) }))}
              className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Commodity domain" value={inputs.commodityDomain} onChange={(commodityDomain) => setInputs((current) => ({ ...current, commodityDomain: commodityDomain.toUpperCase() }))} placeholder="Any" />
            <TextInput label="Commitment type" value={inputs.commitmentType} onChange={(commitmentType) => setInputs((current) => ({ ...current, commitmentType: commitmentType.toUpperCase() }))} placeholder="Any" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Counterparty tier" value={inputs.counterpartyTier} onChange={(counterpartyTier) => setInputs((current) => ({ ...current, counterpartyTier: counterpartyTier.toUpperCase() }))} placeholder="Any" />
            <TextInput label="Revenue type" value={inputs.revenueType} onChange={(revenueType) => setInputs((current) => ({ ...current, revenueType: revenueType.toUpperCase() }))} placeholder="Any" />
          </div>
          <label className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs font-medium text-foreground">
            <input type="checkbox" checked={inputs.isCrossBorder} onChange={(event) => setInputs((current) => ({ ...current, isCrossBorder: event.target.checked }))} className="size-4" />
            Cross-border
          </label>
          <label className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs font-medium text-foreground">
            <input type="checkbox" checked={inputs.isIntercompany} onChange={(event) => setInputs((current) => ({ ...current, isIntercompany: event.target.checked }))} className="size-4" />
            Intercompany
          </label>
        </div>
      </section>

      <section className="min-h-0 overflow-auto rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <div className="font-medium text-foreground">Resolution Trace</div>
            <div className="text-xs text-muted-foreground">Priority rules, config applicability, event, and template preview.</div>
          </div>
          <Badge variant={result.profile ? "success" : "warning"}>{result.profile ? "Resolved" : "No match"}</Badge>
        </div>
        <div className="grid gap-3 p-4">
          <TraceStep
            icon={<Route className="h-4 w-4" />}
            label="Rule"
            value={result.rule ? `P${result.rule.priority} ${result.rule.intentCode ?? result.rule.intentDomain ?? "Wildcard"}` : "No matching rule"}
            detail={result.rule?.explanationTemplate ?? `${payload.rules.length} active rules evaluated client-side`}
            href={ruleHref(result.rule)}
            ok={Boolean(result.rule)}
          />
          <TraceStep
            icon={<Layers3 className="h-4 w-4" />}
            label="Config"
            value={result.config ? `${result.config.profileCode} v${result.config.version}` : "No applicable config"}
            detail={result.config ? `${result.config.profileType} / ${result.config.recognitionTiming}` : `${result.skippedByApplicability} matched rule configs skipped by applicability`}
            href={configHref(result.config)}
            ok={Boolean(result.config)}
          />
          <TraceStep
            icon={<Landmark className="h-4 w-4" />}
            label="Profile"
            value={result.profile?.code ?? "No profile"}
            detail={result.profile?.name ?? "The rule must resolve to an active profile config"}
            href={profileHref(result.profile)}
            ok={Boolean(result.profile)}
          />
          <TraceStep
            icon={<GitBranch className="h-4 w-4" />}
            label="Event"
            value={result.event?.eventCode ?? "No event"}
            detail={result.event?.eventName ?? `Expected ${eventCodeForDocType(inputs.docType)}`}
            href={eventHref(result.event)}
            ok={Boolean(result.event)}
          />
        </div>
        <div className="border-t px-4 py-3">
          <div className="mb-2 font-medium text-foreground">Entry Template Preview</div>
          {result.templates.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
              No template lines resolved for this context.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <div className="grid min-w-[760px] grid-cols-[60px_90px_1.5fr_1fr_1fr] border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Seq</span>
                <span>Side</span>
                <span>Description</span>
                <span>Account</span>
                <span>Amount</span>
              </div>
              <div className="max-h-[300px] min-w-[760px] overflow-auto">
                {result.templates.map((template) => (
                  <Link key={template.id} href={templateHref(template)} className="grid grid-cols-[60px_90px_1.5fr_1fr_1fr] gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40">
                    <span className="tabular-nums text-muted-foreground">{template.lineSeq}</span>
                    <span><Badge variant={template.postingSide === "DEBIT" ? "info" : "secondary"}>{template.postingSide}</Badge></span>
                    <span className="truncate font-medium text-foreground">{template.description}</span>
                    <span className="truncate text-muted-foreground">{template.accountCode ?? template.accountLookupKey ?? template.accountSource}</span>
                    <span className="truncate text-muted-foreground">{template.amountSource}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function TraceStep({
  icon,
  label,
  value,
  detail,
  href,
  ok,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  href: string;
  ok: boolean;
}) {
  return (
    <Link href={href} className="flex items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/40">
      <div className={cn("mt-0.5", ok ? "text-success" : "text-warning")}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <CircleAlert className="h-3.5 w-3.5 text-warning" />}
        </div>
        <div className="mt-1 truncate font-medium text-foreground">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function AccountingProfileWorkbench() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const modeParam = modeFromParam(searchParams.get("mode"));
  const selectedParam = searchParams.get("selected");
  const sourceEntityParam = searchParams.get("sourceEntity");
  const sourceIdParam = searchParams.get("sourceId");
  const [activeMode, setActiveMode] = useState<AccountingProfileMode>(() => modeParam ?? "overview");
  const [selectedId, setSelectedId] = useState<string | null>(() => selectedParam || null);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const { data, isLoading, isError } = useAccountingProfiles();
  const payload = data ?? {
    items: [],
    configs: [],
    rules: [],
    events: [],
    templates: [],
    summary: EMPTY_SUMMARY,
    hasIdentityTable: true,
    asAt: new Date().toISOString(),
    isLive: false,
  };
  const definition = getTaxonomyWorkbenchDefinition("accountingProfile");
  const selected = useMemo(
    () => payload.items.find((item) => item.id === selectedId) ?? payload.items[0],
    [payload.items, selectedId],
  );
  const focusedSelectedId = useMemo(
    () => sourceProfileId(payload, sourceEntityParam, sourceIdParam),
    [payload, sourceEntityParam, sourceIdParam],
  );

  useEffect(() => {
    if (!selectedId && selected && !sourceIdParam) setSelectedId(selected.id);
  }, [selected, selectedId, sourceIdParam]);

  useEffect(() => {
    if (focusedSelectedId) setSelectedId(focusedSelectedId);
  }, [focusedSelectedId]);

  useEffect(() => {
    const nextMode = modeFromParam(searchParams.get("mode"));
    const nextSelected = searchParams.get("selected");
    if (nextMode) setActiveMode(nextMode);
    if (nextSelected) setSelectedId(nextSelected);
  }, [searchParams]);

  function handleModeChange(mode: TaxonomyWorkbenchMode) {
    if (!modeFromParam(mode)) return;
    setActiveMode(mode as AccountingProfileMode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", mode);
    if (selectedId) params.set("selected", selectedId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-y-auto sm:gap-3 sm:overflow-hidden", WORKBENCH_TYPOGRAPHY_SCOPE)}>
      <TaxonomyWorkbenchHeader
        active="accountingProfile"
        activeMode={activeMode}
        onModeChange={handleModeChange}
        subtitle="business_intent -> intent_to_accounting_profile_rule -> acct_profile_config -> accounting_profile"
        actions={
          <Button type="button" variant="outline" size="icon" className="size-8" title="Refresh" aria-label="Refresh" onClick={() => window.location.reload()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        }
      />

      {isLoading ? (
        <section className="flex min-h-[360px] flex-1 items-center justify-center rounded-lg border bg-card text-xs text-muted-foreground animate-pulse">
          Loading accounting profile workbench...
        </section>
      ) : isError ? (
        <section className="flex min-h-[360px] flex-1 items-center justify-center rounded-lg border bg-card text-xs text-destructive">
          Accounting profile service is unavailable.
        </section>
      ) : activeMode === "overview" ? (
        <AccountingProfileOverview payload={payload} apps={definition.relatedApps} />
      ) : activeMode === "simulator" ? (
        <AccountingProfileSimulator payload={payload} />
      ) : (
        <section className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
          <ProfileRail
            rows={payload.items}
            selectedId={selected?.id}
            search={search}
            direction={direction}
            onSearchChange={setSearch}
            onDirectionChange={setDirection}
            onSelect={(row) => setSelectedId(row.id)}
          />
          <ProfileDetail selected={selected} payload={payload} apps={definition.relatedApps} />
        </section>
      )}

      <section className="shrink-0 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> {payload.hasIdentityTable ? "identity table installed" : "identity table missing"}</span>
          <span className="inline-flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" /> {payload.summary.activeIntentRules} active routing rules</span>
          <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {payload.summary.entryTemplates} posting template lines</span>
        </div>
      </section>
    </div>
  );
}
