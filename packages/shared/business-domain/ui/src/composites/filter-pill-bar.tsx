import { cn } from "@athyper/theme/utils";
import { Button } from "../primitives/button";

export interface FilterPillItem<T extends string = string> {
  value: T;
  label: string;
  /** Optional count shown after the label in muted text. */
  count?: number;
}

export interface FilterPillBarProps<T extends string = string> {
  items: FilterPillItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * When provided, prepends an "All" pill that sets value to "" (empty string).
   * The parent state type must allow "" — use `T | ""` or `string` if needed.
   */
  allItem?: { label: string };
  /**
   * compact=true uses h-6 text-xs pills (default: h-7 text-xs).
   * Use inside dense toolbars or secondary filter rows.
   */
  compact?: boolean;
  className?: string;
}

/**
 * FilterPillBar
 *
 * A row of ghost/primary pill buttons for client-side enum filtering.
 * Purely presentational — owns no query-string or URL state.
 *
 * Usage:
 *   <FilterPillBar
 *     items={CHANNELS.map((c) => ({ value: c, label: c }))}
 *     value={channelFilter}
 *     onChange={(v) => setChannelFilter(v as ProviderChannel | "")}
 *     allItem={{ label: "All" }}
 *     className="mb-4"
 *   />
 */
export function FilterPillBar<T extends string = string>({
  items,
  value,
  onChange,
  allItem,
  compact = false,
  className,
}: FilterPillBarProps<T>) {
  const allValue = "" as T;
  const pillClass = compact ? "h-6 text-xs" : "h-7 text-xs";

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {allItem && (
        <Button
          size="sm"
          variant={value === allValue ? "primary" : "ghost"}
          className={pillClass}
          onClick={() => onChange(allValue)}
        >
          {allItem.label}
        </Button>
      )}
      {items.map((item) => (
        <Button
          key={item.value}
          size="sm"
          variant={value === item.value ? "primary" : "ghost"}
          className={pillClass}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="ml-1 text-muted-foreground">{item.count}</span>
          )}
        </Button>
      ))}
    </div>
  );
}

