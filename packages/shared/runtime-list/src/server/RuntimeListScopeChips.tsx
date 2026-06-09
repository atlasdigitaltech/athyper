import type { RuntimeAccessScope } from "../core/types";

interface RuntimeListScopeChipsProps {
  accessScope: RuntimeAccessScope;
}

export function RuntimeListScopeChips({ accessScope }: RuntimeListScopeChipsProps) {
  if (accessScope.status !== "ready" || accessScope.labels.length === 0) return null;

  const visibleLabels = accessScope.labels.filter((item) => item.key !== "tenant");
  if (visibleLabels.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {visibleLabels.map((item) => (
        <span
          key={item.key}
          className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border bg-muted/60 px-2 font-medium text-muted-foreground"
          title={`${item.label}: ${item.value}`}
        >
          <span className="text-foreground">{item.label}</span>
          <span className="truncate">{item.value}</span>
        </span>
      ))}
    </div>
  );
}
