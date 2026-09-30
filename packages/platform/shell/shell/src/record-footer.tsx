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
export interface RecordFooterInformation {
  readonly recordId: string;
  readonly metadataRelease: string | number;
  readonly recordRevision?: string | number;
}
type InformationRegistration = {
  owner: object;
  scopeKey: string;
  information?: RecordFooterInformation;
};
const InformationContext = createContext<
  | {
      information?: RecordFooterInformation;
      scopeKey: string;
      register: (value: InformationRegistration) => () => void;
    }
  | undefined
>(undefined);
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
  const [informationRegistration, setInformationRegistration] =
    useState<InformationRegistration>();
  const registerInformation = useCallback((value: InformationRegistration) => {
    setInformationRegistration(value);
    return () =>
      setInformationRegistration((current) =>
        current?.owner === value.owner ? undefined : current,
      );
  }, []);
  const information =
    informationRegistration?.scopeKey === scopeKey
      ? informationRegistration.information
      : undefined;
  const informationValue = useMemo(
    () => ({ information, scopeKey, register: registerInformation }),
    [information, scopeKey, registerInformation],
  );
  const register = useCallback((value: Registration) => {
    setRegistration(value);
    return () =>
      setRegistration((current) =>
        current?.owner === value.owner ? undefined : current,
      );
  }, []);
  // Scope changes hide the previous record synchronously without remounting page input.
  const value = useMemo(
    () => ({
      sources: registration?.scopeKey === scopeKey ? registration.sources : [],
      scopeKey,
      register,
    }),
    [registration, scopeKey, register],
  );
  return (
    <Context.Provider value={value}>
      <InformationContext.Provider value={informationValue}>
        {children}
      </InformationContext.Provider>
    </Context.Provider>
  );
}
/** Structured, already-authorized identifiers only; no record values or credentials. */
export function useRecordFooterInformation(
  information?: RecordFooterInformation,
) {
  const context = useContext(InformationContext);
  const register = context?.register,
    scopeKey = context?.scopeKey;
  const serialized = JSON.stringify(information);
  useEffect(() => {
    if (!register || scopeKey === undefined) return;
    return register({
      owner: {},
      scopeKey,
      information: serialized ? JSON.parse(serialized) : undefined,
    });
  }, [register, scopeKey, serialized]);
}
export function useActiveRecordFooterInformation() {
  return useContext(InformationContext)?.information;
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
