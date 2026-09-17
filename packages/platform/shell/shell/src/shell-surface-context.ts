"use client";
import { createContext, useContext } from "react";
import type { ShellSurface } from "./shell-surfaces";
export const ShellSurfaceContext = createContext<
  | {
      readonly surface: ShellSurface;
      readonly setContext: (id: string, open: boolean) => void;
    }
  | undefined
>(undefined);
export const useShellSurfaceContext = () => useContext(ShellSurfaceContext);
