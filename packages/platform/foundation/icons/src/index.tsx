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
import { CalculatorIcon, ShieldCheckIcon, ShoppingCartIcon, WarehouseIcon } from "./shell-icons";

export type SemanticIconKey = "calculator" | "check" | "chevron-down" | "close" | "home" | "info" | "menu" | "shield-check" | "shopping-cart" | "user" | "warehouse" | "warning";
export const SEMANTIC_ICON_KEYS = ["calculator", "check", "chevron-down", "close", "home", "info", "menu", "shield-check", "shopping-cart", "user", "warehouse", "warning"] as const;

export function resolveIcon(key: SemanticIconKey | string): ComponentType<IconProps> {
  switch (key) {
    case "calculator": return CalculatorIcon;
    case "check": return CheckIcon;
    case "chevron-down": return ChevronDownIcon;
    case "close": return CloseIcon;
    case "home": return HomeIcon;
    case "info": return InfoIcon;
    case "menu": return MenuIcon;
    case "shield-check": return ShieldCheckIcon;
    case "shopping-cart": return ShoppingCartIcon;
    case "user": return UserIcon;
    case "warehouse": return WarehouseIcon;
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
export { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, Building2Icon, ColumnsIcon, DensityIcon, DownloadIcon, FilterIcon, GripVerticalIcon, GroupIcon, LayoutIcon, LinkIcon, MoreHorizontalIcon, MoreVerticalIcon, RefreshCwIcon, ResetIcon, SearchIcon, SettingsIcon, SortIcon, StarIcon, TrashIcon } from "./list-controls";
export { MenuIcon } from "./menu";
export { UserIcon } from "./user";
export { WarningIcon } from "./warning";
export { BellIcon, CalculatorIcon, ChevronLeftIcon, ChevronRightIcon, CircleCheckIcon, ClipboardCheckIcon, ClockIcon, ContactRoundIcon, FileTextIcon, HistoryIcon, InboxIcon, LogOutIcon, NetworkIcon, PanelsTopLeftIcon, ShieldCheckIcon, ShoppingCartIcon, SparklesIcon, WarehouseIcon } from "./shell-icons";
