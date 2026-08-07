import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageFrame } from "@athyper/platform-surface-kit";
import { PLANE_KEY } from "@/lib/plane";
import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";

interface EntityCatalogItem {
  id: string;
  name: string;
  entity_code: string | null;
  label_singular: string | null;
  label_plural: string | null;
  entity_class: string;
  module_id: string;
  module_code: string | null;
  module_name: string | null;
  workspace_id: string | null;
  workspace_code: string | null;
  workspace_name: string | null;
  workspace_sort_order: number;
  kind: string | null;
  ownership_model: string | null;
  table_schema: string | null;
  table_name: string | null;
  backing_type: string | null;
  icon_key: string | null;
  color_token: string | null;
  status: string;
  field_count: number;
  operation_count: number;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  has_policy: boolean;
  policy_access_mode: string | null;
}

interface FilterOption {
  value: string;
  label: string;
  count: number;
  sortOrder: number;
}

interface ActiveFilters {
  workspace: string;
  module: string;
  schema: string;
}

const SCHEMA_ORDER = [
  "document",
  "master",
  "shared",
  "control",
  "governance",
  "ledger",
  "aggregate",
  "event",
  "log",
  "snapshot",
  "public",
];

const SCHEMA_LABELS: Record<string, string> = {
  aggregate: "Aggregate",
  control: "Control",
  document: "Document",
  event: "Event",
  governance: "Governance",
  ledger: "Ledger",
  log: "Log",
  master: "Master",
  public: "Public",
  shared: "Shared",
  snapshot: "Snapshot",
};

function entityHref(entity: EntityCatalogItem): string {
  return `/app/${encodeURIComponent(entity.entity_code ?? entity.name)}`;
}

function titleize(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function schemaLabel(schema: string): string {
  return SCHEMA_LABELS[schema] ?? titleize(schema);
}

function entityTitle(entity: EntityCatalogItem): string {
  return entity.label_singular ?? titleize(entity.entity_code ?? entity.name);
}

function physicalName(entity: EntityCatalogItem): string {
  return `${entity.table_schema ?? "unknown"}.${entity.table_name ?? entity.name}`;
}

function moduleKey(entity: EntityCatalogItem): string {
  return entity.module_id || entity.module_code || "unassigned-module";
}

function moduleLabel(entity: EntityCatalogItem): string {
  const code = entity.module_code ?? (entity.module_id || null);
  const name = entity.module_name ?? code ?? "Unassigned module";
  return code && name !== code ? `${name} (${code})` : name;
}

function workspaceKey(entity: EntityCatalogItem): string {
  return entity.workspace_code ?? (entity.workspace_id || "unassigned-workspace");
}

function workspaceLabel(entity: EntityCatalogItem): string {
  return entity.workspace_name ?? entity.workspace_code ?? "Unassigned workspace";
}

function capabilityBadges(entity: EntityCatalogItem): Array<{ label: string; tone: string }> {
  const badges: Array<{ label: string; tone: string }> = [];
  badges.push(entity.policy_access_mode === "default_deny" || !entity.has_policy
    ? { label: "Policy", tone: "border-amber-300 bg-amber-50 text-amber-900" }
    : { label: "View", tone: "border-emerald-300 bg-emerald-50 text-emerald-900" });
  if (entity.can_create) badges.push({ label: "Create", tone: "border-sky-300 bg-sky-50 text-sky-900" });
  if (entity.can_edit) badges.push({ label: "Edit", tone: "border-blue-300 bg-blue-50 text-blue-900" });
  if (entity.can_delete) badges.push({ label: "Delete", tone: "border-rose-300 bg-rose-50 text-rose-900" });
  if (!entity.can_create && !entity.can_edit && !entity.can_delete) {
    badges.push({ label: "View-only", tone: "border-zinc-300 bg-zinc-50 text-zinc-800" });
  }
  if (entity.backing_type && entity.backing_type !== "table") {
    badges.push({ label: entity.backing_type, tone: "border-purple-300 bg-purple-50 text-purple-900" });
  }
  return badges;
}

function compareSchema(a: string, b: string): number {
  const ai = SCHEMA_ORDER.indexOf(a);
  const bi = SCHEMA_ORDER.indexOf(b);
  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }
  return schemaLabel(a).localeCompare(schemaLabel(b));
}

function buildOptions(
  items: EntityCatalogItem[],
  resolve: (item: EntityCatalogItem) => { value: string; label: string; sortOrder?: number },
): FilterOption[] {
  const byValue = new Map<string, FilterOption>();

  for (const item of items) {
    const option = resolve(item);
    const existing = byValue.get(option.value);
    if (existing) {
      existing.count += 1;
    } else {
      byValue.set(option.value, {
        value: option.value,
        label: option.label,
        count: 1,
        sortOrder: option.sortOrder ?? 9999,
      });
    }
  }

  return [...byValue.values()].sort((a, b) => {
    const orderCompare = a.sortOrder - b.sortOrder;
    return orderCompare !== 0 ? orderCompare : a.label.localeCompare(b.label);
  });
}

function buildSchemaOptions(items: EntityCatalogItem[]): FilterOption[] {
  return buildOptions(items, (item) => {
    const schema = item.table_schema ?? "unknown";
    return { value: schema, label: schemaLabel(schema) };
  }).sort((a, b) => compareSchema(a.value, b.value));
}

function filterItems(items: EntityCatalogItem[], filters: ActiveFilters): EntityCatalogItem[] {
  return items
    .filter((item) => !filters.workspace || workspaceKey(item) === filters.workspace)
    .filter((item) => !filters.module || moduleKey(item) === filters.module)
    .filter((item) => !filters.schema || (item.table_schema ?? "unknown") === filters.schema)
    .sort((a, b) => entityTitle(a).localeCompare(entityTitle(b)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeEntityItem(value: unknown): EntityCatalogItem | null {
  if (!isRecord(value) || typeof value["id"] !== "string" || typeof value["name"] !== "string") {
    return null;
  }

  return {
    id: value["id"],
    name: value["name"],
    entity_code: stringOrNull(value["entity_code"]),
    label_singular: stringOrNull(value["label_singular"]),
    label_plural: stringOrNull(value["label_plural"]),
    entity_class: stringOrNull(value["entity_class"]) ?? "MASTER",
    module_id: stringOrNull(value["module_id"]) ?? "",
    module_code: stringOrNull(value["module_code"]),
    module_name: stringOrNull(value["module_name"]),
    workspace_id: stringOrNull(value["workspace_id"]),
    workspace_code: stringOrNull(value["workspace_code"]),
    workspace_name: stringOrNull(value["workspace_name"]),
    workspace_sort_order: Number(value["workspace_sort_order"] ?? 9999),
    kind: stringOrNull(value["kind"]),
    ownership_model: stringOrNull(value["ownership_model"]),
    table_schema: stringOrNull(value["table_schema"]),
    table_name: stringOrNull(value["table_name"]),
    backing_type: stringOrNull(value["backing_type"]),
    icon_key: stringOrNull(value["icon_key"]),
    color_token: stringOrNull(value["color_token"]),
    status: stringOrNull(value["status"]) ?? "ACTIVE",
    field_count: Number(value["field_count"] ?? 0),
    operation_count: Number(value["operation_count"] ?? 0),
    can_view: value["can_view"] === true,
    can_create: value["can_create"] === true,
    can_edit: value["can_edit"] === true,
    can_delete: value["can_delete"] === true,
    has_policy: value["has_policy"] === true,
    policy_access_mode: stringOrNull(value["policy_access_mode"]),
  };
}

async function fetchTesterEntities(): Promise<{ items: EntityCatalogItem[]; unavailable: boolean }> {
  const session = await getNeonServerSession();
  if (!session) return { items: [], unavailable: true };

  try {
    const response = await fetch(buildRuntimeUrl("/api/metadata/admin/entities"), {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });

    if (!response.ok) return { items: [], unavailable: true };

    const json = await response.json() as unknown;
    const items = isRecord(json) && Array.isArray(json["items"])
      ? json["items"].map(normalizeEntityItem).filter((item): item is EntityCatalogItem => item !== null)
      : [];

    return { items, unavailable: false };
  } catch {
    return { items: [], unavailable: true };
  }
}

function firstSearchParam(value: string | string[] | undefined): string {
  const result = Array.isArray(value) ? value[0] : value;
  return typeof result === "string" ? result : "";
}

function FilterSelect({
  name,
  label,
  allLabel,
  value,
  options,
}: {
  name: keyof ActiveFilters;
  label: string;
  allLabel: string;
  value: string;
  options: FilterOption[];
}) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterBar({
  filters,
  schemaOptions,
  moduleOptions,
  workspaceOptions,
  shownCount,
  totalCount,
}: {
  filters: ActiveFilters;
  schemaOptions: FilterOption[];
  moduleOptions: FilterOption[];
  workspaceOptions: FilterOption[];
  shownCount: number;
  totalCount: number;
}) {
  return (
    <form action="/tester" className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-3">
        <FilterSelect
          name="workspace"
          label="Workspace"
          allLabel="All workspaces"
          value={filters.workspace}
          options={workspaceOptions}
        />
        <FilterSelect
          name="module"
          label="Module"
          allLabel="All modules"
          value={filters.module}
          options={moduleOptions}
        />
        <FilterSelect
          name="schema"
          label="Schema"
          allLabel="All schemas"
          value={filters.schema}
          options={schemaOptions}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Showing {shownCount} of {totalCount} entities.
        </p>
        <div className="flex items-center gap-2">
          <Link href="/tester" className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted">
            Clear
          </Link>
          <button type="submit" className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Apply
          </button>
        </div>
      </div>
    </form>
  );
}

function EntityCards({ entities }: { entities: EntityCatalogItem[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {entities.map((entity) => (
        <Link
          key={entity.id}
          href={entityHref(entity)}
          className="group flex min-h-24 items-start justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm text-card-foreground transition-colors hover:border-primary hover:bg-muted/60"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">{entityTitle(entity)}</span>
            <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
              {physicalName(entity)}
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {moduleLabel(entity)} / {entity.backing_type ?? "table"} / {entity.field_count} fields / {entity.operation_count} ops
            </span>
            <span className="mt-2 flex flex-wrap gap-1">
              {capabilityBadges(entity).map((badge) => (
                <span
                  key={badge.label}
                  className={`rounded-full border px-1.5 py-0.5 text-xs font-medium leading-4 ${badge.tone}`}
                >
                  {badge.label}
                </span>
              ))}
            </span>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
              List View
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

interface TesterPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TesterPage({ searchParams }: TesterPageProps = {}) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_NEON_TESTER !== "true") {
    notFound();
  }

  const params = await searchParams;
  const filters: ActiveFilters = {
    workspace: firstSearchParam(params?.["workspace"]),
    module: firstSearchParam(params?.["module"]),
    schema: firstSearchParam(params?.["schema"]),
  };

  const { items, unavailable } = await fetchTesterEntities();
  const filteredItems = filterItems(items, filters);
  const schemaOptions = buildSchemaOptions(items);
  const moduleOptions = buildOptions(items, (item) => ({
    value: moduleKey(item),
    label: moduleLabel(item),
  }));
  const workspaceOptions = buildOptions(items, (item) => ({
    value: workspaceKey(item),
    label: workspaceLabel(item),
    sortOrder: item.workspace_sort_order,
  }));

  return (
    <PageFrame
      eyebrow={PLANE_KEY}
      title="Tester"
      description={`${items.length} metadata entities.`}
    >
      <div className="space-y-5">
        {unavailable ? (
          <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Metadata catalogue unavailable for this session.
          </div>
        ) : null}

        <FilterBar
          filters={filters}
          schemaOptions={schemaOptions}
          moduleOptions={moduleOptions}
          workspaceOptions={workspaceOptions}
          shownCount={filteredItems.length}
          totalCount={items.length}
        />

        {filteredItems.length > 0 ? (
          <EntityCards entities={filteredItems} />
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            No entities match these filters.
          </div>
        )}
      </div>
    </PageFrame>
  );
}
