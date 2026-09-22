"use client";
import { createContext, useContext } from "react";

export interface WorkspaceSidePanelRegistration {
  readonly id: string;
  readonly pinned: boolean;
  readonly width: number;
}
/** One shell-owned slot. Owners keep their content mounted when another tool claims it. */
export const WorkspaceSidePanelContext = createContext<
  | {
      readonly owner?: string;
      readonly claim: (panel: WorkspaceSidePanelRegistration) => void;
      readonly release: (id: string) => void;
    }
  | undefined
>(undefined);
export const useWorkspaceSidePanel = () =>
  useContext(WorkspaceSidePanelContext);
