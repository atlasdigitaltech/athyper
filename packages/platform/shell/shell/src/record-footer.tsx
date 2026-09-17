"use client";
import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
export interface RecordSource {
  readonly sourceObject: string;
  readonly observedAt: string;
}
type Registration = {
  readonly owner: object;
  readonly scopeKey: string;
  readonly sources: readonly RecordSource[];
};
const Context = createContext<
  | {
      readonly sources: readonly RecordSource[];
      readonly scopeKey: string;
      readonly register: (value: Registration) => () => void;
    }
  | undefined
>(undefined);
export function RecordFooterProvider({
  children,
  scopeKey = "default",
}: {
  readonly children: ReactNode;
  readonly scopeKey?: string;
}) {
  const [registration, setRegistration] = useState<Registration>();
  const register = useCallback((value: Registration) => {
    setRegistration(value);
    return () =>
      setRegistration((current) =>
        current?.owner === value.owner ? undefined : current,
      );
  }, []);
  // Scope changes hide the previous record synchronously without remounting page input.
  const sources =
    registration?.scopeKey === scopeKey ? registration.sources : [];
  const value = useMemo(
    () => ({ sources, scopeKey, register }),
    [sources, scopeKey, register],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** Only the active, authorized record section owns the footer provenance. */
export function useRecordFooterSources(sources: readonly RecordSource[]) {
  const context = useContext(Context);
  const register = context?.register,
    scopeKey = context?.scopeKey;
  const serialized = JSON.stringify(sources);
  useEffect(() => {
    if (!register || scopeKey === undefined) return;
    return register({
      owner: {},
      scopeKey,
      sources: JSON.parse(serialized) as readonly RecordSource[],
    });
  }, [register, scopeKey, serialized]);
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
