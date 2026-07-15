import type { PlaneKey } from "@athyper/session-plane";
import { getPublicBrandAssets } from "@athyper/brand";

export type ProductBrandKey = "neon" | "mesh" | "admin";

export interface MarketingSlide {
  label: string;
  navLabel?: string;
  title: string;
  body: string;
  tags: string[];
}

export interface LoginCopy {
  title: string;
  subtitle: string;
  primaryAction: string;
  supportAction?: string;
}

export interface ContextCopy {
  title: string;
  subtitle: string;
}

export interface AuthExperience {
  product: ProductBrandKey;
  logo: {
    dark: string;
    light: string;
  };
  login: LoginCopy;
  context: ContextCopy;
  trustSignals: string[];
  slides: MarketingSlide[];
}

function getLogoAssets(plane: PlaneKey): AuthExperience["logo"] {
  const assets = getPublicBrandAssets(plane);
  return {
    dark: assets.wordmarkBlack,
    light: assets.wordmarkWhite,
  };
}

export const AUTH_EXPERIENCE: Record<PlaneKey, AuthExperience> = {
  neon: {
    product: "neon",
    logo: getLogoAssets("neon"),
    login: {
      title: "Welcome back",
      subtitle: "Sign in to your account",
      primaryAction: "Sign in",
      supportAction: "Platform support access",
    },
    context: {
      title: "Choose business entity",
      subtitle: "Select the legal entity and access mode for this session.",
    },
    trustSignals: ["Security controls aligned", "Tenant isolated", "Audit ready"],
    slides: [
      {
        label: "Finance",
        title: "Master every dollar. Command every decision.",
        body: "Unify accounting, payments, cash flow, budgets, and digital transactions into a single financial command center.",
        tags: ["Accounting", "Payments", "Treasury", "Budgets", "Controls"],
      },
      {
        label: "Supply Chain",
        title: "Orchestrate complexity.",
        body: "Command sourcing, procurement, inventory, warehousing, logistics, and supplier performance through one intelligent backbone.",
        tags: ["Sourcing", "Procurement", "Inventory", "Logistics", "Suppliers"],
      },
      {
        label: "Commercial",
        title: "Turn every conversation into revenue.",
        body: "Capture, nurture, and convert demand with a connected engine across customer engagement, sales, and order execution.",
        tags: ["Engagement", "CRM", "Sales", "Orders", "Revenue"],
      },
      {
        label: "Governance Workbench",
        navLabel: "Governance",
        title: "Turn intake into governed execution.",
        body: "Simplify intake forms, work models, approvals, audit logs, and lifecycle controls without burying teams in platform complexity.",
        tags: ["Intake", "Workmodel", "Approvals", "Audit", "Lifecycle"],
      },
      {
        label: "Operations & Assets",
        navLabel: "Operations",
        title: "Run without interruption. Maximize what you own.",
        body: "Power production, maintenance, facilities, leases, and fixed assets with lifecycle visibility and accountable execution.",
        tags: ["Maintenance", "Facilities", "Leases", "Assets", "Production"],
      },
      {
        label: "People",
        title: "Empower every person. Elevate the organization.",
        body: "Run the workforce lifecycle with intelligent HR and payroll capabilities that keep teams engaged, aligned, and compliant.",
        tags: ["HR", "Payroll", "Workforce", "Compliance", "Benefits"],
      },
    ],
  },
  admin: {
    product: "admin",
    logo: getLogoAssets("admin"),
    login: {
      title: "Console access",
      subtitle: "Restricted access for authorised platform operators",
      primaryAction: "Sign in to console",
    },
    context: {
      title: "Choose administration context",
      subtitle: "Select the internal platform context for this session.",
    },
    trustSignals: ["Security controls aligned", "Tenant isolated", "Audit ready"],
    slides: [
      {
        label: "META Studio",
        navLabel: "META",
        title: "Shape the platform around your business.",
        body: "Model entities, lifecycles, workflows, forms, validations, permissions, and automations through self-service customization.",
        tags: ["Metadata", "Lifecycles", "Forms", "Permissions", "Automation"],
      },
      {
        label: "Data & Storage",
        navLabel: "Data",
        title: "Keep every record fast, durable, and searchable.",
        body: "Operate database, app/session pools, object storage, and search services as a governed data foundation.",
        tags: ["Database", "Pools", "Object Store", "Search", "Retention"],
      },
      {
        label: "Identity & Access",
        navLabel: "Identity",
        title: "Secure every entry point.",
        body: "Control IAM, gateway routing, secret storage, policy boundaries, and platform access through one trusted control plane.",
        tags: ["IAM", "Realms", "MFA", "Gateway", "Secrets"],
      },
      {
        label: "Observability",
        title: "See the platform before users feel it.",
        body: "Unify status watch, error collection, alerting, telemetry, metrics, logging, log shipping, and tracing.",
        tags: ["Metrics", "Logs", "Tracing", "Alerts", "Status"],
      },
      {
        label: "Processing & Messaging",
        navLabel: "Processing",
        title: "Move work reliably at platform scale.",
        body: "Coordinate queues, background jobs, cache services, scheduled tasks, and operational consoles for resilient execution.",
        tags: ["Queues", "Jobs", "Cache", "Schedules", "Consoles"],
      },
      {
        label: "Apps & Render",
        navLabel: "Apps",
        title: "Ship business experiences safely.",
        body: "Manage apps, document parsing, document rendering, mail traps, virus scanning, and platform service automation.",
        tags: ["Apps", "Parser", "Renderer", "Mail", "Virus Scan"],
      },
    ],
  },
  mesh: {
    product: "mesh",
    logo: getLogoAssets("mesh"),
    login: {
      title: "Welcome back",
      subtitle: "Sign in to manage your collaboration",
      primaryAction: "Partner sign in",
    },
    context: {
      title: "Choose collaboration context",
      subtitle: "Select the partner, supplier, or delegated account to continue.",
    },
    trustSignals: ["Security controls aligned", "Tenant isolated", "Audit ready"],
    slides: [
      {
        label: "Sourcing",
        title: "Source smarter. Spend confidently.",
        body: "Discover, onboard, qualify, and collaborate with suppliers across RFx, sourcing events, and shared network flows.",
        tags: ["Sourcing", "RFx", "Onboarding", "Qualification", "Portals"],
      },
      {
        label: "Document Exchange",
        navLabel: "Documents",
        title: "Every invoice. Zero friction.",
        body: "Coordinate purchase orders, invoices, confirmations, exceptions, and partner document exchange with clean visibility.",
        tags: ["Purchase Orders", "Invoices", "Confirmations", "Exceptions", "Documents"],
      },
      {
        label: "Trade Compliance",
        navLabel: "Compliance",
        title: "Trade with trust.",
        body: "Govern certifications, contracts, risk checks, compliance evidence, and supplier obligations across the network.",
        tags: ["Contracts", "Risk", "Evidence", "Certifications", "Obligations"],
      },
      {
        label: "Payments",
        title: "Payments without borders.",
        body: "Support settlement visibility, dispute handling, cross-currency collaboration, and cleaner partner financial workflows.",
        tags: ["Settlement", "Disputes", "Currency", "Remittance", "Visibility"],
      },
      {
        label: "Network Analytics",
        navLabel: "Analytics",
        title: "Your network is your advantage.",
        body: "Measure supplier scorecards, cycle times, exceptions, collaboration quality, and network performance.",
        tags: ["Scorecards", "Analytics", "Risk", "Cycle Times", "Quality"],
      },
    ],
  },
};

export function getAuthExperience(plane: PlaneKey): AuthExperience {
  return AUTH_EXPERIENCE[plane];
}
