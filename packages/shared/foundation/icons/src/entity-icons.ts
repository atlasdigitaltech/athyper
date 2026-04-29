/**
 * @athyper/icons — Entity Icon Registry
 *
 * Maps control.entity.icon_key values to Lucide icon components.
 * The icon_key column uses kebab-case Lucide names (e.g. "shopping-cart").
 *
 * Add new entries here when a new entity is seeded with a novel icon_key.
 * Unknown keys fall back to CircleHelp.
 */
import {
  ShoppingCart,
  FileText,
  Building2,
  Building,
  Users,
  Box,
  Package,
  PackageCheck,
  Warehouse,
  Truck,
  BookOpen,
  Banknote,
  Landmark,
  Fingerprint,
  ReceiptText,
  Award,
  UserCircle,
  UserCog,
  UserPen,
  ShieldCheck,
  ShieldAlert,
  MapPin,
  List,
  Split,
  Scroll,
  FolderTree,
  FolderKanban,
  ListChecks,
  ListPlus,
  Receipt,
  Tag,
  Tags,
  ArrowRightLeft,
  Bell,
  BellRing,
  AtSign,
  Scale,
  GitBranch,
  Timer,
  Cable,
  FolderOpen,
  MessageCircle,
  Calculator,
  CreditCard,
  PiggyBank,
  Wallet,
  Handshake,
  Radar,
  BadgeCheck,
  Wrench,
  TrendingUp,
  Coins,
  Headset,
  Factory,
  HardHat,
  Blocks,
  LayoutTemplate,
  ClipboardCheck,
  Globe,
  BarChart3,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

const ENTITY_ICON_MAP: Record<string, LucideIcon> = {
  // ── Supply Chain ─────────────────────────────────────────────────────────────
  "shopping-cart":  ShoppingCart,
  "warehouse":      Warehouse,
  "truck":          Truck,
  "package":        Package,
  "package-check":  PackageCheck,
  "box":            Box,
  "handshake":      Handshake,
  "radar":          Radar,
  "trending-up":    TrendingUp,

  // ── Finance ──────────────────────────────────────────────────────────────────
  "file-text":      FileText,
  "book-open":      BookOpen,
  "banknote":       Banknote,
  "landmark":       Landmark,
  "receipt":        Receipt,
  "receipt-tax":    ReceiptText,
  "calculator":     Calculator,
  "credit-card":    CreditCard,
  "piggy-bank":     PiggyBank,
  "wallet":         Wallet,
  "coins":          Coins,
  "scale":          Scale,
  "split":          Split,
  "scroll":         Scroll,
  "list":           List,
  "list-checks":    ListChecks,
  "list-plus":      ListPlus,
  "arrow-right-left": ArrowRightLeft,
  "bar-chart-3":    BarChart3,

  // ── Master / People ──────────────────────────────────────────────────────────
  "building":       Building,
  "building-2":     Building2,
  "users":          Users,
  "user-circle":    UserCircle,
  "user-cog":       UserCog,
  "user-pen":       UserPen,
  "fingerprint":    Fingerprint,
  "map-pin":        MapPin,
  "award":          Award,
  "tag":            Tag,
  "tags":           Tags,

  // ── Platform / Governance ────────────────────────────────────────────────────
  "shield-check":   ShieldCheck,
  "shield-alert":   ShieldAlert,
  "blocks":         Blocks,
  "layout-template": LayoutTemplate,
  "clipboard-check": ClipboardCheck,
  "git-branch":     GitBranch,
  "timer":          Timer,
  "cable":          Cable,
  "folder-open":    FolderOpen,
  "folder-tree":    FolderTree,
  "folder-kanban":  FolderKanban,
  "message-circle": MessageCircle,
  "bell":           Bell,
  "bell-ring":      BellRing,
  "at-sign":        AtSign,
  "globe":          Globe,
  "headset":        Headset,
  "factory":        Factory,
  "hard-hat":       HardHat,
  "badge-check":    BadgeCheck,
  "wrench":         Wrench,
};

const FALLBACK_ICON: LucideIcon = CircleHelp;

/**
 * Resolve an entity icon_key string to a Lucide component.
 *
 * @param iconKey - value of control.entity.icon_key (e.g. "shopping-cart")
 * @returns Lucide icon component — never undefined, falls back to CircleHelp
 */
export function getEntityIcon(iconKey: string): LucideIcon {
  return ENTITY_ICON_MAP[iconKey] ?? FALLBACK_ICON;
}

/** Check if an icon_key has a registered mapping. */
export function hasEntityIcon(iconKey: string): boolean {
  return iconKey in ENTITY_ICON_MAP;
}
