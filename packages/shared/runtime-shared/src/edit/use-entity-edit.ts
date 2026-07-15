"use client";

import { useContext } from "react";
import { EditGuardContext, type EditGuardContextValue } from "./edit-guard-context";

export function useEntityEdit(): EditGuardContextValue {
  const context = useContext(EditGuardContext);
  return context ?? {
    editState: undefined,
    guardNavigate: (fn) => fn(),
  };
}
