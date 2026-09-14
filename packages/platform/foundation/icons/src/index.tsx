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
import {
  BellIcon,
  CalculatorIcon,
  ClipboardCheckIcon,
  ContactRoundIcon,
  InboxIcon,
  MailIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  PhoneIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  WarehouseIcon,
} from "./shell-icons";
import {
  AssetIcon,
  BanknoteIcon,
  BookOpenIcon,
  BoxesIcon,
  BriefcaseIcon,
  BuildingKeyIcon,
  ChartIcon,
  CoinsIcon,
  DatabaseCheckIcon,
  DatabaseIcon,
  FactoryIcon,
  FileSignatureIcon,
  GanttIcon,
  HandshakeIcon,
  HeadsetIcon,
  IdCardIcon,
  LandmarkIcon,
  MapPinIcon,
  OrganizationIcon,
  PackageIcon,
  PercentReceiptIcon,
  ReceiptInIcon,
  ReceiptOutIcon,
  RouteIcon,
  TagIcon,
  TargetIcon,
  TruckIcon,
  UserClockIcon,
  UsersIcon,
  UserStarIcon,
  WalletIcon,
  WrenchIcon,
} from "./catalog-icons";
import { Building2Icon, SettingsIcon } from "./list-controls";

export type SemanticIconKey = (typeof SEMANTIC_ICON_KEYS)[number];
export const SEMANTIC_ICON_KEYS = [
  "asset",
  "banknote",
  "bell",
  "book-open",
  "boxes",
  "briefcase",
  "building",
  "building-calculator",
  "building-key",
  "building-wrench",
  "calculator",
  "cart",
  "chart",
  "check",
  "chevron-down",
  "clipboard-check",
  "close",
  "coins",
  "contact",
  "database",
  "database-check",
  "database-currency",
  "factory",
  "factory-handshake",
  "file-signature",
  "gantt",
  "handshake",
  "headset",
  "home",
  "id-card",
  "info",
  "landmark",
  "map-pin",
  "menu",
  "message",
  "organization",
  "package",
  "percent-receipt",
  "receipt-in",
  "receipt-out",
  "route",
  "settings",
  "shield-check",
  "shopping-cart",
  "tag",
  "target",
  "truck",
  "user",
  "user-briefcase",
  "user-clock",
  "user-star",
  "users",
  "wallet",
  "warehouse",
  "warning",
  "wrench",
] as const;

export function resolveIcon(
  key: SemanticIconKey | string,
): ComponentType<IconProps> {
  switch (key) {
    case "calculator":
      return CalculatorIcon;
    case "asset":
      return AssetIcon;
    case "banknote":
      return BanknoteIcon;
    case "bell":
      return BellIcon;
    case "book-open":
      return BookOpenIcon;
    case "boxes":
      return BoxesIcon;
    case "briefcase":
    case "user-briefcase":
      return BriefcaseIcon;
    case "building":
      return Building2Icon;
    case "building-calculator":
      return CalculatorIcon;
    case "building-key":
      return BuildingKeyIcon;
    case "building-wrench":
    case "wrench":
      return WrenchIcon;
    case "cart":
    case "shopping-cart":
      return ShoppingCartIcon;
    case "chart":
      return ChartIcon;
    case "check":
      return CheckIcon;
    case "chevron-down":
      return ChevronDownIcon;
    case "close":
      return CloseIcon;
    case "clipboard-check":
      return ClipboardCheckIcon;
    case "coins":
      return CoinsIcon;
    case "contact":
      return ContactRoundIcon;
    case "database":
    case "database-currency":
      return DatabaseIcon;
    case "database-check":
      return DatabaseCheckIcon;
    case "factory":
      return FactoryIcon;
    case "factory-handshake":
      return HandshakeIcon;
    case "file-signature":
      return FileSignatureIcon;
    case "gantt":
      return GanttIcon;
    case "handshake":
      return HandshakeIcon;
    case "headset":
      return HeadsetIcon;
    case "home":
      return HomeIcon;
    case "info":
      return InfoIcon;
    case "id-card":
      return IdCardIcon;
    case "landmark":
      return LandmarkIcon;
    case "map-pin":
      return MapPinIcon;
    case "menu":
      return MenuIcon;
    case "message":
      return MessageCircleIcon;
    case "organization":
      return OrganizationIcon;
    case "package":
      return PackageIcon;
    case "percent-receipt":
      return PercentReceiptIcon;
    case "receipt-in":
      return ReceiptInIcon;
    case "receipt-out":
      return ReceiptOutIcon;
    case "route":
      return RouteIcon;
    case "settings":
      return SettingsIcon;
    case "shield-check":
      return ShieldCheckIcon;
    case "tag":
      return TagIcon;
    case "target":
      return TargetIcon;
    case "truck":
      return TruckIcon;
    case "user":
      return UserIcon;
    case "user-clock":
      return UserClockIcon;
    case "user-star":
      return UserStarIcon;
    case "users":
      return UsersIcon;
    case "wallet":
      return WalletIcon;
    case "warehouse":
      return WarehouseIcon;
    case "warning":
      return WarningIcon;
    default:
      if (
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname.endsWith(".local"))
      )
        console.warn(`[athyper/icons] Unknown semantic icon key: ${key}`);
      return InfoIcon;
  }
}

export const SEMANTIC_ICONS: Readonly<
  Record<SemanticIconKey, ComponentType<IconProps>>
> = Object.freeze(
  Object.fromEntries(
    SEMANTIC_ICON_KEYS.map((key) => [key, resolveIcon(key)]),
  ) as Record<SemanticIconKey, ComponentType<IconProps>>,
);

export type NotificationChannelIconKey =
  "in_app" | "email" | "sms" | "phone" | "push" | "whatsapp";
export function resolveNotificationChannelIcon(
  channel: NotificationChannelIconKey | string,
): ComponentType<IconProps> {
  switch (channel) {
    case "in_app":
      return InboxIcon;
    case "email":
      return MailIcon;
    case "sms":
      return MessageSquareIcon;
    case "phone":
      return PhoneIcon;
    case "push":
      return BellIcon;
    case "whatsapp":
      return MessageCircleIcon;
    default:
      return BellIcon;
  }
}

export type { IconProps } from "./icon";
export { CheckIcon } from "./check";
export { ChevronDownIcon } from "./chevron-down";
export { CloseIcon } from "./close";
export { HomeIcon } from "./home";
export { InfoIcon } from "./info";
export {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  Building2Icon,
  ColumnsIcon,
  CopyIcon,
  DensityIcon,
  DownloadIcon,
  EyeIcon,
  FilterIcon,
  GripVerticalIcon,
  GroupIcon,
  LayoutIcon,
  LibraryBigIcon,
  LinkIcon,
  MoreHorizontalIcon,
  MoreVerticalIcon,
  RefreshCwIcon,
  ResetIcon,
  SearchIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SortIcon,
  StarIcon,
  TrashIcon,
} from "./list-controls";
export { MenuIcon } from "./menu";
export { UserIcon } from "./user";
export { WarningIcon } from "./warning";
export * from "./catalog-icons";
export {
  BellIcon,
  CalculatorIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  ClipboardCheckIcon,
  ClockIcon,
  ContactRoundIcon,
  FileTextIcon,
  HistoryIcon,
  InboxIcon,
  LanguagesIcon,
  LockIcon,
  LogOutIcon,
  MailIcon,
  Maximize2Icon,
  Minimize2Icon,
  MessageCircleIcon,
  MessageSquareIcon,
  MinusIcon,
  NetworkIcon,
  PanelRightIcon,
  PanelsTopLeftIcon,
  PhoneIcon,
  PlusIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  SparklesIcon,
  WarehouseIcon,
} from "./shell-icons";
export { AtlasBrandIcon } from "./atlas-brand";
