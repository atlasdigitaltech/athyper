"use client";
import { createContext, useContext } from "react";
export const AtlasSurfaceContext = createContext<
  | {
      sidebarOpen: boolean;
      close: () => void;
      fullscreen: () => void;
      minimize: () => void;
    }
  | undefined
>(undefined);
export const useAtlasSurface = () => useContext(AtlasSurfaceContext);
