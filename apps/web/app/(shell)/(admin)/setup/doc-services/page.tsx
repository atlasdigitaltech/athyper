"use client";

/**
 * /setup/doc-services — Document Services Admin Console (Module 8)
 *
 * Sidebar sections:
 *   templates    — master.template registry (CRUD + status lifecycle)
 *   versions     — snapshot.template_version history (append-only)
 *   brands       — master.brand_profile (colour/typography presets)
 *   letterheads  — master.letterhead (page header/footer/watermark)
 *   bindings     — master.template_binding (entity → template resolution)
 *   outputs      — document.render_output (render lifecycle + revoke)
 *   jobs         — document.render_job (BullMQ execution records)
 *   dlq          — log.render_dlq (dead-letter queue + replay)
 *   profiles     — master.print_profile (paper/DPI/compression presets)
 *   resolver     — interactive resolve_template_binding() debug tool
 *
 * Typography scale (Geist Sans):
 *   text-2xs = 10px  — badges, table headers
 *   text-xs  = 12px  — labels, cells, nav items
 *   text-sm  = 13px  — card content, values
 *   text-base= 14px  — section headings
 */

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, GitBranch, Palette, Layout, Link2, Box, Zap,
  AlertTriangle, Eye, Printer, Target, RefreshCw, Plus,
  Check, X, Search, ChevronRight, RotateCcw,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { PageFrame } from "@athyper/ui/layout";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Label,
} from "@athyper/ui/primitives";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Template {
  id: string; code: string; name: string; kind: string; engine: string;
  status: string; current_version_id: string | null;
  is_rtl_supported: boolean; is_letterhead_required: boolean;
  allowed_operations: string[] | null; supported_locales: string[] | null;
  updated_at: string | null;
}

interface TemplateVersion {
  id: string; template_id: string; version: number;
  checksum: string; effective_from: string | null; effective_to: string | null;
  variables_schema: unknown; content_html: string | null; content_json: unknown | null;
  created_at: string; created_by: string;
}

interface BrandProfile {
  id: string; code: string; name: string; direction: string;
  default_locale: string; is_default: boolean; status: string;
  palette: Record<string, string> | null; typography: Record<string, string> | null;
}

interface Letterhead {
  id: string; code: string; name: string; company_code_id: string | null;
  is_default: boolean; watermark_text: string | null;
  watermark_opacity: number; status: string;
  page_margins: { top: number; right: number; bottom: number; left: number } | null;
}

interface Binding {
  id: string; template_id: string; template_code: string; template_name: string;
  entity_name: string; operation: string; variant: string;
  priority: number; is_active: boolean; created_at: string;
}

interface RenderOutput {
  id: string; entity_name: string; entity_id: string;
  operation: string; locale: string; status: string;
  size_bytes: number | null; storage_key: string | null;
  rendered_at: string | null; delivered_at: string | null;
  revoked_at: string | null; revoke_reason: string | null;
  error_code: string | null; error_message: string | null;
  created_at: string;
}

interface RenderJob {
  id: string; output_id: string; status: string;
  attempts: number; max_attempts: number; duration_ms: number | null;
  job_queue_id: string | null; trace_id: string | null;
  error_code: string | null; created_at: string;
}

interface DlqEntry {
  id: string; output_id: string; error_code: string;
  error_category: string; attempt_count: number;
  replay_count: number; replayed_at: string | null;
  dead_at: string;
}

interface PrintProfile {
  id: string; code: string; name: string; paper_size: string;
  orientation: string; color_mode: string; quality_dpi: number;
  output_format: string; duplex: string; is_default: boolean;
  watermark_enabled: boolean; watermark_text: string | null;
  encrypt_pdf: boolean; archive_after_render: boolean;
  email_after_render: boolean; status: string;
}

// ─── Section IDs ─────────────────────────────────────────────────────────────

type SectionId =
  | "templates" | "versions" | "brands" | "letterheads" | "bindings"
  | "outputs" | "jobs" | "dlq" | "profiles" | "resolver";

// ─── Navigation config ────────────────────────────────────────────────────────

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ElementType; group: string }[] = [
  { id: "templates",   label: "Templates",        icon: FileText,     group: "Content" },
  { id: "versions",    label: "Versions",          icon: GitBranch,    group: "Content" },
  { id: "brands",      label: "Brand Profiles",    icon: Palette,      group: "Content" },
  { id: "letterheads", label: "Letterheads",       icon: Layout,       group: "Content" },
  { id: "bindings",    label: "Bindings",          icon: Link2,        group: "Content" },
  { id: "outputs",     label: "Render Outputs",    icon: Box,          group: "Operations" },
  { id: "jobs",        label: "Render Jobs",       icon: Zap,          group: "Operations" },
  { id: "dlq",         label: "Dead Letter Queue", icon: AlertTriangle, group: "Operations" },
  { id: "profiles",    label: "Print Profiles",    icon: Printer,      group: "Output" },
  { id: "resolver",    label: "Resolver Debug",    icon: Target,       group: "Output" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fBytes(b: number | null): string {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function fMs(ms: number | null): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function statusVariant(s: string): "success" | "warning" | "destructive" | "secondary" | "default" {
  if (["PUBLISHED", "DELIVERED", "RENDERED", "COMPLETED", "active"].includes(s)) return "success";
  if (["DRAFT", "PENDING", "QUEUED", "inactive", "archived"].includes(s)) return "secondary";
  if (["REVIEW", "PROCESSING", "RENDERING", "RETRYING"].includes(s)) return "warning";
  if (["FAILED", "REVOKED", "permanent"].includes(s)) return "destructive";
  return "default";
}

// ─── API hooks ────────────────────────────────────────────────────────────────

function useDocServicesList<T>(resource: string, params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery<{ ok: boolean; data: T[] }>({
    queryKey: ["docservices", resource, params],
    queryFn: () => fetch(`/api/docservices/${resource}${qs}`).then((r) => r.json()),
    staleTime: 30_000,
  });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <Card className="bg-card">
      <CardContent className="p-4">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums" style={color ? { color } : undefined}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── Simple data table ────────────────────────────────────────────────────────

function DataTable({ headers, children, empty }: {
  headers: string[];
  children: React.ReactNode;
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/40">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {!children || (Array.isArray(children) && children.length === 0) ? (
        <p className="py-8 text-center text-xs text-muted-foreground">{empty ?? "No records"}</p>
      ) : null}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// §1  Templates section
// ═════════════════════════════════════════════════════════════════════════════

function TemplatesSection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading } = useDocServicesList<Template>("templates");

  const archiveMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/docservices/templates/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["docservices", "templates"] }),
  });

  const rows = (data?.data ?? []).filter((t) =>
    !search || t.code.toLowerCase().includes(search.toLowerCase()) || t.name.toLowerCase().includes(search.toLowerCase())
  );

  const published = rows.filter((t) => t.status === "PUBLISHED").length;
  const drafts    = rows.filter((t) => ["DRAFT", "REVIEW"].includes(t.status)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={rows.length} />
        <StatCard label="Published" value={published} color="var(--color-success)" />
        <StatCard label="Draft / Review" value={drafts} color="var(--color-warning)" />
        <StatCard label="Engines" value={new Set(rows.map((r) => r.engine)).size} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 text-xs h-8"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5 mr-1" />New Template</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <DataTable headers={["Code", "Name", "Kind", "Engine", "Version", "Status", "RTL", "Updated", ""]}>
          {rows.map((t) => (
            <tr key={t.id} className="border-b transition-colors hover:bg-muted/30 last:border-0">
              <td className="px-3 py-2 font-mono text-2xs text-primary">{t.code}</td>
              <td className="px-3 py-2 font-medium text-foreground">{t.name}</td>
              <td className="px-3 py-2 capitalize text-muted-foreground">{t.kind.replace(/_/g, " ")}</td>
              <td className="px-3 py-2"><Badge variant="secondary" className="text-2xs font-mono">{t.engine}</Badge></td>
              <td className="px-3 py-2 font-mono text-2xs">{t.current_version_id ? "live" : <span className="text-muted-foreground">none</span>}</td>
              <td className="px-3 py-2"><Badge variant={statusVariant(t.status)} className="text-2xs">{t.status}</Badge></td>
              <td className="px-3 py-2 text-center">
                {t.is_rtl_supported ? <Check className="h-3 w-3 text-success mx-auto" /> : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-2 text-2xs text-muted-foreground whitespace-nowrap">{fDate(t.updated_at)}</td>
              <td className="px-3 py-2">
                {t.status !== "ARCHIVED" && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 px-2 text-2xs text-destructive hover:text-destructive"
                    onClick={() => archiveMut.mutate(t.id)}
                  >
                    Archive
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {showCreate && <CreateTemplateDialog onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void qc.invalidateQueries({ queryKey: ["docservices", "templates"] }); }} />}
    </div>
  );
}

function CreateTemplateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ code: "", name: "", kind: "invoice", engine: "HANDLEBARS" });
  const mut = useMutation({
    mutationFn: () =>
      fetch("/api/docservices/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then((r) => r.json()),
    onSuccess: onCreated,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />New Template</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          {(["code", "name"] as const).map((f) => (
            <div key={f} className="flex flex-col gap-1">
              <Label className="text-2xs uppercase tracking-wider">{f}</Label>
              <Input className="text-xs h-8" value={form[f]} onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-2xs uppercase tracking-wider">Kind</Label>
              <Select value={form.kind} onValueChange={(v) => setForm((p) => ({ ...p, kind: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["invoice", "credit_note", "statement", "report", "label", "generic"].map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-2xs uppercase tracking-wider">Engine</Label>
              <Select value={form.engine} onValueChange={(v) => setForm((p) => ({ ...p, engine: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["HANDLEBARS", "MJML", "REACT_PDF"].map((e) => (
                    <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.code || !form.name || mut.isPending}>
            {mut.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// §2  Versions section
// ═════════════════════════════════════════════════════════════════════════════

function VersionsSection() {
  const { data: tplData } = useDocServicesList<Template>("templates");
  const templates = tplData?.data ?? [];
  const [selectedId, setSelectedId] = useState<string>("");

  const { data, isLoading } = useQuery<{ ok: boolean; data: TemplateVersion[] }>({
    queryKey: ["docservices", "versions", selectedId],
    queryFn: () => fetch(`/api/docservices/versions?template_id=${selectedId}`).then((r) => r.json()),
    enabled: !!selectedId,
  });

  const versions = data?.data ?? [];
  const currentId = templates.find((t) => t.id === selectedId)?.current_version_id;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Versions" value={versions.length} />
        <StatCard label="With Schema" value={versions.filter((v) => v.variables_schema).length} />
        <StatCard label="HTML Content" value={versions.filter((v) => v.content_html).length} />
      </div>

      <div className="flex items-center gap-3">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-72 h-8 text-xs"><SelectValue placeholder="Select a template…" /></SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">{t.code} — {t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedId && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            Version history — <span className="font-mono">{templates.find((t) => t.id === selectedId)?.code}</span>
          </p>
          {isLoading ? <Skeleton className="h-24" /> : versions.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No versions published yet.</p>
          ) : (
            <div className="relative pl-6 before:absolute before:left-2 before:top-0 before:bottom-0 before:w-px before:bg-border">
              {versions.map((v) => {
                const isCurrent = v.id === currentId;
                return (
                  <div key={v.id} className="relative py-3 before:absolute before:-left-4 before:top-4 before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:border-border before:bg-background">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">v{v.version}</span>
                      {isCurrent && <Badge variant="success" className="text-2xs">CURRENT</Badge>}
                      {!isCurrent && <Badge variant="secondary" className="text-2xs">SUPERSEDED</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-2xs text-muted-foreground">
                      <span>{fDate(v.created_at)}</span>
                      <span>SHA: <span className="font-mono">{v.checksum.slice(0, 12)}…</span></span>
                      <span>Content: {v.content_html ? "HTML" : "JSON"}</span>
                      <span>Schema: {v.variables_schema ? "✓" : "—"}</span>
                      <span>From: {v.effective_from ?? "—"} → {v.effective_to ?? "∞"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground leading-relaxed">
          Template versions are <strong className="text-foreground">append-only</strong>. UPDATE and DELETE are blocked by{" "}
          <code className="rounded bg-muted px-1 font-mono text-primary">trg_fn_template_version_immutable</code>. Duplicate content is prevented by{" "}
          <code className="rounded bg-muted px-1 font-mono text-primary">template_version_checksum_uq</code>.
          To change a live template, publish a new version via POST /api/docservices/versions.
        </CardContent>
      </Card>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// §3  Brand Profiles section
// ═════════════════════════════════════════════════════════════════════════════

function BrandsSection() {
  const { data, isLoading } = useDocServicesList<BrandProfile>("brands");
  const brands = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Profiles" value={brands.length} />
        <StatCard label="Active Default" value={brands.filter((b) => b.is_default).length} />
        <StatCard label="RTL" value={brands.filter((b) => b.direction === "RTL").length} />
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (
        <DataTable headers={["Code", "Name", "Default", "Direction", "Locale", "Palette", "Status"]}>
          {brands.map((b) => (
            <tr key={b.id} className="border-b transition-colors hover:bg-muted/30 last:border-0">
              <td className="px-3 py-2 font-mono text-2xs text-primary">{b.code}</td>
              <td className="px-3 py-2 font-medium text-foreground">{b.name}</td>
              <td className="px-3 py-2">{b.is_default ? <Badge variant="success" className="text-2xs">Default</Badge> : "—"}</td>
              <td className="px-3 py-2"><Badge variant={b.direction === "RTL" ? "warning" : "secondary"} className="text-2xs">{b.direction}</Badge></td>
              <td className="px-3 py-2 text-xs">{b.default_locale}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  {Object.entries(b.palette ?? {}).slice(0, 3).map(([k, v]) => (
                    <span key={k} className="h-3 w-3 rounded-sm border border-white/10 inline-block" style={{ backgroundColor: v }} title={`${k}: ${v}`} />
                  ))}
                </div>
              </td>
              <td className="px-3 py-2"><Badge variant={statusVariant(b.status)} className="text-2xs">{b.status}</Badge></td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// §4  Letterheads section
// ═════════════════════════════════════════════════════════════════════════════

function LetterheadsSection() {
  const { data, isLoading } = useDocServicesList<Letterhead>("letterheads");
  const lhs = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Letterheads" value={lhs.length} />
        <StatCard label="Active" value={lhs.filter((l) => l.status === "active").length} />
        <StatCard label="With Watermark" value={lhs.filter((l) => l.watermark_text).length} />
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (
        <DataTable headers={["Code", "Name", "Scope", "Default", "Watermark", "Opacity", "Margins", "Status"]}>
          {lhs.map((l) => (
            <tr key={l.id} className="border-b transition-colors hover:bg-muted/30 last:border-0">
              <td className="px-3 py-2 font-mono text-2xs text-primary">{l.code}</td>
              <td className="px-3 py-2 font-medium text-foreground">{l.name}</td>
              <td className="px-3 py-2 font-mono text-2xs text-muted-foreground">
                {l.company_code_id ? l.company_code_id.slice(-8) : <span className="italic">tenant-wide</span>}
              </td>
              <td className="px-3 py-2">{l.is_default ? <Badge variant="success" className="text-2xs">Default</Badge> : "—"}</td>
              <td className="px-3 py-2 font-mono text-2xs">{l.watermark_text ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-2xs">{(l.watermark_opacity * 100).toFixed(0)}%</td>
              <td className="px-3 py-2 font-mono text-2xs">
                {l.page_margins ? `${l.page_margins.top}/${l.page_margins.right}/${l.page_margins.bottom}/${l.page_margins.left}` : "—"}
              </td>
              <td className="px-3 py-2"><Badge variant={statusVariant(l.status)} className="text-2xs">{l.status}</Badge></td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// §5  Bindings section
// ═════════════════════════════════════════════════════════════════════════════

function BindingsSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useDocServicesList<Binding>("bindings");
  const bindings = data?.data ?? [];

  const deactivateMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/docservices/bindings/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["docservices", "bindings"] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total" value={bindings.length} />
        <StatCard label="Active" value={bindings.filter((b) => b.is_active).length} />
        <StatCard label="Entities" value={new Set(bindings.map((b) => b.entity_name)).size} />
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (
        <DataTable headers={["Template", "Entity", "Operation", "Variant", "Priority", "Active", ""]}>
          {bindings.map((b) => (
            <tr key={b.id} className="border-b transition-colors hover:bg-muted/30 last:border-0">
              <td className="px-3 py-2">
                <span className="font-mono text-2xs text-primary">{b.template_code}</span>
                <br />
                <span className="text-2xs text-muted-foreground">{b.template_name}</span>
              </td>
              <td className="px-3 py-2 font-mono text-2xs text-muted-foreground">{b.entity_name}</td>
              <td className="px-3 py-2">
                <Badge variant={b.operation === "print" ? "success" : b.operation === "email" ? "default" : "secondary"} className="text-2xs">
                  {b.operation}
                </Badge>
              </td>
              <td className="px-3 py-2 font-mono text-2xs">{b.variant}</td>
              <td className="px-3 py-2 font-mono text-sm font-bold">{b.priority}</td>
              <td className="px-3 py-2"><Badge variant={b.is_active ? "success" : "secondary"} className="text-2xs">{b.is_active ? "active" : "inactive"}</Badge></td>
              <td className="px-3 py-2">
                {b.is_active && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs text-destructive hover:text-destructive"
                    onClick={() => deactivateMut.mutate(b.id)}>Deactivate</Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// §6  Render Outputs section
// ═════════════════════════════════════════════════════════════════════════════

function OutputsSection() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const { data, isLoading } = useDocServicesList<RenderOutput>(
    "outputs",
    statusFilter ? { status: statusFilter } : undefined,
  );
  const outputs = data?.data ?? [];

  const revokeMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      fetch(`/api/docservices/outputs/${id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revoke_reason: reason }),
      }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["docservices", "outputs"] }),
  });

  const deliverMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/docservices/outputs/${id}/deliver`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["docservices", "outputs"] }),
  });

  const byStatus = (s: string) => outputs.filter((o) => o.status === s).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        <StatCard label="Total" value={outputs.length} />
        <StatCard label="Delivered" value={byStatus("DELIVERED")} color="var(--color-success)" />
        <StatCard label="Rendering" value={byStatus("RENDERING") + byStatus("QUEUED")} color="var(--color-info)" />
        <StatCard label="Failed" value={byStatus("FAILED")} color="var(--color-destructive)" />
        <StatCard label="Revoked" value={byStatus("REVOKED")} />
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="" className="text-xs">All statuses</SelectItem>
            {["QUEUED", "RENDERING", "RENDERED", "DELIVERED", "FAILED", "REVOKED"].map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-8" onClick={() => void qc.invalidateQueries({ queryKey: ["docservices", "outputs"] })}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (
        <DataTable headers={["Entity", "entity_id", "Operation", "Locale", "Status", "Size", "storage_key", "Rendered", "Delivered", ""]}>
          {outputs.map((o) => (
            <tr key={o.id} className="border-b transition-colors hover:bg-muted/30 last:border-0">
              <td className="px-3 py-2 font-mono text-2xs text-muted-foreground">{o.entity_name}</td>
              <td className="px-3 py-2 font-mono text-2xs text-primary">{o.entity_id}</td>
              <td className="px-3 py-2"><Badge variant="success" className="text-2xs">{o.operation}</Badge></td>
              <td className="px-3 py-2 text-xs">{o.locale}</td>
              <td className="px-3 py-2"><Badge variant={statusVariant(o.status)} className="text-2xs">{o.status}</Badge></td>
              <td className="px-3 py-2 font-mono text-2xs">{fBytes(o.size_bytes)}</td>
              <td className="px-3 py-2 max-w-[160px] truncate font-mono text-2xs text-muted-foreground" title={o.storage_key ?? undefined}>{o.storage_key ?? "—"}</td>
              <td className="px-3 py-2 text-2xs text-muted-foreground whitespace-nowrap">{fDate(o.rendered_at)}</td>
              <td className="px-3 py-2 text-2xs text-muted-foreground whitespace-nowrap">{fDate(o.delivered_at)}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  {o.status === "RENDERED" && (
                    <Button variant="primary" size="sm" className="h-6 px-2 text-2xs" onClick={() => deliverMut.mutate(o.id)}>Deliver</Button>
                  )}
                  {["RENDERED", "DELIVERED"].includes(o.status) && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs text-destructive hover:text-destructive"
                      onClick={() => revokeMut.mutate({ id: o.id, reason: "Manual revocation" })}>Revoke</Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// §7  Render Jobs section
// ═════════════════════════════════════════════════════════════════════════════

function JobsSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useDocServicesList<RenderJob>("jobs");
  const jobs = data?.data ?? [];

  const retryMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/docservices/jobs/${id}/retry`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["docservices", "jobs"] }),
  });

  const byStatus = (s: string) => jobs.filter((j) => j.status === s).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Completed" value={byStatus("COMPLETED")} color="var(--color-success)" />
        <StatCard label="Processing" value={byStatus("PROCESSING") + byStatus("PENDING")} color="var(--color-info)" />
        <StatCard label="Failed" value={byStatus("FAILED")} color="var(--color-destructive)" />
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="h-8" onClick={() => void qc.invalidateQueries({ queryKey: ["docservices", "jobs"] })}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (
        <DataTable headers={["output_id", "Status", "Attempts", "Duration", "job_queue_id", "trace_id", "Error", "Created", ""]}>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b transition-colors hover:bg-muted/30 last:border-0">
              <td className="px-3 py-2 font-mono text-2xs text-primary">{j.output_id.slice(-8)}</td>
              <td className="px-3 py-2"><Badge variant={statusVariant(j.status)} className="text-2xs">{j.status}</Badge></td>
              <td className="px-3 py-2 font-mono text-2xs">{j.attempts}/{j.max_attempts}</td>
              <td className="px-3 py-2 font-mono text-2xs">{fMs(j.duration_ms)}</td>
              <td className="px-3 py-2 font-mono text-2xs text-muted-foreground max-w-[160px] truncate">{j.job_queue_id ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-2xs text-muted-foreground">{j.trace_id ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-2xs text-destructive">{j.error_code ?? "—"}</td>
              <td className="px-3 py-2 text-2xs text-muted-foreground whitespace-nowrap">{fDate(j.created_at)}</td>
              <td className="px-3 py-2">
                {j.status === "FAILED" && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" onClick={() => retryMut.mutate(j.id)}>
                    <RotateCcw className="h-3 w-3 mr-1" />Retry
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// §8  DLQ section
// ═════════════════════════════════════════════════════════════════════════════

function DlqSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useDocServicesList<DlqEntry>("dlq");
  const entries = data?.data ?? [];

  const replayMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/docservices/dlq/${id}/replay`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["docservices", "dlq"] }),
  });

  const pending  = entries.filter((e) => !e.replayed_at).length;
  const replayed = entries.filter((e) =>  e.replayed_at).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total" value={entries.length} color="var(--color-destructive)" />
        <StatCard label="Awaiting Replay" value={pending} color="var(--color-warning)" />
        <StatCard label="Replayed" value={replayed} color="var(--color-success)" />
      </div>

      <div className="flex justify-end">
        <Button variant="destructive" size="sm" className="h-8 text-xs">
          <RotateCcw className="h-3.5 w-3.5 mr-1" />Replay All Pending
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (
        <DataTable headers={["output_id", "Error Code", "Category", "Attempts", "Dead At", "Replayed", ""]}>
          {entries.map((e) => (
            <tr key={e.id} className="border-b transition-colors hover:bg-muted/30 last:border-0">
              <td className="px-3 py-2 font-mono text-2xs text-primary">{e.output_id.slice(-8)}</td>
              <td className="px-3 py-2 font-mono text-2xs text-destructive">{e.error_code}</td>
              <td className="px-3 py-2"><Badge variant={statusVariant(e.error_category)} className="text-2xs">{e.error_category}</Badge></td>
              <td className="px-3 py-2 font-mono text-2xs">{e.attempt_count}</td>
              <td className="px-3 py-2 text-2xs text-muted-foreground whitespace-nowrap">{fDate(e.dead_at)}</td>
              <td className="px-3 py-2 text-2xs">
                {e.replayed_at
                  ? <span className="text-success">✓ {fDate(e.replayed_at)}</span>
                  : <span className="text-muted-foreground">Pending</span>
                }
              </td>
              <td className="px-3 py-2">
                {!e.replayed_at && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" onClick={() => replayMut.mutate(e.id)}>
                    <RotateCcw className="h-3 w-3 mr-1" />Replay
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// §9  Print Profiles section
// ═════════════════════════════════════════════════════════════════════════════

function ProfilesSection() {
  const { data, isLoading } = useDocServicesList<PrintProfile>("profiles");
  const profiles = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Profiles" value={profiles.length} />
        <StatCard label="Active" value={profiles.filter((p) => p.status === "active").length} />
        <StatCard label="Encrypted" value={profiles.filter((p) => p.encrypt_pdf).length} />
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (
        <DataTable headers={["Code", "Name", "Default", "Paper", "Color", "DPI", "Format", "Watermark", "Encrypt", "Archive", "Email"]}>
          {profiles.map((p) => (
            <tr key={p.id} className="border-b transition-colors hover:bg-muted/30 last:border-0">
              <td className="px-3 py-2 font-mono text-2xs text-primary">{p.code}</td>
              <td className="px-3 py-2 font-medium text-foreground">{p.name}</td>
              <td className="px-3 py-2">{p.is_default ? <Badge variant="success" className="text-2xs">Default</Badge> : "—"}</td>
              <td className="px-3 py-2 text-xs">{p.paper_size} / {p.orientation.slice(0, 4)}</td>
              <td className="px-3 py-2 text-xs">{p.color_mode}</td>
              <td className="px-3 py-2 font-mono text-2xs">{p.quality_dpi}</td>
              <td className="px-3 py-2"><Badge variant="secondary" className="text-2xs font-mono">{p.output_format.toUpperCase()}</Badge></td>
              <td className="px-3 py-2 text-xs">{p.watermark_enabled ? <span className="text-warning">{p.watermark_text}</span> : "—"}</td>
              <td className="px-3 py-2 text-center">{p.encrypt_pdf ? <Check className="h-3 w-3 text-primary mx-auto" /> : "—"}</td>
              <td className="px-3 py-2 text-center">{p.archive_after_render ? <Check className="h-3 w-3 text-success mx-auto" /> : "—"}</td>
              <td className="px-3 py-2 text-center">{p.email_after_render ? <Check className="h-3 w-3 text-info mx-auto" /> : "—"}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// §10  Resolver section
// ═════════════════════════════════════════════════════════════════════════════

interface ResolverResult {
  ok: boolean;
  binding?: Record<string, unknown>;
  template?: Record<string, unknown>;
  version?: Record<string, unknown>;
  resolved_variant?: string;
  error?: string;
}

function ResolverSection() {
  const [form, setForm] = useState({ entity_name: "", operation: "print", variant: "default" });
  const [result, setResult] = useState<ResolverResult | null>(null);
  const [loading, setLoading] = useState(false);
  const canResolve = form.entity_name.trim().length > 0 && form.operation.trim().length > 0;

  async function resolve() {
    if (!canResolve) return;
    setLoading(true);
    try {
      const r = await fetch("/api/docservices/resolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_name: form.entity_name.trim(),
          operation: form.operation.trim(),
          variant: form.variant.trim() || "default",
        }),
      });
      setResult(await r.json() as ResolverResult);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Target className="h-4 w-4" />Binding Resolver</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-4 text-xs text-muted-foreground">
            Emulates <code className="rounded bg-muted px-1 font-mono">document.resolve_template_binding(tenant_id, entity_name, operation, variant)</code> — returns the highest-priority active binding.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label className="text-2xs uppercase tracking-wider">entity_name</Label>
              <Input
                className="text-xs h-8"
                value={form.entity_name}
                onChange={(e) => setForm((p) => ({ ...p, entity_name: e.target.value }))}
                placeholder="Enter binding entity name"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-2xs uppercase tracking-wider">operation</Label>
              <Select value={form.operation} onValueChange={(v) => setForm((p) => ({ ...p, operation: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["print", "email", "preview", "export"].map((o) => (
                    <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-2xs uppercase tracking-wider">variant</Label>
              <Input className="text-xs h-8" value={form.variant} onChange={(e) => setForm((p) => ({ ...p, variant: e.target.value }))} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={() => void resolve()} disabled={loading || !canResolve}>
              <Zap className="h-3.5 w-3.5 mr-1" />{loading ? "Resolving…" : "Resolve"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Resolution Trace</CardTitle></CardHeader>
          <CardContent>
            {!result.ok || result.error ? (
              <div className="rounded bg-destructive/10 p-4 text-sm text-destructive">
                No matching binding found for this entity + operation + variant combination.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {[
                  { step: 1, text: <>Scan <strong>master.template_binding</strong> WHERE entity_name = <code className="rounded bg-muted px-1 font-mono text-xs text-primary">{form.entity_name}</code> AND operation = <code className="rounded bg-muted px-1 font-mono text-xs text-primary">{form.operation}</code> AND is_active = true</> },
                  { step: 2, text: <>Variant match: exact <code className="rounded bg-muted px-1 font-mono text-xs text-primary">{form.variant}</code> preferred, fallback to <code className="rounded bg-muted px-1 font-mono text-xs text-primary">default</code>. Resolved: <code className="rounded bg-muted px-1 font-mono text-xs text-primary">{String(result.resolved_variant)}</code></> },
                  { step: 3, text: <>Priority ordering: highest wins. Selected priority = <code className="rounded bg-muted px-1 font-mono text-xs text-primary">{String(result.binding?.["priority"] ?? "—")}</code></> },
                  { step: 4, text: <>Resolved template: <code className="rounded bg-muted px-1 font-mono text-xs text-primary">{String(result.template?.["code"] ?? "—")}</code> — {String(result.template?.["name"] ?? "")}</> },
                  { step: 5, text: <>Engine: <Badge variant="secondary" className="text-2xs font-mono">{String(result.template?.["engine"] ?? "—")}</Badge> Status: <Badge variant={statusVariant(String(result.template?.["status"] ?? ""))} className="text-2xs">{String(result.template?.["status"] ?? "—")}</Badge> Version: <code className="rounded bg-muted px-1 font-mono text-xs text-primary">{result.version ? `v${String(result.version["version"])}` : "none"}</code></> },
                ].map(({ step, text }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xs font-bold text-primary">{step}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Root page
// ═════════════════════════════════════════════════════════════════════════════

export default function DocServicesPage() {
  const [active, setActive] = useState<SectionId>("templates");
  const activated = useRef<Set<SectionId>>(new Set(["templates"]));

  function go(id: SectionId) {
    activated.current.add(id);
    setActive(id);
  }

  const groups = [...new Set(NAV_ITEMS.map((n) => n.group))];

  return (
    <PageFrame
      title="Document Services"
      description="Module 8 — PDF/HTML generation, template registry, brand profiles, and print configuration"
    >
      <div className="flex gap-0">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="hidden w-[220px] shrink-0 pr-8 lg:block">
          <nav className="sticky top-8 flex flex-col gap-0.5">
            {groups.map((group) => (
              <div key={group} className="mb-2">
                <p className="mb-1 px-2.5 text-2xs font-semibold uppercase tracking-widest text-muted-foreground/60">{group}</p>
                {NAV_ITEMS.filter((n) => n.group === group).map((item) => {
                  const Icon = item.icon;
                  const isActive = active === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => go(item.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                        isActive
                          ? "bg-accent font-semibold text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                      {isActive && <ChevronRight className="h-3 w-3 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Content pane ─────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* Mobile nav */}
          <div className="mb-4 lg:hidden">
            <Select value={active} onValueChange={(v) => go(v as SectionId)}>
              <SelectTrigger className="w-full text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {NAV_ITEMS.map((item) => (
                  <SelectItem key={item.id} value={item.id} className="text-sm">{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Section heading */}
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
            {(() => { const Icon = NAV_ITEMS.find((n) => n.id === active)!.icon; return <Icon className="h-4 w-4 text-primary" />; })()}
            {NAV_ITEMS.find((n) => n.id === active)?.label}
          </h2>

          {/* Sections — mounted on first visit, hidden (not unmounted) after */}
          {NAV_ITEMS.map((item) => (
            <div key={item.id} className={active === item.id ? "block" : "hidden"}>
              {activated.current.has(item.id) && (() => {
                switch (item.id) {
                  case "templates":   return <TemplatesSection />;
                  case "versions":    return <VersionsSection />;
                  case "brands":      return <BrandsSection />;
                  case "letterheads": return <LetterheadsSection />;
                  case "bindings":    return <BindingsSection />;
                  case "outputs":     return <OutputsSection />;
                  case "jobs":        return <JobsSection />;
                  case "dlq":         return <DlqSection />;
                  case "profiles":    return <ProfilesSection />;
                  case "resolver":    return <ResolverSection />;
                }
              })()}
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
