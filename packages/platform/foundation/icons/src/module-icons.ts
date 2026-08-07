/**
 * @athyper/platform-icons — Module Icon Registry
 *
 * Maps every module code across all three application planes to a Lucide icon.
 * Used by navigation sidebars and breadcrumbs in Athyper, Neon, and Mesh.
 *
 * Lucide icons render with stroke="currentColor" so they inherit the active
 * theme preset's text color automatically via Tailwind classes.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ BUNDLE NOTE                                                     │
 * │                                                                 │
 * │ 64 module codes mapped using 60 unique Lucide components.      │
 * │ Lucide icons are lightweight (~200 bytes each after gzip).      │
 * │                                                                 │
 * │ The registry pattern keeps all icons reachable by the bundler. │
 * │ Optimize only if bundle analysis proves it matters.            │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * To change a module's icon: update the single entry here.
 * To add a new module: add one line to MODULE_ICON_MAP.
 */
import {
  // ── AI / Intelligence ────────────────────────────────────────
  Cpu,
  Workflow,
  BookOpen,
  ShieldAlert,

  // ── Platform / Entity / Governance ──────────────────────────
  Blocks,
  LayoutTemplate,
  Scale,
  GitBranch,
  FileText,
  FolderOpen,
  Globe,
  Database,

  // ── Identity / Trust ─────────────────────────────────────────
  ShieldCheck,
  UserPlus,
  ClipboardCheck,

  // ── Plans / Usage ─────────────────────────────────────────────
  Repeat2,
  ListTree,
  Gauge,

  // ── Observability / Reliability ──────────────────────────────
  Activity,
  TriangleAlert,
  RadioTower,

  // ── Communications ────────────────────────────────────────────
  Bell,
  MessageCircle,

  // ── Integration / Jobs ────────────────────────────────────────
  Cable,
  Timer,

  // ── Extensions / Developer ────────────────────────────────────
  Network,
  FileCode,

  // ── Operations / Security / Search ───────────────────────────
  Settings,
  Key,
  Search,
  BarChart3,

  // ── Finance ───────────────────────────────────────────────────
  Calculator,
  CreditCard,
  Landmark,
  PiggyBank,
  Wallet,

  // ── Supply Chain ──────────────────────────────────────────────
  Handshake,
  Radar,
  ScrollText,
  ShoppingCart,
  Package,
  BadgeCheck,
  Share2,
  Wrench,
  TrendingUp,
  Warehouse,
  Truck,

  // ── Commercial / People ───────────────────────────────────────
  Users,
  Receipt,
  UserCog,
  Coins,

  // ── Projects / Services ───────────────────────────────────────
  FolderKanban,
  Headset,

  // ── Manufacturing / Assets ────────────────────────────────────
  Factory,
  Building,
  Building2,
  HardHat,

  // ── Mesh: Partner Collaboration ───────────────────────────────
  ReceiptText,
  Scroll,
  Banknote,
  Route,

  // ── Fallback ─────────────────────────────────────────────────
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

/**
 * Module code → Lucide icon mapping.
 * Organised by plane then workspace for readability.
 */
const MODULE_ICON_MAP: Record<string, LucideIcon> = {

  // ═══════════════════════════════════════════════════════════════
  // ATHYPER PLANE
  // ═══════════════════════════════════════════════════════════════

  // ── Atlas AI Studio ──────────────────────────────────────────
  AIP:      Cpu,            // AI Provider & Model Management
  AGT:      Workflow,       // Agents & Governed Tools
  KNW:      BookOpen,       // Knowledge & Retrieval
  AIG:      ShieldAlert,    // AI Governance & Safety

  // ── Entity Studio ─────────────────────────────────────────────
  META:     LayoutTemplate, // Metadata Studio
  POL:      Scale,          // Policy & Rules Engine
  WFL:      GitBranch,      // Workflow Engine
  DOC:      FileText,       // Document Generation & Processing
  CMS:      FolderOpen,     // Content & Object Storage

  // ── Platform Foundation ───────────────────────────────────────
  FND:      Blocks,         // Foundation Runtime
  REF:      Globe,          // Reference & Shared Data
  CORE:     Database,       // Core Foundation

  // ── TrustIAM Studio ──────────────────────────────────────────
  IAM:      ShieldCheck,    // Identity & Access Management
  ONB:      UserPlus,       // Trust & Onboarding
  AUD:      ClipboardCheck, // Identity Audit & Governance

  // ── Plans & Entitlements Studio ──────────────────────────────
  SUB:      Repeat2,        // Subscription Management (recurring cycle)
  ENT:      ListTree,       // Plan & Module Entitlements
  USG:      Gauge,          // Usage & Quota Management

  // ── Observability Studio ──────────────────────────────────────
  OBS:      Activity,       // Platform Observability
  ERR:      TriangleAlert,  // Error Tracking
  SRE:      RadioTower,     // Service Reliability

  // ── Communications Studio ────────────────────────────────────
  NTF:      Bell,           // Notifications & Messaging
  ACT:      MessageCircle,  // Activity & Commentary

  // ── Integration & Automation Studio ──────────────────────────
  INT:      Cable,          // Integration Hub
  JOB:      Timer,          // Automation & Jobs

  // ── Extension Studio ─────────────────────────────────────────
  EXT:      Network,        // Plugins & Extensions
  DEV:      FileCode,       // Developer Tools & SDK

  // ── Platform Operations Studio ───────────────────────────────
  OPS:      Settings,       // Platform Operations
  SEC:      Key,            // Secrets & Security
  SEA:      Search,         // Search Services
  ANA:      BarChart3,      // Analytics Services

  // ═══════════════════════════════════════════════════════════════
  // NEON PLANE
  // ═══════════════════════════════════════════════════════════════

  // ── Finance ───────────────────────────────────────────────────
  ACC:      Calculator,     // Core Accounting (GL, AP, AR)
  PAY:      CreditCard,     // Payment Processing
  TREASURY: Landmark,       // Treasury & Cash Management
  BUDGET:   PiggyBank,      // Budget & Funds Control
  PAYG:     Wallet,         // Payment Gateway

  // ── Supply Chain ──────────────────────────────────────────────
  SRM:      Handshake,      // Supplier Relationship Management
  SOURCE:   Radar,          // Sourcing
  CONTRACT: ScrollText,     // Contract Management
  BUY:      ShoppingCart,   // Procurement
  INVENTORY:Package,        // Inventory Management
  QMS:      BadgeCheck,     // Quality Management
  SUBCON:   Share2,         // Subcontracting (work shared to external parties)
  DEMAND:   TrendingUp,     // Demand Planning & Forecasting
  WMS:      Warehouse,      // Warehouse Management
  LOGISTICS:Truck,          // Transportation & Logistics

  // ── Commercial ────────────────────────────────────────────────
  CRM:      Users,          // Customer Relationship Management
  SALE:     Receipt,        // Sales & Order Management

  // ── People ────────────────────────────────────────────────────
  HR:       UserCog,        // Human Resources
  PAYROLL:  Coins,          // Payroll

  // ── Projects & Services ───────────────────────────────────────
  PRJCOST:  FolderKanban,   // Project Management
  ITSM:     Headset,        // Service Management

  // ── Operations ────────────────────────────────────────────────
  MAINT:    Wrench,         // Maintenance Management
  MFG:      Factory,        // Manufacturing

  // ── Assets & Facilities ───────────────────────────────────────
  ASSET:    Building,       // Asset Management
  ASSETREMS:Building2,      // Real Estate Asset Management
  ASSETFM:  HardHat,        // Facility Management

  // ═══════════════════════════════════════════════════════════════
  // MESH PLANE
  // ═══════════════════════════════════════════════════════════════

  // ── Partner Collaboration ─────────────────────────────────────
  PCON:     Handshake,      // Proposal & Contract Collaboration
  OMI:      Package,        // Order Intake
  IMO:      ReceiptText,    // Invoice Delivery
  CCON:     Scroll,         // Customer Contract Portal
  SOO:      Truck,          // Sales Order Delivery
  SII:      Banknote,       // Sales Invoice Intake
  LOGX:     Route,          // Logistics Collaboration
};

/** Fallback icon for unknown module codes. */
const FALLBACK_ICON: LucideIcon = CircleHelp;

function normalizeModuleCode(moduleCode: string | null | undefined): string {
  return moduleCode?.trim().toUpperCase() ?? "";
}

/**
 * Get the icon component for a module code.
 *
 * @param moduleCode - e.g. "ACC", "BUY", "AIP", "PCON"
 * @returns Lucide icon component — never undefined, falls back to CircleHelp
 */
export function getModuleIcon(moduleCode: string | null | undefined): LucideIcon {
  return MODULE_ICON_MAP[normalizeModuleCode(moduleCode)] ?? FALLBACK_ICON;
}

/** Check if a module code has a registered icon. */
export function hasModuleIcon(moduleCode: string | null | undefined): boolean {
  return normalizeModuleCode(moduleCode) in MODULE_ICON_MAP;
}

/** Get all registered module codes. */
export function getRegisteredModuleCodes(): string[] {
  return Object.keys(MODULE_ICON_MAP);
}

/**
 * Resolve a module icon — seed-driven (icon_key column) when available,
 * hard-coded fallback otherwise. Both paths use getEntityIcon/getModuleIcon
 * so callers don't need to import both registries.
 *
 * @param code     Module code e.g. "ACC"
 * @param icon_key Value of control.module.icon_key — null until seeded
 * @param getEntityIconFn Injected to avoid circular imports
 */
export function resolveModuleIcon(
  code: string,
  icon_key: string | null | undefined,
  getEntityIconFn: (key: string) => LucideIcon,
): LucideIcon {
  if (icon_key) {
    const seeded = getEntityIconFn(icon_key);
    if (seeded !== CircleHelp) return seeded;
  }
  return MODULE_ICON_MAP[normalizeModuleCode(code)] ?? FALLBACK_ICON;
}
