"use client";

import {
  Archive,
  Cog,
  Copy,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Shield,
  ShieldCheck,
  ShieldX,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RuleFormData } from "@/components/mesh/policies/RuleFormDialog";

import { ConditionSummary } from "@/components/mesh/policies/PolicyConditionBuilder";
import { RuleFormDialog } from "@/components/mesh/policies/RuleFormDialog";
import { BackLink } from "@/components/mesh/shared/BackLink";
import { ConfirmDeleteDialog } from "@/components/mesh/shared/ConfirmDeleteDialog";
import { StatusDot } from "@/components/mesh/shared/StatusDot";
import { VersionBadge } from "@/components/mesh/shared/VersionBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";
import { usePolicyMutations } from "@/lib/schema-manager/use-policy-mutations";
import {
  SUBJECT_TYPE_BADGE,
  EFFECT_BADGE,
  STATUS_BANNER,
} from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

interface PolicyVersion {
  id: string;
  versionNo: number;
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
  createdAt: string;
  createdBy: string;
}

interface PermissionRule {
  id: string;
  scopeType: string;
  scopeKey: string | null;
  subjectType: "kc_role" | "kc_group" | "user" | "service";
  subjectKey: string;
  effect: "allow" | "deny";
  conditions: unknown;
  priority: number;
  isActive: boolean;
  operations: string[];
}

interface PolicyDetail {
  id: string;
  name: string;
  description: string | null;
  scopeType: "global" | "module" | "entity" | "entity_version";
  scopeKey: string | null;
  isActive: boolean;
  versions: PolicyVersion[];
  currentVersion: PolicyVersion | null;
  rules: PermissionRule[];
  compiled: {
    compiledHash: string;
    generatedAt: string;
    ruleIndex: Record<string, unknown>;
  } | null;
  createdAt: string;
  updatedAt: string | null;
}

type TabId = "rules" | "versions" | "compiled";

// ─── Scope Label ─────────────────────────────────────────────

const SCOPE_LABELS: Record<string, string> = {
  global: "Global",
  module: "Module",
  entity: "Entity",
  entity_version: "Entity Version",
};

// ─── Subject Badge ───────────────────────────────────────────

const SUBJECT_LABELS: Record<string, string> = {
  kc_role: "Role",
  kc_group: "Group",
  user: "User",
  service: "Service",
};

function SubjectBadge({
  type,
  subjectKey,
}: {
  type: string;
  subjectKey: string;
}) {
  const label = SUBJECT_LABELS[type] ?? type;
  const color = SUBJECT_TYPE_BADGE[type] ?? "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        color,
      )}
    >
      {label}: {subjectKey}
    </span>
  );
}

// ─── Effect Badge ────────────────────────────────────────────

function EffectBadge({ effect }: { effect: "allow" | "deny" }) {
  const Icon = effect === "allow" ? ShieldCheck : ShieldX;
  const label = effect === "allow" ? "Allow" : "Deny";
  return (
    <Badge variant="outline" className={cn("gap-1", EFFECT_BADGE[effect])}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

// ─── Tabs ────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: "rules", label: "Rules" },
  { id: "versions", label: "Versions" },
  { id: "compiled", label: "Compiled" },
];

// ─── Rules Tab ───────────────────────────────────────────────

interface RulesTabProps {
  rules: PermissionRule[];
  isDraft: boolean;
  onAddRule: () => void;
  onEditRule: (rule: PermissionRule) => void;
  onDuplicateRule: (rule: PermissionRule) => void;
  onDeleteRule: (rule: PermissionRule) => void;
}

function RulesTab({
  rules,
  isDraft,
  onAddRule,
  onEditRule,
  onDuplicateRule,
  onDeleteRule,
}: RulesTabProps) {
  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-3 mb-3">
          <Shield className="size-6 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-medium">No rules defined</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Add permission rules to define who can perform which operations on
          which resources.
        </p>
        {isDraft && (
          <Button size="sm" className="mt-4" onClick={onAddRule}>
            <Plus className="mr-1.5 size-3.5" />
            Add Rule
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isDraft && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onAddRule}>
            <Plus className="mr-1.5 size-3.5" />
            Add Rule
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">#</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Effect</TableHead>
            <TableHead>Operations</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead className="text-center">Priority</TableHead>
            <TableHead className="text-center">Conditions</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule, index) => (
            <TableRow
              key={rule.id}
              className={cn(!rule.isActive && "opacity-50")}
            >
              <TableCell className="text-xs text-muted-foreground">
                {index + 1}
              </TableCell>
              <TableCell>
                <SubjectBadge
                  type={rule.subjectType}
                  subjectKey={rule.subjectKey}
                />
              </TableCell>
              <TableCell>
                <EffectBadge effect={rule.effect} />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {rule.operations.slice(0, 3).map((op) => (
                    <Badge
                      key={op}
                      variant="secondary"
                      className="text-xs font-mono"
                    >
                      {op}
                    </Badge>
                  ))}
                  {rule.operations.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{rule.operations.length - 3}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {rule.scopeKey ? (
                  <span className="font-mono">
                    {rule.scopeType}:{rule.scopeKey}
                  </span>
                ) : (
                  <span className="capitalize">{rule.scopeType}</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className="text-xs font-mono">
                  {rule.priority}
                </Badge>
              </TableCell>
              <TableCell className="text-center text-xs text-muted-foreground">
                {rule.conditions ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        title="View conditions"
                        className="cursor-pointer hover:opacity-80"
                      >
                        <ConditionSummary conditions={rule.conditions as any} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-3" align="center">
                      <p className="text-xs font-medium mb-2">
                        ABAC Conditions
                      </p>
                      <pre className="text-xs font-mono bg-muted rounded-md p-2 max-h-[200px] overflow-auto">
                        {JSON.stringify(rule.conditions, null, 2)}
                      </pre>
                    </PopoverContent>
                  </Popover>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                {isDraft && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="size-7 p-0">
                        <MoreVertical className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditRule(rule)}>
                        <Pencil className="mr-2 size-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicateRule(rule)}>
                        <Copy className="mr-2 size-3.5" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onDeleteRule(rule)}
                      >
                        <Trash2 className="mr-2 size-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Versions Tab ────────────────────────────────────────────

function VersionsTab({
  versions,
  onNewVersion,
}: {
  versions: PolicyVersion[];
  onNewVersion: () => void;
}) {
  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No versions created yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onNewVersion}>
          <Plus className="mr-1.5 size-3.5" />
          New Version
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Published</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Created By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="font-medium">v{v.versionNo}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <StatusDot status={v.status} />
                  <span className="text-xs capitalize">{v.status}</span>
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {v.publishedAt
                  ? new Date(v.publishedAt).toLocaleDateString()
                  : "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(v.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {v.createdBy}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Compiled Tab ────────────────────────────────────────────

function CompiledTab({ compiled }: { compiled: PolicyDetail["compiled"] }) {
  if (!compiled) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-3 mb-3">
          <Cog className="size-6 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-medium">Not compiled</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Publish the current draft version to trigger policy compilation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>
          Hash:{" "}
          <code className="font-mono">
            {compiled.compiledHash.slice(0, 16)}...
          </code>
        </span>
        <span>
          Generated: {new Date(compiled.generatedAt).toLocaleString()}
        </span>
      </div>
      <pre className="rounded-lg border bg-muted/50 p-4 text-xs font-mono overflow-auto max-h-[500px]">
        {JSON.stringify(compiled.ruleIndex, null, 2)}
      </pre>
    </div>
  );
}

// ─── Version Status Banner ───────────────────────────────────

const VERSION_STATUS_MESSAGES: Record<string, string> = {
  draft:
    "Draft — rules can be edited. Publish to activate this policy version.",
  published:
    "Published — this version is active and read-only. Create a new version to make changes.",
  archived: "Archived — this version is deprecated and no longer evaluated.",
};

function VersionStatusBanner({ status }: { status: string }) {
  const bannerClasses = STATUS_BANNER[status];
  const message = VERSION_STATUS_MESSAGES[status];
  if (!bannerClasses || !message) return null;
  return (
    <div className={cn("rounded-md border px-3 py-1.5 text-xs", bannerClasses)}>
      {message}
    </div>
  );
}

// ─── Data Hook ───────────────────────────────────────────────

interface UsePolicyDetailResult {
  policy: PolicyDetail | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function usePolicyDetail(policyId: string): UsePolicyDetailResult {
  const [policy, setPolicy] = useState<PolicyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPolicy = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/mesh/policy-studio/${encodeURIComponent(policyId)}`,
        {
          headers: buildHeaders(),
          credentials: "same-origin",
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(
          body.error?.message ?? `Failed to load policy (${res.status})`,
        );
      }

      const body = (await res.json()) as { data: PolicyDetail };
      setPolicy(body.data);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load policy");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [policyId]);

  useEffect(() => {
    fetchPolicy();
    return () => abortRef.current?.abort();
  }, [fetchPolicy]);

  return { policy, loading, error, refresh: fetchPolicy };
}

// ─── Detail View ─────────────────────────────────────────────

interface PolicyDetailViewProps {
  policyId: string;
  backHref: string;
}

export function PolicyDetailView({
  policyId,
  backHref,
}: PolicyDetailViewProps) {
  const router = useRouter();
  const { policy, loading, error, refresh } = usePolicyDetail(policyId);
  const [activeTab, setActiveTab] = useState<TabId>("rules");

  // Dialog state
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PermissionRule | null>(null);
  const [deleteRuleTarget, setDeleteRuleTarget] =
    useState<PermissionRule | null>(null);
  const [deleteRuleOpen, setDeleteRuleOpen] = useState(false);
  const [deletePolicyOpen, setDeletePolicyOpen] = useState(false);

  // Mutations
  const mutations = usePolicyMutations({
    policyId,
    onSuccess: refresh,
  });

  // ─── Rule Actions ─────────────────────────────────────────
  const handleAddRule = useCallback(() => {
    setEditingRule(null);
    setRuleFormOpen(true);
  }, []);

  const handleEditRule = useCallback((rule: PermissionRule) => {
    setEditingRule(rule);
    setRuleFormOpen(true);
  }, []);

  const handleRuleFormSubmit = useCallback(
    async (data: RuleFormData) => {
      const payload = data as unknown as Record<string, unknown>;
      const success = editingRule
        ? await mutations.updateRule(editingRule.id, payload)
        : await mutations.addRule(payload);
      if (success) {
        setRuleFormOpen(false);
        setEditingRule(null);
      }
    },
    [mutations, editingRule],
  );

  const handleDuplicateRule = useCallback(
    async (rule: PermissionRule) => {
      await mutations.duplicateRule(rule as unknown as Record<string, unknown>);
    },
    [mutations],
  );

  const handleDeleteRuleClick = useCallback((rule: PermissionRule) => {
    setDeleteRuleTarget(rule);
    setDeleteRuleOpen(true);
  }, []);

  const handleConfirmDeleteRule = useCallback(async () => {
    if (!deleteRuleTarget) return;
    const success = await mutations.deleteRule(deleteRuleTarget.id);
    if (success) {
      setDeleteRuleOpen(false);
      setDeleteRuleTarget(null);
    }
  }, [deleteRuleTarget, mutations]);

  // ─── Header Actions ───────────────────────────────────────
  const handleNewVersion = useCallback(async () => {
    await mutations.newVersion();
  }, [mutations]);

  const handlePublishVersion = useCallback(async () => {
    if (!policy?.currentVersion) return;
    await mutations.publishVersion(policy.currentVersion.id);
  }, [mutations, policy]);

  const handleArchiveVersion = useCallback(async () => {
    if (!policy?.currentVersion) return;
    await mutations.archiveVersion(policy.currentVersion.id);
  }, [mutations, policy]);

  const handleRecompile = useCallback(async () => {
    await mutations.recompile();
  }, [mutations]);

  const handleDeletePolicyClick = useCallback(() => {
    setDeletePolicyOpen(true);
  }, []);

  const handleConfirmDeletePolicy = useCallback(async () => {
    const success = await mutations.deletePolicy();
    if (success) {
      router.push(backHref);
    }
  }, [mutations, router, backHref]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[300px] rounded-lg" />
      </div>
    );
  }

  if (error || !policy) {
    return (
      <div className="space-y-4">
        <BackLink href={backHref} label="Back to Policy Studio" />
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            {error ?? "Policy not found"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={refresh}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const version = policy.currentVersion;
  const status = version?.status ?? "draft";
  const isDraft = status === "draft";

  return (
    <div className="space-y-4">
      {/* Header */}
      <BackLink href={backHref} label="Back to Policy Studio" />

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-xl font-semibold tracking-tight truncate">
            {policy.name}
          </h2>
          <Badge variant="outline" className="capitalize shrink-0">
            {SCOPE_LABELS[policy.scopeType] ?? policy.scopeType}
          </Badge>
          {version && (
            <VersionBadge version={version.versionNo} status={version.status} />
          )}
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={mutations.loading}>
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleNewVersion}>
                <Plus className="mr-2 size-4" />
                New Version
              </DropdownMenuItem>
              {isDraft && (
                <DropdownMenuItem onClick={handlePublishVersion}>
                  <Play className="mr-2 size-4" />
                  Publish Version
                </DropdownMenuItem>
              )}
              {status === "published" && (
                <DropdownMenuItem onClick={handleArchiveVersion}>
                  <Archive className="mr-2 size-4" />
                  Archive
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleRecompile}>
                <Cog className="mr-2 size-4" />
                Recompile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={handleDeletePolicyClick}
              >
                <Trash2 className="mr-2 size-4" />
                Delete Policy
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {policy.description && (
        <p className="text-sm text-muted-foreground">{policy.description}</p>
      )}

      {/* Scope Info */}
      {policy.scopeKey && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Scope target:</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
            {policy.scopeKey}
          </code>
        </div>
      )}

      {/* Mutation error */}
      {mutations.error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {mutations.error}
        </div>
      )}

      {version && <VersionStatusBanner status={status} />}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{policy.rules.length}</div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="size-3 text-success" />
                {policy.rules.filter((r) => r.effect === "allow").length} allow
              </span>
              <span className="inline-flex items-center gap-1">
                <ShieldX className="size-3 text-destructive" />
                {policy.rules.filter((r) => r.effect === "deny").length} deny
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Versions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{policy.versions.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {policy.versions.filter((v) => v.status === "published").length}{" "}
              published
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Compilation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {policy.compiled ? (
                <span className="text-success">Active</span>
              ) : (
                <span className="text-muted-foreground">Pending</span>
              )}
            </div>
            {policy.compiled && (
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                {policy.compiled.compiledHash.slice(0, 12)}...
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <nav className="flex items-center gap-1 border-b" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id ? "true" : "false"}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.id === "rules" && policy.rules.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                {policy.rules.length}
              </Badge>
            )}
            {activeTab === tab.id && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
            )}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <div className="min-h-[200px]">
        {activeTab === "rules" && (
          <RulesTab
            rules={policy.rules}
            isDraft={isDraft}
            onAddRule={handleAddRule}
            onEditRule={handleEditRule}
            onDuplicateRule={handleDuplicateRule}
            onDeleteRule={handleDeleteRuleClick}
          />
        )}
        {activeTab === "versions" && (
          <VersionsTab
            versions={policy.versions}
            onNewVersion={handleNewVersion}
          />
        )}
        {activeTab === "compiled" && <CompiledTab compiled={policy.compiled} />}
      </div>

      {/* Rule Form Dialog */}
      <RuleFormDialog
        open={ruleFormOpen}
        onOpenChange={(open) => {
          setRuleFormOpen(open);
          if (!open) setEditingRule(null);
        }}
        rule={
          editingRule
            ? {
                ...editingRule,
                scopeKey: editingRule.scopeKey ?? undefined,
                conditions:
                  editingRule.conditions as RuleFormData["conditions"],
              }
            : null
        }
        onSubmit={handleRuleFormSubmit}
        loading={mutations.loading}
      />

      {/* Delete Rule Confirmation */}
      <ConfirmDeleteDialog
        open={deleteRuleOpen}
        onOpenChange={setDeleteRuleOpen}
        title="Delete Rule"
        description={`Are you sure you want to delete this ${deleteRuleTarget?.effect ?? ""} rule for "${deleteRuleTarget?.subjectKey ?? ""}"?`}
        onConfirm={handleConfirmDeleteRule}
        loading={mutations.loading}
      />

      {/* Delete Policy Confirmation */}
      <ConfirmDeleteDialog
        open={deletePolicyOpen}
        onOpenChange={setDeletePolicyOpen}
        title="Delete Policy"
        description={`Are you sure you want to delete "${policy.name}"? This will remove all versions, rules, and compiled data. This action cannot be undone.`}
        onConfirm={handleConfirmDeletePolicy}
        loading={mutations.loading}
      />
    </div>
  );
}
