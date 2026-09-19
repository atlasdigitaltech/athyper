"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const RecordPageContext = createContext<
  ((owner: symbol, active: boolean) => void) | undefined
>(undefined);
/** Collection chrome yields to an explicitly mounted record page, including its loading state. */
export function EntityPageLayout({
  collectionHeader,
  collectionNavigation,
  children,
}: {
  readonly collectionHeader: ReactNode;
  readonly collectionNavigation: ReactNode;
  readonly children: ReactNode;
}) {
  const [owners, setOwners] = useState<ReadonlySet<symbol>>(new Set());
  const register = useMemo(
    () => (owner: symbol, active: boolean) =>
      setOwners((current) => {
        const next = new Set(current);
        if (active) next.add(owner);
        else next.delete(owner);
        return next;
      }),
    [],
  );
  return (
    <RecordPageContext.Provider value={register}>
      {owners.size ? null : (
        <>
          {collectionHeader}
          {collectionNavigation}
        </>
      )}
      {children}
    </RecordPageContext.Provider>
  );
}
export function useRecordPage() {
  const register = useContext(RecordPageContext);
  useEffect(() => {
    if (!register) return;
    const owner = Symbol("record-page");
    register(owner, true);
    return () => register(owner, false);
  }, [register]);
}
