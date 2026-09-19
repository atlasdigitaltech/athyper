"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
export interface EntityTaskHeader {
  readonly title: string;
  readonly description?: string;
  readonly supportingRow?: ReactNode;
  readonly metadata?: ReactNode;
  readonly actions?: ReactNode;
  readonly navigation?: ReactNode;
}
const TaskHeaderContext = createContext<
  | {
      header?: EntityTaskHeader;
      register: (header: EntityTaskHeader) => () => void;
    }
  | undefined
>(undefined);
/** Scoped to one entity application. An unmounted task always restores its normal header. */
export function EntityTaskHeaderProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [registration, setRegistration] = useState<{
    token: object;
    header: EntityTaskHeader;
  }>();
  const register = useCallback((header: EntityTaskHeader) => {
    const token = {};
    setRegistration({ token, header });
    return () =>
      setRegistration((current) =>
        current?.token === token ? undefined : current,
      );
  }, []);
  const value = useMemo(
    () => ({ header: registration?.header, register }),
    [registration, register],
  );
  return (
    <TaskHeaderContext.Provider value={value}>
      {children}
    </TaskHeaderContext.Provider>
  );
}
export function useEntityTaskHeader() {
  return useContext(TaskHeaderContext)?.header;
}
export function useRegisterEntityTaskHeader(header: EntityTaskHeader) {
  const register = useContext(TaskHeaderContext)?.register;
  useEffect(() => register?.(header), [register, header]);
  return Boolean(register);
}
