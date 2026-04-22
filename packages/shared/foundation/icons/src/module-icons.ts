/**
 * @athyper/icons — Module Icon Registry
 *
 * Maps every Athyper module code to a Lucide icon component.
 * Used by packages/navigation (sidebar menu) and packages/shell (breadcrumbs).
 *
 * Lucide icons render with stroke="currentColor", so they automatically
 * inherit the active theme preset's text color via Tailwind classes.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ BUNDLE NOTE                                                     │
 * │                                                                 │
 * │ Importing this registry statically imports all 39 Lucide icon  │
 * │ components. Lucide icons are lightweight (~200 bytes each after │
 * │ gzip), so the full registry adds roughly 7.8 KB gzipped.       │
 * │                                                                 │
 * │ Do not assume per-tenant icon elimination from tree-shaking:   │
 * │ the registry pattern keeps all icons reachable by the bundler. │
 * │ Optimize only if bundle analysis proves it matters.            │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * To change a module's icon: update the single entry here.
 * To add a new module: add one line to MODULE_ICON_MAP.
 */
import {
  Blocks,
  LayoutTemplate,
  ShieldCheck,
  ClipboardCheck,
  Scale,
  GitBranch,
  Timer,
  FileText,
  Bell,
  Cable,
  FolderOpen,
  MessageCircle,
  Globe,
  Calculator,
  CreditCard,
  Landmark,
  PiggyBank,
  Wallet,
  Handshake,
  Radar,
  ScrollText,
  ShoppingCart,
  Package,
  BadgeCheck,
  Wrench,
  TrendingUp,
  Warehouse,
  Truck,
  Users,
  Receipt,
  Coins,
  FolderKanban,
  Headset,
  Factory,
  Building,
  Building2,
  HardHat,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

/**
 * Module code → Lucide icon mapping.
 * Grouped by workspace for readability.
 * Every module from athyper_Modules is covered.
 */
const MODULE_ICON_MAP: Record<string, LucideIcon> = {
  // ── Platform ────────────────────────────────────────────────
  FND:       Blocks,         // Foundation Runtime
  META:      LayoutTemplate, // Metadata Studio
  IAM:       ShieldCheck,    // Identity & Access Management
  AUD:       ClipboardCheck, // Audit & Governance
  POL:       Scale,          // Policy & Rules Engine
  WFL:       GitBranch,      // Workflow Engine
  JOB:       Timer,          // Automation & Jobs
  DOC:       FileText,       // Document Services
  NTF:       Bell,           // Notification Services
  INT:       Cable,          // Integration Hub
  CMS:       FolderOpen,     // Content Services
  ACT:       MessageCircle,  // Activity & Commentary
  REL:       Globe,          // Platform Shared Data

  // ── Finance ─────────────────────────────────────────────────
  ACC:       Calculator,     // Core Accounting (GL, AP, AR)
  PAY:       CreditCard,     // Payment Processing
  TREASURY:  Landmark,       // Treasury & Cash Management
  BUDGET:    PiggyBank,      // Budget & Funds Control
  PAYG:      Wallet,         // Payment Gateway

  // ── Supply Chain ────────────────────────────────────────────
  SRM:       Handshake,      // Supplier Relationship Management
  SOURCE:    Radar,          // Sourcing Management
  CONTRACT:  ScrollText,     // Contract Management
  BUY:       ShoppingCart,   // Buying (Purchasing, POs)
  INVENTORY: Package,        // Inventory Management
  QMS:       BadgeCheck,     // Quality Management
  SUBCON:    Wrench,         // Subcontracting
  DEMAND:    TrendingUp,     // Demand Forecast & Planning
  WMS:       Warehouse,      // Warehouse Management
  LOGISTICS: Truck,          // Transportation & Logistics

  // ── Customer Experience ─────────────────────────────────────
  CRM:       Users,          // Customer Relationship Management
  SALE:      Receipt,        // Selling

  // ── People Management ───────────────────────────────────────
  HR:        Users,          // Human Resources
  PAYROLL:   Coins,          // Payroll

  // ── Project Management ──────────────────────────────────────
  PRJCOST:   FolderKanban,   // Project Cost Management
  ITSM:      Headset,        // Support & Service Management

  // ── Manufacturing & Operations ──────────────────────────────
  MAINT:     Wrench,         // Maintenance Management
  MFG:       Factory,        // Manufacturing

  // ── Asset Management ────────────────────────────────────────
  ASSET:     Building,       // Asset Management
  ASSETREMS: Building2,      // Real Estate Asset Management
  ASSETFM:   HardHat,        // Facility Management
};

/** Fallback icon for unknown module codes. */
const FALLBACK_ICON: LucideIcon = CircleHelp;

/**
 * Get the icon component for a module code.
 *
 * @param moduleCode - e.g. "ACC", "BUY", "CRM"
 * @returns Lucide icon component — never undefined, falls back to CircleHelp
 */
export function getModuleIcon(moduleCode: string): LucideIcon {
  return MODULE_ICON_MAP[moduleCode] ?? FALLBACK_ICON;
}

/** Check if a module code has a registered icon. */
export function hasModuleIcon(moduleCode: string): boolean {
  return moduleCode in MODULE_ICON_MAP;
}

/** Get all registered module codes. */
export function getRegisteredModuleCodes(): string[] {
  return Object.keys(MODULE_ICON_MAP);
}
