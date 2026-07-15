"use client";

import { createContext } from "react";
import type { EntityEditState } from "./types";

export interface EditGuardContextValue {
  editState: EntityEditState | undefined;
  guardNavigate: (fn: () => void) => void;
}

export const EditGuardContext = createContext<EditGuardContextValue | null>(null);
