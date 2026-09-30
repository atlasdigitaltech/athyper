"use client";
import { createContext, useContext, type ReactNode } from "react";
/** Plane adapter for descriptor-driven Entity Framework context requirements. */
export interface EntityContextAdapter {
  readonly status: "loading" | "ready" | "error";
  readonly generation: string | number;
  readonly gate: (children: ReactNode) => ReactNode;
}
const Context = createContext<EntityContextAdapter | undefined>(undefined);
export const EntityContextProvider = Context.Provider;
export const useEntityContext = () => useContext(Context);
