/**
 * /finance/setup — Finance Setup Workbench root
 *
 * Resolves the user's default company (first accessible) and redirects to the
 * Company Hub. If the user has no company, renders an empty-state directing to
 * their admin.
 */

import { redirect } from "next/navigation";
import { PageFrame } from "@athyper/surface-kit";
import { Building2 } from "lucide-react";
import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";

interface CompanyRow {
  id:   string;
  code: string;
  name: string;
}

async function loadFirstCompany(): Promise<CompanyRow | null> {
  const session = await getNeonServerSession();
  if (!session) return null;
  try {
    const res = await fetch(buildRuntimeUrl("/api/finance/master/companies"), {
      headers: buildRuntimeHeaders(session),
      cache:   "no-store",
    });
    if (!res.ok) return null;
    const rows = await res.json() as CompanyRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export default async function FinanceSetupRootRoute() {
  const session = await getNeonServerSession();
  if (!session) redirect("/login?next=/finance/setup");

  const home = await loadFirstCompany();
  if (home) {
    redirect(`/finance/setup/company/${encodeURIComponent(home.code)}`);
  }

  return (
    <PageFrame
      eyebrow="Finance Setup"
      title="No company available"
      description="You don't have access to any finance-enabled company yet."
    >
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/70" aria-hidden />
        <p className="font-medium text-foreground">Contact your administrator</p>
        <p className="mt-2">
          Finance Setup surfaces per-company readiness. Ask your finance admin to grant you access to
          a company code, then reload this page.
        </p>
      </div>
    </PageFrame>
  );
}
