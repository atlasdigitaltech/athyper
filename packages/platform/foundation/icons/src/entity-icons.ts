/**
 * @athyper/platform-icons — Entity Icon Registry
 *
 * Maps control.entity.icon_key values to Lucide icon components.
 * The icon_key column uses kebab-case Lucide names (e.g. "shopping-cart").
 *
 * Add new entries here when a new entity is seeded with a novel icon_key.
 * Unknown keys fall back to CircleHelp.
 */
import {
  // ── Supply Chain ──────────────────────────────────────────────────────────
  ShoppingCart,
  Warehouse,
  Truck,
  Package,
  PackageCheck,
  Box,
  Boxes,
  Handshake,
  Radar,
  TrendingUp,
  Route,

  // ── Finance ───────────────────────────────────────────────────────────────
  FileText,
  BookOpen,
  BookOpenCheck,
  Banknote,
  Landmark,
  Receipt,
  ReceiptText,
  Calculator,
  CreditCard,
  PiggyBank,
  Wallet,
  Coins,
  Scale,
  Split,
  Scroll,
  ScrollText,
  List,
  ListChecks,
  ListPlus,
  ListTree,
  ArrowRightLeft,
  BarChart3,
  ChartPie,
  ChartBar,
  CircleDollarSign,
  BadgeDollarSign,
  Percent,
  Repeat2,

  // ── Master / People ───────────────────────────────────────────────────────
  Building,
  Building2,
  Users,
  UsersRound,
  UserCircle,
  UserCog,
  UserPen,
  UserCheck,
  UserPlus,
  UserMinus,
  UserRound,
  User,
  Fingerprint,
  MapPin,
  Award,
  Tag,
  Tags,
  Briefcase,
  BriefcaseBusiness,
  Contact,
  Smile,

  // ── Platform / Governance ─────────────────────────────────────────────────
  ShieldCheck,
  ShieldAlert,
  Shield,
  Blocks,
  LayoutTemplate,
  LayoutDashboard,
  LayoutGrid,
  ClipboardCheck,
  ClipboardList,
  GitBranch,
  GitCommit,
  GitMerge,
  Timer,
  Cable,
  FolderOpen,
  FolderTree,
  FolderKanban,
  Folder,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Bell,
  BellRing,
  AtSign,
  Globe,
  Headset,
  Factory,
  HardHat,
  BadgeCheck,
  Wrench,
  Settings,
  Workflow,
  Gauge,
  Database,
  Network,
  Sparkles,

  // ── Document / Content ────────────────────────────────────────────────────
  FileCode,
  FileSymlink,
  Paperclip,
  Printer,
  Send,
  Share2,
  Filter,
  Search,
  Table,
  Hash,
  Binary,
  Book,
  BookCopy,
  BookMarked,
  Badge,

  // ── Calendar / Time ───────────────────────────────────────────────────────
  Calendar,
  CalendarDays,
  CalendarRange,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  CalendarPlus,
  Clock,
  Clock3,

  // ── UI / Links ────────────────────────────────────────────────────────────
  Link,
  Link2,
  Layers,
  Monitor,
  MousePointer,
  Palette,
  Pencil,
  Sliders,
  SlidersHorizontal,
  Square,
  Star,
  Sun,
  Target,
  Smartphone,

  // ── Access / Security ─────────────────────────────────────────────────────
  Key,
  KeySquare,
  LockOpen,

  // ── Platform & System ─────────────────────────────────────────────────────
  History,
  Activity,
  RadioTower,
  LifeBuoy,
  Lightbulb,
  Mail,
  Phone,
  CirclePlay,
  RefreshCcw,
  CloudUpload,
  Cpu,
  HardDrive,
  SquareFunction,

  // ── Misc ─────────────────────────────────────────────────────────────────
  TriangleAlert,

  // ── Fallback ─────────────────────────────────────────────────────────────
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

const ENTITY_ICON_MAP: Record<string, LucideIcon> = {
  // ── Supply Chain ─────────────────────────────────────────────────────────
  "shopping-cart":      ShoppingCart,
  "warehouse":          Warehouse,
  "truck":              Truck,
  "package":            Package,
  "package-check":      PackageCheck,
  "box":                Box,
  "boxes":              Boxes,
  "handshake":          Handshake,
  "radar":              Radar,
  "trending-up":        TrendingUp,
  "route":              Route,

  // ── Finance ──────────────────────────────────────────────────────────────
  "file-text":          FileText,
  "book-open":          BookOpen,
  "book-open-check":    BookOpenCheck,
  "banknote":           Banknote,
  "landmark":           Landmark,
  "receipt":            Receipt,
  "receipt-tax":        ReceiptText,
  "receipt-text":       ReceiptText,
  "calculator":         Calculator,
  "credit-card":        CreditCard,
  "piggy-bank":         PiggyBank,
  "wallet":             Wallet,
  "coins":              Coins,
  "scale":              Scale,
  "split":              Split,
  "scroll":             Scroll,
  "scroll-text":        ScrollText,
  "list":               List,
  "list-checks":        ListChecks,
  "list-plus":          ListPlus,
  "list-tree":          ListTree,
  "arrow-right-left":   ArrowRightLeft,
  "bar-chart-3":        BarChart3,
  "pie-chart":          ChartPie,
  "chart-bar":          ChartBar,
  "circle-dollar-sign": CircleDollarSign,
  "badge-dollar-sign":  BadgeDollarSign,
  "percent":            Percent,
  "repeat-2":           Repeat2,

  // ── Master / People ──────────────────────────────────────────────────────
  "building":           Building,
  "building-2":         Building2,
  "users":              Users,
  "users-round":        UsersRound,
  "user-circle":        UserCircle,
  "user-cog":           UserCog,
  "user-pen":           UserPen,
  "user-check":         UserCheck,
  "user-plus":          UserPlus,
  "user-minus":         UserMinus,
  "user-round":         UserRound,
  "user":               User,
  "user-tie":           UserRound,   // no UserTie in Lucide 1.x — nearest semantic match
  "fingerprint":        Fingerprint,
  "map-pin":            MapPin,
  "award":              Award,
  "tag":                Tag,
  "tags":               Tags,
  "briefcase":          Briefcase,
  "briefcase-business": BriefcaseBusiness,
  "contact":            Contact,
  "smile":              Smile,

  // ── Platform / Governance ────────────────────────────────────────────────
  "shield-check":       ShieldCheck,
  "shield-alert":       ShieldAlert,
  "shield":             Shield,
  "blocks":             Blocks,
  "layout-template":    LayoutTemplate,
  "layout-dashboard":   LayoutDashboard,
  "layout-grid":        LayoutGrid,
  "clipboard-check":    ClipboardCheck,
  "clipboard-list":     ClipboardList,
  "git-branch":         GitBranch,
  "git-commit":         GitCommit,
  "git-merge":          GitMerge,
  "timer":              Timer,
  "cable":              Cable,
  "folder-open":        FolderOpen,
  "folder-tree":        FolderTree,
  "folder-kanban":      FolderKanban,
  "folder":             Folder,
  "message-circle":     MessageCircle,
  "message-square":     MessageSquare,
  "messages-square":    MessagesSquare,
  "bell":               Bell,
  "bell-ring":          BellRing,
  "bell-cog":           Bell,           // no BellCog in Lucide 1.x
  "at-sign":            AtSign,
  "globe":              Globe,
  "globe-2":            Globe,           // no Globe2 in Lucide 1.x — use Globe
  "headset":            Headset,
  "factory":            Factory,
  "hard-hat":           HardHat,
  "badge-check":        BadgeCheck,
  "wrench":             Wrench,
  "settings":           Settings,
  "workflow":           Workflow,
  "gauge":              Gauge,
  "database":           Database,
  "network":            Network,
  "sparkles":           Sparkles,

  // ── Document / Content ───────────────────────────────────────────────────
  "file-code":          FileCode,
  "file-symlink":       FileSymlink,
  "paperclip":          Paperclip,
  "printer":            Printer,
  "send":               Send,
  "share-2":            Share2,
  "filter":             Filter,
  "search":             Search,
  "table":              Table,
  "hash":               Hash,
  "binary":             Binary,
  "book":               Book,
  "book-copy":          BookCopy,
  "book-marked":        BookMarked,
  "badge":              Badge,

  // ── Calendar / Time ──────────────────────────────────────────────────────
  "calendar":           Calendar,
  "calendar-days":      CalendarDays,
  "calendar-range":     CalendarRange,
  "calendar-check":     CalendarCheck,
  "calendar-clock":     CalendarClock,
  "calendar-off":       CalendarOff,
  "calendar-plus":      CalendarPlus,
  "clock":              Clock,
  "clock-3":            Clock3,

  // ── UI / Links ───────────────────────────────────────────────────────────
  "link":               Link,
  "link-2":             Link2,
  "layers":             Layers,
  "layers-3":           Layers,          // no Layers3 in Lucide 1.x — use Layers
  "monitor":            Monitor,
  "mouse-pointer":      MousePointer,
  "palette":            Palette,
  "pencil":             Pencil,
  "sliders":            Sliders,
  "sliders-horizontal": SlidersHorizontal,
  "square":             Square,
  "star":               Star,
  "sun":                Sun,
  "target":             Target,
  "smartphone":         Smartphone,

  // ── Access / Security ────────────────────────────────────────────────────
  "key":                Key,
  "key-square":         KeySquare,
  "unlock":             LockOpen,        // no Unlock in Lucide 1.x — LockOpen is semantic match

  // ── Platform & System ────────────────────────────────────────────────────
  "history":            History,
  "activity":           Activity,
  "radio-tower":        RadioTower,
  "life-buoy":          LifeBuoy,
  "lightbulb":          Lightbulb,
  "mail":               Mail,
  "phone":              Phone,
  "play-circle":        CirclePlay,      // renamed CirclePlay in Lucide 1.x
  "refresh-ccw":        RefreshCcw,
  "upload-cloud":       CloudUpload,     // renamed CloudUpload in Lucide 1.x
  "cpu":                Cpu,
  "hard-drive":         HardDrive,
  "function-square":    SquareFunction,  // renamed SquareFunction in Lucide 1.x
  "stairs":             TrendingUp,      // no Stairs in Lucide 1.x — TrendingUp for career growth

  // ── Misc ─────────────────────────────────────────────────────────────────
  "triangle-alert":     TriangleAlert,
};

const FALLBACK_ICON: LucideIcon = CircleHelp;

function normalizeIconKey(iconKey: string | null | undefined): string {
  return iconKey?.trim().toLowerCase() ?? "";
}

/**
 * Resolve an entity icon_key string to a Lucide component.
 *
 * @param iconKey - value of control.entity.icon_key (e.g. "shopping-cart")
 * @returns Lucide icon component — never undefined, falls back to CircleHelp
 */
export function getEntityIcon(iconKey: string | null | undefined): LucideIcon {
  return ENTITY_ICON_MAP[normalizeIconKey(iconKey)] ?? FALLBACK_ICON;
}

/** Check if an icon_key has a registered mapping. */
export function hasEntityIcon(iconKey: string | null | undefined): boolean {
  return normalizeIconKey(iconKey) in ENTITY_ICON_MAP;
}
