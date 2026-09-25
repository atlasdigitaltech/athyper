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
// Registration must not subscribe to its own header updates: callers may render
// fresh action elements, which otherwise causes an effect/register/render loop.
const TaskHeaderRegistrationContext = createContext<((header:EntityTaskHeader)=>()=>void) | undefined>(undefined);
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
    <TaskHeaderRegistrationContext.Provider value={register}><TaskHeaderContext.Provider value={value}>
      {children}
    </TaskHeaderContext.Provider></TaskHeaderRegistrationContext.Provider>
  );
}
export function useEntityTaskHeader() {
  return useContext(TaskHeaderContext)?.header;
}
export function useRegisterEntityTaskHeader(header: EntityTaskHeader) {
  const register = useContext(TaskHeaderRegistrationContext);
  useEffect(() => register?.(header), [register, header]);
  return Boolean(register);
}
