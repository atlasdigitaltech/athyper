import type { ComponentType } from "react";
import { CheckIcon } from "./check";
import { ChevronDownIcon } from "./chevron-down";
import { CloseIcon } from "./close";
import { HomeIcon } from "./home";
import { InfoIcon } from "./info";
import type { IconProps } from "./icon";
import { MenuIcon } from "./menu";
import { UserIcon } from "./user";
import { WarningIcon } from "./warning";

export type SemanticIconKey = "check" | "chevron-down" | "close" | "home" | "info" | "menu" | "user" | "warning";
export const SEMANTIC_ICON_KEYS = ["check", "chevron-down", "close", "home", "info", "menu", "user", "warning"] as const;

export function resolveIcon(key: SemanticIconKey | string): ComponentType<IconProps> {
  switch (key) {
    case "check": return CheckIcon;
    case "chevron-down": return ChevronDownIcon;
    case "close": return CloseIcon;
    case "home": return HomeIcon;
    case "info": return InfoIcon;
    case "menu": return MenuIcon;
    case "user": return UserIcon;
    case "warning": return WarningIcon;
    default:
      if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname.endsWith(".local"))) console.warn(`[athyper/icons] Unknown semantic icon key: ${key}`);
      return InfoIcon;
  }
}

export type { IconProps } from "./icon";
export { CheckIcon } from "./check";
export { ChevronDownIcon } from "./chevron-down";
export { CloseIcon } from "./close";
export { HomeIcon } from "./home";
export { InfoIcon } from "./info";
export { MenuIcon } from "./menu";
export { UserIcon } from "./user";
export { WarningIcon } from "./warning";
