"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
export interface RecordSource {
  readonly sourceObject: string;
  readonly observedAt: string;
}
const Context = createContext<
  | {
      sources: readonly RecordSource[];
      setSources: React.Dispatch<React.SetStateAction<readonly RecordSource[]>>;
    }
  | undefined
>(undefined);
export function RecordFooterProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [sources, setSources] = useState<readonly RecordSource[]>([]);
  const value = useMemo(() => ({ sources, setSources }), [sources]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** Only the active, authorized record section owns the footer provenance. */
export function useRecordFooterSources(sources: readonly RecordSource[]) {
  const setSources = useContext(Context)?.setSources;
  const serialized = JSON.stringify(sources);
  useEffect(() => {
    if (!setSources) return;
    const next = JSON.parse(serialized) as readonly RecordSource[];
    setSources(next);
    return () => setSources((current) => (current === next ? [] : current));
  }, [setSources, serialized]);
}
export function RecordFooterSource() {
  const sources = useContext(Context)?.sources ?? [];
  if (!sources.length) return null;
  const observedAt = sources[0]!.observedAt;
  const date = new Date(observedAt);
  const observed = Number.isNaN(date.getTime())
    ? undefined
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(date);
  return (
    <div className="athyper-shell__record-source">
      <details key={JSON.stringify(sources)}>
        <summary>Data source</summary>
        <ul>
          {sources.map((source, index) => (
            <li key={index}>{source.sourceObject}</li>
          ))}
        </ul>
      </details>
      {observed ? (
        <span>
          · Observed <time dateTime={observedAt}>{observed}</time>
        </span>
      ) : null}
    </div>
  );
}
