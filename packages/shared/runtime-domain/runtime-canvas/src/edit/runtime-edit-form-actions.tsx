"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type RuntimeEditFormActionStatus = "idle" | "saving" | "saved" | "error";
export type RuntimeEditFormActionMode = "create" | "edit";

export interface RuntimeEditFormActionState {
  formId: string | null;
  mode: RuntimeEditFormActionMode;
  dirty: boolean;
  saving: boolean;
  status: RuntimeEditFormActionStatus;
  message: string;
}

interface RuntimeEditFormActionContextValue {
  state: RuntimeEditFormActionState;
  publish: (state: RuntimeEditFormActionState) => void;
  clear: (formId: string) => void;
}

const EMPTY_STATE: RuntimeEditFormActionState = {
  formId: null,
  mode: "edit",
  dirty: false,
  saving: false,
  status: "idle",
  message: "",
};

const RuntimeEditFormActionContext = createContext<RuntimeEditFormActionContextValue>({
  state: EMPTY_STATE,
  publish: () => undefined,
  clear: () => undefined,
});

export function RuntimeEditFormActionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RuntimeEditFormActionState>(EMPTY_STATE);

  const publish = useCallback((next: RuntimeEditFormActionState) => {
    setState(next);
  }, []);

  const clear = useCallback((formId: string) => {
    setState((current) => (current.formId === formId ? EMPTY_STATE : current));
  }, []);

  const value = useMemo(() => ({ state, publish, clear }), [clear, publish, state]);

  return (
    <RuntimeEditFormActionContext.Provider value={value}>
      {children}
    </RuntimeEditFormActionContext.Provider>
  );
}

export function useRuntimeEditFormActionPublisher(): Pick<RuntimeEditFormActionContextValue, "publish" | "clear"> {
  const { publish, clear } = useContext(RuntimeEditFormActionContext);
  return { publish, clear };
}

export function useRuntimeEditFormActionState(): RuntimeEditFormActionState {
  return useContext(RuntimeEditFormActionContext).state;
}

export function runtimeEditFormDomId(entitySlug: string, recordId: string, mode: RuntimeEditFormActionMode): string {
  return `runtime-${mode}-form-${toDomToken(entitySlug)}-${toDomToken(recordId)}`;
}

function toDomToken(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "record";
}
