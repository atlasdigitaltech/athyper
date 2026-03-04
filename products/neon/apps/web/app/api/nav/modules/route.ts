// app/api/nav/modules/route.ts
//
// Dynamic navigation tree endpoint.
// Returns the workspace > module > entity hierarchy for the active workbench.
//
// In the future, this queries the core.module DB table.
// For now, returns a static fallback tree for development.

import { NextResponse } from "next/server";

import type { NavTree, NavTreeResponse } from "@/lib/nav/nav-types";
import type { NextRequest } from "next/server";

// Static fallback tree used when DB is not available.
// This will be replaced with a DB query in production.
const FALLBACK_TREE: NavTree = {
  workspaces: [
    {
      code: "operations",
      label: "Operations",
      sortOrder: 1,
      modules: [
        {
          code: "procurement",
          label: "Procurement",
          icon: "ShoppingCart",
          sortOrder: 1,
          requiredRole: "neon:MODULE:procurement",
          entities: [
            {
              slug: "supplier",
              label: "Suppliers",
              icon: "Building2",
              sortOrder: 1,
            },
            {
              slug: "purchase-order",
              label: "Purchase Orders",
              icon: "FileText",
              sortOrder: 2,
            },
            {
              slug: "purchase-requisition",
              label: "Purchase Requisitions",
              icon: "ClipboardList",
              sortOrder: 3,
            },
            { slug: "rfq", label: "RFQs", icon: "Send", sortOrder: 4 },
            {
              slug: "contract",
              label: "Contracts",
              icon: "ScrollText",
              sortOrder: 5,
            },
          ],
        },
        {
          code: "inventory",
          label: "Inventory",
          icon: "Package",
          sortOrder: 2,
          requiredRole: "neon:MODULE:inventory",
          entities: [
            { slug: "item", label: "Items", icon: "Box", sortOrder: 1 },
            {
              slug: "warehouse",
              label: "Warehouses",
              icon: "Warehouse",
              sortOrder: 2,
            },
            {
              slug: "stock-transfer",
              label: "Stock Transfers",
              icon: "ArrowRightLeft",
              sortOrder: 3,
            },
          ],
        },
      ],
    },
    {
      code: "finance",
      label: "Finance",
      sortOrder: 2,
      modules: [
        {
          code: "core-accounting",
          label: "Core Accounting",
          icon: "Landmark",
          sortOrder: 1,
          requiredRole: "neon:MODULE:core-accounting",
          entities: [
            {
              slug: "account",
              label: "Accounts",
              icon: "BookOpen",
              sortOrder: 1,
            },
          ],
        },
        {
          code: "accounting",
          label: "Accounting",
          icon: "Calculator",
          sortOrder: 2,
          requiredRole: "neon:MODULE:accounting",
          entities: [
            {
              slug: "invoice",
              label: "Invoices",
              icon: "Receipt",
              sortOrder: 1,
            },
            {
              slug: "payment",
              label: "Payments",
              icon: "CreditCard",
              sortOrder: 2,
            },
            {
              slug: "journal-entry",
              label: "Journal Entries",
              icon: "BookOpen",
              sortOrder: 3,
            },
          ],
        },
      ],
    },
    {
      code: "supply-chain",
      label: "Supply Chain",
      sortOrder: 4,
      modules: [
        {
          code: "customer-experience",
          label: "Customer Experience",
          icon: "Handshake",
          sortOrder: 1,
          requiredRole: "neon:MODULE:customer-experience",
          entities: [
            {
              slug: "purchase-invoice",
              label: "Purchase Invoices",
              icon: "FileText",
              sortOrder: 1,
            },
          ],
        },
      ],
    },
    {
      code: "hr",
      label: "Human Resources",
      sortOrder: 3,
      modules: [
        {
          code: "people",
          label: "People",
          icon: "Users",
          sortOrder: 1,
          requiredRole: "neon:MODULE:people",
          entities: [
            {
              slug: "employee",
              label: "Employees",
              icon: "UserCircle",
              sortOrder: 1,
            },
            {
              slug: "department",
              label: "Departments",
              icon: "Building",
              sortOrder: 2,
            },
            {
              slug: "leave-request",
              label: "Leave Requests",
              icon: "CalendarOff",
              sortOrder: 3,
            },
          ],
        },
      ],
    },
  ],
};

export async function GET(req: NextRequest) {
  const _wb = req.nextUrl.searchParams.get("wb") ?? "user";

  // TODO: Replace with actual DB query to core.module table
  // const modules = await prisma.module.findMany({
  //     where: { workbench: wb, isActive: true },
  //     include: { entities: true, workspace: true },
  //     orderBy: { sortOrder: "asc" },
  // });

  const response: NavTreeResponse = {
    tree: FALLBACK_TREE,
    isFallback: true,
  };

  return NextResponse.json(response);
}
