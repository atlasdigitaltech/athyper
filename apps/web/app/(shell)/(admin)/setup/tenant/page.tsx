"use client";

/**
 * Setup — Tenant Configuration — /setup/tenant
 *
 * Displays company codes and legal entities for the current tenant.
 * Data sourced from existing finance master routes via the relay BFF.
 */

import { useQuery } from "@tanstack/react-query";
import { Building2, Landmark } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Badge, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompanyCode {
  id: string;
  code: string;
  name: string;
  functionalCurrency: string | null;
  legalEntityId: string | null;
}

interface LegalEntity {
  id: string;
  code: string;
  name: string;
  entityType: string | null;
  consolidationMethod: string | null;
  parentEntityId: string | null;
  countryCocde: string | null;  // note: backend typo preserved
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useCompanies() {
  return useQuery<CompanyCode[]>({
    queryKey: ["setup", "companies"],
    queryFn: async () => {
      const res = await fetch("/api/relay/finance/master/companies");
      if (!res.ok) throw new Error("Failed to load companies");
      return res.json() as Promise<CompanyCode[]>;
    },
    staleTime: 60 * 1000,
  });
}

function useLegalEntities() {
  return useQuery<LegalEntity[]>({
    queryKey: ["setup", "legal-entities"],
    queryFn: async () => {
      const res = await fetch("/api/relay/finance/master/entities");
      if (!res.ok) throw new Error("Failed to load legal entities");
      return res.json() as Promise<LegalEntity[]>;
    },
    staleTime: 60 * 1000,
  });
}

// ── Components ────────────────────────────────────────────────────────────────

function CompanyTable({ companies }: { companies: CompanyCode[] }) {
  if (companies.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
        <Building2 className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No company codes configured</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Code</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Currency</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {companies.map((c) => (
            <tr key={c.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2.5 font-mono text-xs font-medium">{c.code}</td>
              <td className="px-3 py-2.5">{c.name}</td>
              <td className="px-3 py-2.5">
                {c.functionalCurrency ? (
                  <Badge variant="secondary" className="font-mono text-doc-support">{c.functionalCurrency}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LegalEntityTable({ entities }: { entities: LegalEntity[] }) {
  if (entities.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
        <Landmark className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No legal entities configured</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Code</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Country</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Consolidation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {entities.map((e) => (
            <tr key={e.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2.5 font-mono text-xs font-medium">{e.code}</td>
              <td className="px-3 py-2.5">{e.name}</td>
              <td className="px-3 py-2.5 capitalize text-muted-foreground">{e.entityType ?? "—"}</td>
              <td className="px-3 py-2.5 font-mono text-xs">{e.countryCocde ?? "—"}</td>
              <td className="px-3 py-2.5 capitalize text-muted-foreground">{e.consolidationMethod ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TenantSetupPage() {
  const { data: companies, isLoading: companiesLoading } = useCompanies();
  const { data: entities, isLoading: entitiesLoading } = useLegalEntities();

  return (
    <PageFrame
      title="Tenant Configuration"
      description="Company codes and legal entity structure"
      width="wide"
    >
      <div className="space-y-6">
        <Tabs defaultValue="companies">
          <TabsList>
            <TabsTrigger value="companies">
              Company Codes
              {companies && companies.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-doc-support px-1.5 py-0">{companies.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="entities">
              Legal Entities
              {entities && entities.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-doc-support px-1.5 py-0">{entities.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="companies" className="mt-4">
            {companiesLoading ? <SectionSkeleton /> : <CompanyTable companies={companies ?? []} />}
          </TabsContent>

          <TabsContent value="entities" className="mt-4">
            {entitiesLoading ? <SectionSkeleton /> : <LegalEntityTable entities={entities ?? []} />}
          </TabsContent>
        </Tabs>
      </div>
    </PageFrame>
  );
}
