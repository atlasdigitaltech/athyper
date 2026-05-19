import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors, type SemanticColorSet, type SemanticIntent } from "@athyper/theme/semantic-colors";
import {
  adminStatusIntent,
  apArStatusIntent,
  closeRunStatusIntent,
  closeTaskStatusIntent,
  kanbanStatusIntent,
} from "@athyper/theme/domain-intents";

const SEMANTIC_RESOLVERS: Record<string, (value: string) => SemanticIntent> = {
  adminStatusIntent,
  apArStatusIntent,
  closeRunStatusIntent,
  closeTaskStatusIntent,
  kanbanStatusIntent,
};

export const listTypography = {
  statusBadge: "inline-flex h-5 items-center rounded-full border px-1.5 text-doc-badge font-medium leading-none capitalize",
  statusText: "inline-flex items-center gap-2 text-[13px] font-medium leading-5 text-foreground capitalize",
  entityBadge: "font-medium",
  recordId: "text-doc-support text-muted-foreground",
  emptyState: "py-16 text-center text-[13px] leading-5 text-muted-foreground",
  sectionHeading: "text-xs font-medium uppercase tracking-wide text-muted-foreground",
  table: {
    header: "text-[13px] font-semibold leading-5 text-muted-foreground",
    cell: "text-[13px] leading-5 text-foreground",
    cellCompact: "text-xs text-foreground",
    meta: "text-xs text-muted-foreground",
  },
  card: {
    title: "text-sm font-medium leading-snug text-foreground",
    label: "truncate text-xs text-muted-foreground",
    value: "truncate text-xs font-medium text-foreground",
  },
  sheet: {
    table: "text-xs text-foreground",
    header: "text-doc-action font-semibold text-muted-foreground",
    cell: "text-xs text-foreground",
    rowNumber: "text-doc-support text-muted-foreground",
  },
  kpi: {
    label: "text-xs text-muted-foreground",
    value: "text-2xl font-semibold tabular-nums text-foreground",
    sub: "text-doc-support text-muted-foreground",
  },
} as const;

export function resolveRuntimeStatusIntent(value: string, resolverName?: string): SemanticIntent {
  const resolverFn = resolverName ? SEMANTIC_RESOLVERS[resolverName] : undefined;
  return resolverFn ? resolverFn(value) : kanbanStatusIntent(value);
}

export function resolveRuntimeStatusColors(value: string, resolverName?: string): SemanticColorSet {
  return resolveSemanticColors(resolveRuntimeStatusIntent(value, resolverName));
}

export function runtimeStatusBarClass(value: string, resolverName?: string): string {
  const colors = resolveRuntimeStatusColors(value, resolverName);
  return cn(colors.dot, "opacity-70");
}

export function runtimeStatusDotClass(value: string, resolverName?: string): string {
  return resolveRuntimeStatusColors(value, resolverName).dot;
}

export function RuntimeStatusBadge({
  value,
  resolverName,
  className,
}: {
  value: string;
  resolverName?: string;
  className?: string;
}) {
  if (!value) return null;
  const colors = resolveRuntimeStatusColors(value, resolverName);
  return (
    <span className={cn(listTypography.statusBadge, colors.subtleBadge, className)}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function RuntimeStatusText({
  value,
  resolverName,
  className,
}: {
  value: string;
  resolverName?: string;
  className?: string;
}) {
  if (!value) return null;
  return (
    <span className={cn(listTypography.statusText, className)}>
      <span className={cn("size-2 rounded-full", runtimeStatusDotClass(value, resolverName))} aria-hidden="true" />
      <span className="truncate">{value.replace(/_/g, " ")}</span>
    </span>
  );
}
